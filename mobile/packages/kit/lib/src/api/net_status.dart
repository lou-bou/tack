import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_exception.dart';

/// What the last requests say about reaching the server.
enum NetState {
  /// No request has finished yet this session.
  unknown,
  ok,

  /// The phone has no route to the server.
  offline,

  /// Cloudflare is reachable but the server behind it is not.
  serverDown,

  /// Cloudflare Access refused the service token.
  accessDenied,
}

class NetStatus extends Notifier<NetState> {
  @override
  NetState build() => NetState.unknown;

  void report(ApiFailure? failure) {
    final next = switch (failure) {
      null || ApiFailure.http || ApiFailure.badResponse => NetState.ok,
      ApiFailure.network => NetState.offline,
      ApiFailure.serverDown => NetState.serverDown,
      ApiFailure.accessDenied => NetState.accessDenied,
      ApiFailure.notConfigured => state,
    };
    if (next != state) state = next;
  }
}

final netStatusProvider = NotifierProvider<NetStatus, NetState>(NetStatus.new);
