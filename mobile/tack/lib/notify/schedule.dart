import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';

import '../data/dates.dart';
import '../data/hlc.dart';
import '../data/selection.dart';
import '../data/store.dart';
import 'notifier.dart';

/// Whether due notifications are on for this phone (a device preference, off until enabled).
const notifyPref = 'notifications';

/// Android keeps at most 500 alarms per app; this is plenty for one person's next few weeks.
const maxScheduled = 60;

class Planned {
  const Planned({
    required this.id,
    required this.key,
    required this.cardId,
    required this.atMs,
    required this.title,
    required this.body,
  });
  final int id;

  /// `cardId:dueKey`: one notification per due date value.
  final String key;
  final String cardId;
  final int atMs;
  final String title;
  final String body;

  String get signature => '$atMs|$title|$body';
}

/// A stable 31-bit id for a notification (FNV-1a over its key).
int notificationId(String key) {
  var h = 0x811c9dc5;
  for (final c in key.codeUnits) {
    h ^= c;
    h = (h * 0x01000193) & 0xffffffff;
  }
  return h & 0x7fffffff;
}

/// The server's rule (SPEC §3.8, server/src/notifications.ts and sync.ts), applied on the phone:
/// one notification per open, live card when its due moment is 24 hours away (09:00 the day
/// before for a date-only due date). A date set after that moment never notifies.
///
/// Returns what to schedule ([later]) and what should have fired while the phone didn't know
/// about the card ([late]: not yet due, and not in [done]).
({List<Planned> later, List<Planned> late}) planDueNotifications(Library lib, int now, Set<String> done) {
  final later = <Planned>[];
  final late = <Planned>[];
  for (final card in lib.cards.values) {
    final due = card.due;
    if (due == null || card.completed || !isCardLive(card, lib.lists, lib.boards)) continue;
    final at = notifyAt(due);
    final clock = card.dueClock;
    // Goes by when the date was set, not when it arrived here.
    if (clock == null || hlcMs(clock) >= at) continue;
    if (isOverdue(due, now)) continue;
    final key = '${card.id}:${dueKey(due)}';
    if (done.contains(key)) continue;
    final planned = Planned(
      id: notificationId(key),
      key: key,
      cardId: card.id,
      atMs: at,
      title: card.title,
      // Worded for the moment it is shown.
      body: notificationBody(due, at > now ? at : now),
    );
    (at > now ? later : late).add(planned);
  }
  later.sort((a, b) => a.atMs != b.atMs ? a.atMs.compareTo(b.atMs) : a.key.compareTo(b.key));
  return (later: later.take(maxScheduled).toList(), late: late);
}

/// Keeps the phone's scheduled notifications in step with the cards: recomputed after every
/// sync and every edit. Nothing here talks to a server.
class NotificationScheduler {
  NotificationScheduler(this.ref);
  final Ref ref;

  static const _key = 'notify';
  Timer? _debounce;
  Future<void> _running = Future.value();

  void start() {
    ref.listen(storeProvider, (previous, next) => _soon());
    ref.listen(prefsProvider.select((p) => p[notifyPref]), (previous, next) => _soon());
    ref.onDispose(() => _debounce?.cancel());
    _soon();
  }

  void _soon() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 800), () => unawaited(reschedule()));
  }

  /// One run at a time, in order.
  Future<void> reschedule() => _running = _running.catchError((_) {}).then((_) => _run());

  Future<void> _run() async {
    if (!ref.mounted) return;
    final notifier = ref.read(dueNotifierProvider);
    final store = ref.read(storeProvider.notifier);
    final lib = ref.read(storeProvider);
    final now = ref.read(wallClockProvider)();
    final enabled = ref.read(prefsProvider)[notifyPref] == true;

    final saved = await store.readLocal(_key);
    if (!ref.mounted) return;
    final state = saved is Map ? saved : const {};
    // What is scheduled on the phone right now: id → {key, sig, at}.
    final scheduled = <String, Map<String, Object?>>{
      for (final e in (state['scheduled'] as Map? ?? const {}).entries)
        '${e.key}': Map<String, Object?>.from(e.value as Map),
    };
    // Due values already notified: key → when, so old ones can be dropped.
    final done = <String, int>{
      for (final e in (state['done'] as Map? ?? const {}).entries) '${e.key}': (e.value as num).toInt(),
    };

    // An alarm whose time has passed has fired.
    scheduled.removeWhere((id, s) {
      final at = (s['at'] as num).toInt();
      if (at > now) return false;
      done[s['key'] as String] = at;
      return true;
    });
    done.removeWhere((_, at) => now - at > 60 * dayMs);

    if (!enabled) {
      for (final id in scheduled.keys) {
        await notifier.cancel(int.parse(id));
      }
      scheduled.clear();
    } else {
      final plan = planDueNotifications(lib, now, done.keys.toSet());
      // The first look at a phone's data (a new install, or notifications just turned on)
      // would otherwise announce everything due in the next day at once.
      final quiet = state['seen'] != true;
      for (final p in plan.late) {
        done[p.key] = now;
        if (!quiet) await notifier.show(id: p.id, title: p.title, body: p.body, cardId: p.cardId);
      }
      final wanted = {for (final p in plan.later) '${p.id}': p};
      for (final id in scheduled.keys.toList()) {
        if (!wanted.containsKey(id)) {
          await notifier.cancel(int.parse(id));
          scheduled.remove(id);
        }
      }
      for (final e in wanted.entries) {
        final p = e.value;
        if (scheduled[e.key]?['sig'] == p.signature) continue;
        await notifier.schedule(id: p.id, atMs: p.atMs, title: p.title, body: p.body, cardId: p.cardId);
        scheduled[e.key] = {'key': p.key, 'sig': p.signature, 'at': p.atMs};
      }
    }
    if (!ref.mounted) return;
    final next = {'scheduled': scheduled, 'done': done, 'seen': (enabled && lib.synced) || state['seen'] == true};
    if (jsonEncode(next) != jsonEncode(saved)) await store.writeLocal(_key, next);
  }
}

final notificationSchedulerProvider = Provider<NotificationScheduler>((ref) => NotificationScheduler(ref));
