import 'dart:async';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../providers.dart';

/// One change waiting to reach the server.
class OutboxOp {
  const OutboxOp({
    required this.id,
    required this.kind,
    required this.payload,
    required this.createdAt,
    this.attempts = 0,
    this.error,
  });

  final String id;
  final String kind;
  final Map<String, dynamic> payload;
  final DateTime createdAt;

  /// How many sends may have reached the server. More than zero means the server may already
  /// have it, so a retry has to check before sending again.
  final int attempts;

  /// Set when the server refused it for good; it then waits for the user to retry or discard.
  final String? error;

  bool get failed => error != null;

  OutboxOp copyWith({Map<String, dynamic>? payload, int? attempts, String? error, bool clearError = false}) =>
      OutboxOp(
        id: id,
        kind: kind,
        payload: payload ?? this.payload,
        createdAt: createdAt,
        attempts: attempts ?? this.attempts,
        error: clearError ? null : (error ?? this.error),
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'kind': kind,
    'payload': payload,
    'createdAt': createdAt.toIso8601String(),
    'attempts': attempts,
    if (error != null) 'error': error,
  };

  static OutboxOp fromJson(Map<String, dynamic> j) => OutboxOp(
    id: j['id'] as String,
    kind: j['kind'] as String,
    payload: Map<String, dynamic>.from(j['payload'] as Map),
    createdAt: DateTime.parse(j['createdAt'] as String),
    attempts: j['attempts'] as int? ?? 0,
    error: j['error'] as String?,
  );

  static String newId() {
    final r = Random.secure();
    return List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  }
}

/// Sends one op. Throw [ApiException]: transient kinds keep the op queued, others mark it failed.
typedef OutboxExecutor = Future<void> Function(OutboxOp op);

/// A persistent, ordered queue of writes made while the server was out of reach.
///
/// Ops are sent oldest first, one at a time. A transient failure stops the run and schedules a
/// retry; a refusal from the API parks that op and moves on.
class Outbox extends Notifier<List<OutboxOp>> {
  static const _key = 'outbox';
  static const _backoff = [5, 15, 30, 60];

  OutboxExecutor? _executor;
  void Function()? _onSent;
  Future<void>? _flushing;
  int _retryStep = 0;
  Timer? _timer;

  @override
  List<OutboxOp> build() {
    ref.onDispose(() => _timer?.cancel());
    final raw = ref.watch(jsonStoreProvider).read(_key);
    if (raw is! List) return const [];
    try {
      return [for (final j in raw) OutboxOp.fromJson(Map<String, dynamic>.from(j as Map))];
    } catch (_) {
      return const [];
    }
  }

  /// The app wires in how ops are sent, and what to do after one lands.
  void configure({required OutboxExecutor executor, void Function()? onSent}) {
    _executor = executor;
    _onSent = onSent;
  }

  int get pendingCount => state.where((o) => !o.failed).length;

  void _set(List<OutboxOp> ops) {
    state = ops;
    ref.read(jsonStoreProvider).write(_key, [for (final o in ops) o.toJson()]);
  }

  void add(OutboxOp op) => _set([...state, op]);

  void replace(OutboxOp op) => _set([for (final o in state) o.id == op.id ? op : o]);

  void remove(String id) => _set([for (final o in state) if (o.id != id) o]);

  void retry(String id) {
    _set([for (final o in state) o.id == id ? o.copyWith(clearError: true) : o]);
    unawaited(flush());
  }

  /// Send everything that can be sent. Safe to call often; concurrent calls share one run, and
  /// a change queued while it runs is picked up by that same run.
  Future<void> flush() => _flushing ??= _run().whenComplete(() => _flushing = null);

  Future<void> _run() async {
    final executor = _executor;
    if (executor == null) return;
    _timer?.cancel();
    var sentAny = false;
    try {
      while (true) {
        final op = state.where((o) => !o.failed).firstOrNull;
        if (op == null) break;
        // Counted before sending, and saved, so that a crash or a lost answer mid-request still
        // leaves a trace. The executor sees the count from before this attempt.
        replace(op.copyWith(attempts: op.attempts + 1));
        try {
          await executor(op);
          if (!ref.mounted) return;
          remove(op.id);
          sentAny = true;
          _retryStep = 0;
        } on ApiException catch (e) {
          if (!ref.mounted) return;
          final current = state.where((o) => o.id == op.id).firstOrNull;
          if (current == null) continue; // discarded while in flight
          // A server error is retried a few times, then parked so it cannot block the queue.
          final giveUp = e.kind == ApiFailure.http && current.attempts >= 3;
          if (e.isTransient && !giveUp) {
            // It provably never arrived: this attempt does not count.
            if (!e.maybeDelivered) replace(current.copyWith(attempts: op.attempts));
            _scheduleRetry();
            break;
          }
          replace(current.copyWith(error: e.message));
        } catch (_) {
          if (!ref.mounted) return;
          final current = state.where((o) => o.id == op.id).firstOrNull;
          if (current != null) replace(current.copyWith(error: 'Could not be sent.'));
        }
      }
    } finally {
      if (sentAny && ref.mounted) _onSent?.call();
    }
  }

  void _scheduleRetry() {
    final seconds = _backoff[min(_retryStep, _backoff.length - 1)];
    _retryStep++;
    _timer?.cancel();
    _timer = Timer(Duration(seconds: seconds), () => unawaited(flush()));
  }
}

final outboxProvider = NotifierProvider<Outbox, List<OutboxOp>>(Outbox.new);
