/// Test helpers: a fake HTTP layer so API code can be exercised without a network.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// What the fake server answers: a status, a body (JSON-encoded unless a String) and headers.
class FakeResponse {
  const FakeResponse(this.status, [this.body, this.headers = const {}]);
  final int status;
  final Object? body;
  final Map<String, String> headers;
}

/// Thrown by a handler to simulate the phone having no route to the server.
class FakeOffline implements Exception {
  const FakeOffline();
}

/// Thrown by a handler to simulate a request that was sent but whose answer never arrived.
class FakeLostResponse implements Exception {
  const FakeLostResponse();
}

typedef FakeHandler = FutureOr<FakeResponse> Function(RequestOptions request, Object? jsonBody);

/// A Dio adapter that hands every request to [handler] and records it.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handler);

  FakeHandler handler;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final data = options.data;
    final FakeResponse res;
    try {
      res = await handler(options, data is String && data.isNotEmpty ? jsonDecode(data) : null);
    } on FakeOffline {
      throw DioException.connectionError(requestOptions: options, reason: 'offline (fake)');
    } on FakeLostResponse {
      throw DioException.receiveTimeout(
        timeout: const Duration(seconds: 20),
        requestOptions: options,
      );
    }
    final body = res.body;
    final text = body == null ? '' : (body is String ? body : jsonEncode(body));
    return ResponseBody.fromString(
      text,
      res.status,
      headers: {
        'content-type': [body is String ? 'text/html' : 'application/json'],
        for (final e in res.headers.entries) e.key: [e.value],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Dio fakeDio(FakeAdapter adapter) => Dio()..httpClientAdapter = adapter;
