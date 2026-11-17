import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';

import 'api.dart';
import 'store.dart';

enum SyncState { syncing, synced, offline, accessDenied, outdated, error, notConfigured }

class SyncStatus {
  const SyncStatus({this.state = SyncState.syncing, this.lastSyncAt, this.message});
  final SyncState state;
  final DateTime? lastSyncAt;
  final String? message;

  /// Something is holding the queue back, so unsent edits are worth showing.
  bool get stalled => state != SyncState.syncing && state != SyncState.synced;
}

const pushBatch = 200;

/// Sends the queue, then fetches what changed (web/src/data/engine.ts in Dart). The server is
/// the only place conflicts get decided: what comes back replaces the local row, except for
/// fields this phone still has queued. Once the queue is empty, the phone holds exactly what the
/// server holds.
///
/// Safe to repeat: the server merges by field clock, so a batch sent twice changes nothing, and
/// an entry leaves the outbox only after the server answered for it.
class SyncEngine extends Notifier<SyncStatus> {
  Future<void>? _running;
  bool _again = false;

  TackApi get _api => ref.read(tackApiProvider);
  TackStore get _store => ref.read(storeProvider.notifier);

  @override
  SyncStatus build() => const SyncStatus();

  /// One run at a time. A request during a run causes exactly one more afterwards.
  Future<void> sync() {
    if (_running != null) {
      _again = true;
      return _running!;
    }
    _running = () async {
      try {
        var runs = 0;
        do {
          _again = false;
          await _runOnce();
        } while (_again && ++runs < 5 && ref.mounted);
      } finally {
        _running = null;
      }
    }();
    return _running!;
  }

  void _set(SyncState s, {String? message}) {
    if (!ref.mounted) return;
    state = SyncStatus(
      state: s,
      lastSyncAt: s == SyncState.synced
          ? DateTime.fromMillisecondsSinceEpoch(ref.read(wallClockProvider)(), isUtc: true)
          : state.lastSyncAt,
      message: message,
    );
  }

  Future<void> _runOnce() async {
    if (ref.read(connectionProvider) == null) {
      _set(SyncState.notConfigured);
      return;
    }
    if (state.state != SyncState.synced) _set(SyncState.syncing);
    try {
      await _push();
      await _pull();
      if (!ref.mounted) return;
      if (ref.read(storeProvider).outbox.isNotEmpty) _again = true;
      _set(SyncState.synced);
    } on OutdatedClient {
      _again = false;
      _set(SyncState.outdated);
    } on ApiException catch (e) {
      _again = false;
      _set(switch (e.kind) {
        ApiFailure.accessDenied => SyncState.accessDenied,
        ApiFailure.notConfigured => SyncState.notConfigured,
        ApiFailure.network || ApiFailure.serverDown => SyncState.offline,
        _ => SyncState.error,
      }, message: e.message);
    } catch (e) {
      _again = false;
      _set(SyncState.error, message: '$e');
    }
  }

  Future<void> _push() async {
    for (var round = 0; round < 50; round++) {
      final batch = _store.outboxBatch(pushBatch);
      if (batch.isEmpty || !ref.mounted) return;
      final res = await _api.push(batch);
      if (!ref.mounted) return;
      _store.syncWall((res['serverTime'] as num).toInt());
      await _store.acknowledge(batch, res['rejected'] as List? ?? const []);
    }
  }

  Future<void> _pull() async {
    if (!ref.mounted) return;
    final before = ref.read(storeProvider);
    var res = await _api.pull(before.seq ?? 0);
    if (!ref.mounted) return;
    if (before.seq != null && ((res['epoch'] as num?)?.toInt() ?? 0) != before.epoch) {
      // The server was restored from a backup: its sequence numbers went back in time, so
      // start over from what it holds now.
      await _store.forgetSyncedRows();
      if (ref.read(storeProvider).outbox.isNotEmpty) _again = true;
      res = await _api.pull(0);
      if (!ref.mounted) return;
    }
    _store.syncWall((res['serverTime'] as num).toInt());
    await _store.applyPull(res);
  }
}

final syncProvider = NotifierProvider<SyncEngine, SyncStatus>(SyncEngine.new);
