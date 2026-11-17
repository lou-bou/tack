import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the server is and the Cloudflare Access service token that opens it.
class ServerConnection {
  const ServerConnection({
    required this.baseUrl,
    this.clientId = '',
    this.clientSecret = '',
  });

  /// Scheme + host (+ optional port/path prefix), no trailing slash.
  final String baseUrl;
  final String clientId;
  final String clientSecret;

  bool get hasToken => clientId.isNotEmpty && clientSecret.isNotEmpty;

  Map<String, String> get authHeaders => hasToken
      ? {'CF-Access-Client-Id': clientId, 'CF-Access-Client-Secret': clientSecret}
      : const {};

  Map<String, dynamic> toJson() => {
    'url': baseUrl,
    'clientId': clientId,
    'clientSecret': clientSecret,
  };

  static ServerConnection? fromJson(Object? json) {
    if (json is! Map) return null;
    final url = json['url'];
    if (url is! String || url.trim().isEmpty) return null;
    return ServerConnection(
      baseUrl: normalizeUrl(url),
      clientId: (json['clientId'] as String? ?? '').trim(),
      clientSecret: (json['clientSecret'] as String? ?? '').trim(),
    );
  }

  /// "cairn.example.com/" → "https://cairn.example.com".
  static String normalizeUrl(String input) {
    var s = input.trim();
    if (s.isEmpty) return s;
    if (!s.contains('://')) s = 'https://$s';
    while (s.endsWith('/')) {
      s = s.substring(0, s.length - 1);
    }
    return s;
  }

  /// Null when the URL is usable, otherwise what is wrong with it.
  static String? validateUrl(String input) {
    final s = normalizeUrl(input);
    if (s.isEmpty) return 'Enter the server address';
    final uri = Uri.tryParse(s);
    if (uri == null || uri.host.isEmpty || !(uri.scheme == 'https' || uri.scheme == 'http')) {
      return 'That is not a valid address';
    }
    return null;
  }

  /// A setup string that can be copied from one app and pasted into another:
  /// the JSON of [toJson], or loose "CF-Access-Client-Id: …" lines.
  static ServerConnection? parseSetup(String text) {
    final t = text.trim();
    if (t.isEmpty) return null;
    if (t.startsWith('{')) {
      try {
        return fromJson(jsonDecode(t));
      } catch (_) {
        return null;
      }
    }
    String? grab(RegExp re) => re.firstMatch(t)?.group(1)?.trim();
    final id = grab(RegExp(r'CF-Access-Client-Id["\s:=]+([A-Za-z0-9._-]+)', caseSensitive: false));
    final secret = grab(
      RegExp(r'CF-Access-Client-Secret["\s:=]+([A-Za-z0-9._-]+)', caseSensitive: false),
    );
    final url = grab(RegExp(r'(https?://[^\s"]+)'));
    if (id == null && secret == null && url == null) return null;
    return ServerConnection(
      baseUrl: url == null ? '' : normalizeUrl(url),
      clientId: id ?? '',
      clientSecret: secret ?? '',
    );
  }

  String toSetupString() => jsonEncode(toJson());
}

abstract class ConnectionStore {
  Future<ServerConnection?> load();
  Future<void> save(ServerConnection connection);
  Future<void> clear();
}

/// Keeps the connection in the platform keystore (Android Keystore / iOS Keychain).
class SecureConnectionStore implements ConnectionStore {
  SecureConnectionStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'kit.connection';
  final FlutterSecureStorage _storage;

  @override
  Future<ServerConnection?> load() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null) return null;
      return ServerConnection.fromJson(jsonDecode(raw));
    } catch (_) {
      // A keystore that can no longer decrypt (restored backup, cleared lock screen) means
      // setting up again, not crashing at launch.
      return null;
    }
  }

  @override
  Future<void> save(ServerConnection connection) =>
      _storage.write(key: _key, value: jsonEncode(connection.toJson()));

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

class MemoryConnectionStore implements ConnectionStore {
  MemoryConnectionStore([this.value]);
  ServerConnection? value;

  @override
  Future<ServerConnection?> load() async => value;

  @override
  Future<void> save(ServerConnection connection) async => value = connection;

  @override
  Future<void> clear() async => value = null;
}
