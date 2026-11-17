import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import 'api_exception.dart';
import 'connection.dart';

/// JSON API client for a server behind Cloudflare Access.
///
/// Auth is the service token on every request, nothing else: no cookies, no browser, and
/// redirects are never followed. Anything that looks like Access asking for a login is reported
/// as [ApiFailure.accessDenied] so the app can say so instead of looking offline.
class ApiClient {
  ApiClient({
    required ServerConnection? Function() connection,
    Dio? dio,
    this.onOutcome,
  }) : _connection = connection,
       _dio = dio ?? Dio() {
    _dio.options
      ..connectTimeout = const Duration(seconds: 8)
      ..sendTimeout = const Duration(seconds: 20)
      ..receiveTimeout = const Duration(seconds: 20)
      ..followRedirects = false
      ..responseType = ResponseType.plain
      ..validateStatus = (_) => true;
  }

  final ServerConnection? Function() _connection;
  final Dio _dio;

  /// Called after every request: null on success, the failure kind otherwise.
  final void Function(ApiFailure? failure)? onOutcome;

  Future<dynamic> get(String path, {Map<String, Object?>? query}) =>
      _send('GET', path, query: query);

  Future<dynamic> post(String path, {Object? body, Map<String, Object?>? query}) =>
      _send('POST', path, body: body ?? const <String, dynamic>{}, query: query);

  Future<dynamic> put(String path, {Object? body}) => _send('PUT', path, body: body);

  Future<dynamic> delete(String path) => _send('DELETE', path);

  /// For endpoints that return a file (CSV), not JSON.
  Future<String> getText(String path, {Map<String, Object?>? query}) async =>
      await _send('GET', path, query: query, json: false) as String;

  /// Downloads a file (an image, an attachment). Null when the server has no such file (404).
  Future<Uint8List?> getBytes(String path, {Duration timeout = const Duration(seconds: 60)}) async {
    try {
      final res = await _withAuth((conn) => _dio.request<List<int>>(
        '${conn.baseUrl}$path',
        options: Options(
          method: 'GET',
          headers: conn.authHeaders,
          responseType: ResponseType.bytes,
          receiveTimeout: timeout,
        ),
      ));
      final status = res.statusCode ?? 0;
      if (status == 404) {
        onOutcome?.call(null);
        return null;
      }
      final type = res.headers.value('content-type') ?? '';
      if (status >= 200 && status < 300 && type.startsWith('text/html')) {
        // Cloudflare Access answered with its login page instead of the file.
        throw const ApiException(ApiFailure.accessDenied, accessDeniedMessage, maybeDelivered: false);
      }
      if (status < 200 || status >= 300) {
        _interpret(
          Response<String>(requestOptions: res.requestOptions, statusCode: status, data: ''),
          json: true,
        );
      }
      onOutcome?.call(null);
      return Uint8List.fromList(res.data ?? const []);
    } on ApiException catch (e) {
      onOutcome?.call(e.kind);
      rethrow;
    }
  }

  /// Uploads raw bytes (PUT) with a content type, e.g. an image addressed by its hash.
  Future<dynamic> putBytes(
    String path,
    Uint8List bytes, {
    required String contentType,
    Map<String, String> headers = const {},
    Duration timeout = const Duration(minutes: 5),
  }) async {
    try {
      final res = await _withAuth((conn) => _dio.request<String>(
        '${conn.baseUrl}$path',
        data: Stream.fromIterable([bytes]),
        options: Options(
          method: 'PUT',
          headers: {
            ...conn.authHeaders,
            ...headers,
            'Accept': 'application/json',
            'Content-Type': contentType,
            'Content-Length': bytes.length,
          },
          sendTimeout: timeout,
          receiveTimeout: timeout,
        ),
      ));
      final out = _interpret(res, json: true);
      onOutcome?.call(null);
      return out;
    } on ApiException catch (e) {
      onOutcome?.call(e.kind);
      rethrow;
    }
  }

  /// Server-sent events from [path]: yields the `data:` payload of each event. The stream ends
  /// (or errors with an [ApiException]) when the connection drops; callers reconnect.
  Stream<String> events(String path) async* {
    final Response<ResponseBody> res;
    try {
      res = await _withAuth((conn) => _dio.request<ResponseBody>(
        '${conn.baseUrl}$path',
        options: Options(
          method: 'GET',
          headers: {...conn.authHeaders, 'Accept': 'text/event-stream'},
          responseType: ResponseType.stream,
          receiveTimeout: Duration.zero,
        ),
      ));
    } on ApiException catch (e) {
      onOutcome?.call(e.kind);
      rethrow;
    }
    final status = res.statusCode ?? 0;
    final type = res.headers.value('content-type') ?? '';
    if (status != 200 || !type.contains('text/event-stream')) {
      final e = status >= 300 && status < 400 || status == 401 || status == 403 || type.contains('html')
          ? const ApiException(ApiFailure.accessDenied, accessDeniedMessage, maybeDelivered: false)
          : ApiException(ApiFailure.serverDown, 'Live updates are not available.', status: status);
      onOutcome?.call(e.kind);
      throw e;
    }
    onOutcome?.call(null);
    final data = StringBuffer();
    final lines = res.data!.stream
        .cast<List<int>>()
        .transform(utf8.decoder)
        .transform(const LineSplitter());
    try {
      await for (final line in lines) {
        if (line.isEmpty) {
          if (data.isNotEmpty) yield data.toString();
          data.clear();
        } else if (line.startsWith('data:')) {
          if (data.isNotEmpty) data.write('\n');
          data.write(line.substring(5).trimLeft());
        }
      }
    } on DioException catch (e) {
      throw _fromDio(e);
    }
  }

  Future<Response<T>> _withAuth<T>(Future<Response<T>> Function(ServerConnection conn) send) async {
    final conn = _connection();
    if (conn == null || conn.baseUrl.isEmpty) {
      throw const ApiException(
        ApiFailure.notConfigured,
        'Set up the server connection first.',
        maybeDelivered: false,
      );
    }
    try {
      return await send(conn);
    } on DioException catch (e) {
      throw _fromDio(e);
    }
  }

  /// One-off check used by the setup screen before anything is saved.
  static Future<dynamic> probe(ServerConnection connection, String path, {Dio? dio}) =>
      ApiClient(connection: () => connection, dio: dio).get(path);

  Future<dynamic> _send(
    String method,
    String path, {
    Object? body,
    Map<String, Object?>? query,
    bool json = true,
  }) async {
    try {
      final result = await _request(method, path, body: body, query: query, json: json);
      onOutcome?.call(null);
      return result;
    } on ApiException catch (e) {
      onOutcome?.call(e.kind);
      rethrow;
    }
  }

  Future<dynamic> _request(
    String method,
    String path, {
    Object? body,
    Map<String, Object?>? query,
    required bool json,
  }) async {
    final conn = _connection();
    if (conn == null || conn.baseUrl.isEmpty) {
      throw const ApiException(
        ApiFailure.notConfigured,
        'Set up the server connection first.',
        maybeDelivered: false,
      );
    }
    final cleanQuery = <String, dynamic>{
      for (final e in (query ?? const <String, Object?>{}).entries)
        if (e.value != null && e.value.toString().isNotEmpty) e.key: e.value.toString(),
    };

    final Response<String> res;
    try {
      res = await _dio.request<String>(
        '${conn.baseUrl}$path',
        data: body == null ? null : jsonEncode(body),
        queryParameters: cleanQuery.isEmpty ? null : cleanQuery,
        options: Options(
          method: method,
          headers: {
            ...conn.authHeaders,
            'Accept': 'application/json',
            if (body != null) 'Content-Type': 'application/json',
          },
        ),
      );
    } on DioException catch (e) {
      throw _fromDio(e);
    }
    return _interpret(res, json: json);
  }

  static ApiException _fromDio(DioException e) {
    if (e.type == DioExceptionType.badCertificate || e.error is HandshakeException) {
      return const ApiException(
        ApiFailure.network,
        "Couldn't make a secure connection to the server.",
        maybeDelivered: false,
      );
    }
    return ApiException(
      ApiFailure.network,
      "Can't reach the server. Check your connection.",
      // Failing to connect means nothing was sent. A timeout after connecting does not.
      maybeDelivered:
          e.type != DioExceptionType.connectionError &&
          e.type != DioExceptionType.connectionTimeout,
    );
  }

  static const accessDeniedMessage =
      'Cloudflare Access did not accept the service token. Check it in Settings → Connection.';

  static dynamic _interpret(Response<String> res, {required bool json}) {
    final status = res.statusCode ?? 0;
    final text = res.data ?? '';
    final looksLikeAccess =
        text.contains('cloudflareaccess.com') || text.contains('Cloudflare Access');

    // Access answers an unauthenticated request with a redirect to its login page (browsers) or
    // a 401/403. The API itself never redirects and has no auth of its own.
    if (status >= 300 && status < 400 || status == 401 || status == 403) {
      throw ApiException(
        ApiFailure.accessDenied,
        accessDeniedMessage,
        status: status,
        maybeDelivered: false,
      );
    }
    if (status == 502 || status == 503 || status == 504 || (status >= 520 && status <= 530)) {
      throw ApiException(
        ApiFailure.serverDown,
        'The server is not answering right now.',
        status: status,
      );
    }

    if (status >= 200 && status < 300) {
      if (!json) {
        if (looksLikeAccess && text.trimLeft().startsWith('<')) {
          throw ApiException(ApiFailure.accessDenied, accessDeniedMessage, status: status);
        }
        return text;
      }
      if (text.isEmpty) return null;
      try {
        return jsonDecode(text);
      } catch (_) {
        if (looksLikeAccess) {
          throw ApiException(ApiFailure.accessDenied, accessDeniedMessage, status: status);
        }
        throw ApiException(
          ApiFailure.badResponse,
          'The server sent something unexpected. Is the address right?',
          status: status,
        );
      }
    }

    Object? data;
    try {
      data = text.isEmpty ? null : jsonDecode(text);
    } catch (_) {
      data = null;
    }
    if (data is Map && data['error'] is String) {
      final rawFields = data['fields'];
      throw ApiException(
        ApiFailure.http,
        data['error'] as String,
        status: status,
        fields: rawFields is Map
            ? {for (final e in rawFields.entries) '${e.key}': '${e.value}'}
            : const {},
      );
    }
    if (status == 404 && data == null) {
      throw ApiException(
        ApiFailure.badResponse,
        'The server sent something unexpected. Is the address right?',
        status: status,
      );
    }
    throw ApiException(ApiFailure.http, 'Request failed ($status)', status: status);
  }
}
