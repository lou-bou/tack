import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';

import 'model.dart';

/// The server speaks a newer protocol, so this app has to be updated first.
class OutdatedClient implements Exception {
  const OutdatedClient();
}

/// Typed calls to the Tack API (server/src/routes). All go through kit's [ApiClient]: the
/// Cloudflare Access service token on every request, no redirects, failures classified.
class TackApi {
  TackApi(this._c);
  final ApiClient _c;

  static const healthPath = '/api/health';
  static bool isHealthy(dynamic json) => json is Map && json['ok'] == true;

  Future<T> _versioned<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on ApiException catch (e) {
      if (e.status == 426) throw const OutdatedClient();
      rethrow;
    }
  }

  Future<Json> push(List<Json> changes) => _versioned(
    () async => Map<String, Object?>.from(
      await _c.post('/api/sync/push', body: {'protocol': protocolVersion, 'changes': changes}) as Map,
    ),
  );

  Future<Json> pull(int since) => _versioned(
    () async => Map<String, Object?>.from(
      await _c.get('/api/sync/pull', query: {'since': since, 'protocol': protocolVersion}) as Map,
    ),
  );

  /// "Something changed" signals; each one is followed by a normal pull.
  Stream<String> events() => _c.events('/api/events');
}

final tackApiProvider = Provider<TackApi>((ref) => TackApi(ref.watch(apiClientProvider)));
