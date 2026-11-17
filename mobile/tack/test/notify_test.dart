import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:kit/kit.dart';
import 'package:tack/data/dates.dart';
import 'package:tack/data/sync.dart';
import 'package:tack/notify/schedule.dart';

import 'fake_server.dart';

/// Due notifications are scheduled on the phone with the server's rule (SPEC §3.8,
/// server/src/notifications.ts): once per due value, 24 hours ahead or 09:00 the day before,
/// never for a date set after that moment, never for completed or deleted cards.
void main() {
  late Directory dir;
  late FakeTack server;
  // 17/11/2026 09:00 in Algiers (UTC+1).
  var t = DateTime.utc(2026, 11, 17, 8).millisecondsSinceEpoch;
  int clock() => t;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('tack_notify');
    server = FakeTack(now: clock);
    t = DateTime.utc(2026, 11, 17, 8).millisecondsSinceEpoch;
  });
  tearDown(() => dir.deleteSync(recursive: true));

  Future<Client> phone(String name) async {
    final c = await Client.start(server, dir, name: name, clock: clock);
    c.container.read(prefsProvider.notifier).set(notifyPref, true);
    return c;
  }

  Future<void> reschedule(Client c) => c.container.read(notificationSchedulerProvider).reschedule();
  Future<void> sync(Client c) => c.container.read(syncProvider.notifier).sync();

  ({String board, String list}) seed(Client c) {
    final board = c.store.createBoard(name: 'Uni');
    return (board: board, list: c.store.createList(board, 'To do'));
  }

  test('a timed due date notifies 24 hours before, a date-only one at 09:00 the day before', () async {
    final a = await phone('a');
    final ids = seed(a);
    await sync(a);
    await reschedule(a); // the first look at the data is quiet; nothing is due yet anyway
    final timed = a.store.createCard(ids.board, ids.list, 'Essay', due: const DateValue('2026-11-20', '18:00'));
    final allDay = a.store.createCard(ids.board, ids.list, 'Lab', due: const DateValue('2026-11-21'));
    await reschedule(a);

    final byCard = {for (final s in a.notifier.scheduled.values) s.cardId: s};
    expect(byCard.keys.toSet(), {timed, allDay});
    expect(byCard[timed]!.atMs, zonedMs('2026-11-19', '18:00'));
    expect(byCard[timed]!.title, 'Essay');
    expect(byCard[timed]!.body, 'Due tomorrow at 18:00');
    expect(byCard[allDay]!.atMs, zonedMs('2026-11-20', '09:00'));
    expect(byCard[allDay]!.body, 'Due tomorrow');
    expect(a.notifier.shown, isEmpty);
    await a.dispose();
  });

  test('completed, deleted and trashed-list cards are not notified, and are cancelled when that changes', () async {
    final a = await phone('a');
    final ids = seed(a);
    await reschedule(a);
    final done = a.store.createCard(ids.board, ids.list, 'Done', due: const DateValue('2026-11-20'));
    final gone = a.store.createCard(ids.board, ids.list, 'Gone', due: const DateValue('2026-11-20'));
    final other = a.store.createList(ids.board, 'Later');
    final inList = a.store.createCard(ids.board, other, 'In a trashed list', due: const DateValue('2026-11-20'));
    await reschedule(a);
    expect(a.notifier.scheduled.length, 3);

    a.store.setCardCompleted(done, true);
    a.store.trashCard(gone);
    a.store.trashList(other);
    await reschedule(a);
    expect(a.notifier.scheduled, isEmpty);

    a.store.restoreList(other);
    await reschedule(a);
    expect(a.notifier.scheduled.values.single.cardId, inList);
    await a.dispose();
  });

  test('a due date set after its notification moment never notifies', () async {
    final a = await phone('a');
    final ids = seed(a);
    await reschedule(a);
    // At 09:00 on the 17th, a card due tomorrow at 08:00: its moment (17th 08:00) has passed.
    a.store.createCard(ids.board, ids.list, 'Too late', due: const DateValue('2026-11-18', '08:00'));
    // And one due tomorrow with no time: its moment was 09:00 today, which is now.
    a.store.createCard(ids.board, ids.list, 'Also too late', due: const DateValue('2026-11-18'));
    await reschedule(a);
    expect(a.notifier.scheduled, isEmpty);
    expect(a.notifier.shown, isEmpty);
    await a.dispose();
  });

  test('changing the due date reschedules; changing it back does not notify twice', () async {
    final a = await phone('a');
    final ids = seed(a);
    await reschedule(a);
    final card = a.store.createCard(ids.board, ids.list, 'Essay', due: const DateValue('2026-11-20', '18:00'));
    await reschedule(a);
    final first = a.notifier.scheduled.keys.single;

    a.store.updateCard(card, {'due': const DateValue('2026-11-25', '10:00').toJson()});
    await reschedule(a);
    expect(a.notifier.scheduled.containsKey(first), false);
    expect(a.notifier.scheduled.values.single.atMs, zonedMs('2026-11-24', '10:00'));

    // The first notification fires (time passes), then the date goes back to that value.
    a.store.updateCard(card, {'due': const DateValue('2026-11-20', '18:00').toJson()});
    await reschedule(a);
    t = zonedMs('2026-11-19', '18:01');
    // Android shows it and drops the alarm.
    a.notifier.scheduled.removeWhere((_, s) => s.atMs <= t);
    await reschedule(a);
    expect(a.notifier.scheduled, isEmpty, reason: 'it fired');
    a.store.updateCard(card, {'due': const DateValue('2026-11-25', '10:00').toJson()});
    a.store.updateCard(card, {'due': const DateValue('2026-11-20', '18:00').toJson()});
    await reschedule(a);
    expect(a.notifier.scheduled, isEmpty, reason: 'at most once per due date value');
    expect(a.notifier.shown, isEmpty);
    await a.dispose();
  });

  test('a card learned about after its moment, not yet due, is shown late with the real day', () async {
    final a = await phone('a');
    final b = await phone('b');
    final ids = seed(a);
    await sync(a);
    await sync(b);
    await reschedule(b); // b has looked at its data once
    // Set on the laptop in time (the 17th, 09:00), due the 19th at 08:00: moment is the 18th 08:00.
    a.store.createCard(ids.board, ids.list, 'Call the bank', due: const DateValue('2026-11-19', '08:00'));
    await sync(a);
    // The phone was off until the 19th at 07:00, an hour before it is due.
    t = zonedMs('2026-11-19', '07:00');
    await sync(b);
    await reschedule(b);
    expect(b.notifier.shown.single.title, 'Call the bank');
    expect(b.notifier.shown.single.body, 'Due today at 08:00');
    // Only once.
    await reschedule(b);
    expect(b.notifier.shown.length, 1);
    await a.dispose();
    await b.dispose();
  });

  test('the first look at a phone\'s cards (a new install) does not announce everything at once', () async {
    final a = await phone('a');
    final ids = seed(a);
    a.store.createCard(ids.board, ids.list, 'Due soon', due: const DateValue('2026-11-17', '20:00'));
    a.store.createCard(ids.board, ids.list, 'Due later', due: const DateValue('2026-11-30'));
    await sync(a);
    final b = await phone('b');
    await sync(b);
    await reschedule(b);
    expect(b.notifier.shown, isEmpty);
    expect(b.notifier.scheduled.values.single.title, 'Due later');
    await a.dispose();
    await b.dispose();
  });

  test('turning reminders off cancels everything scheduled', () async {
    final a = await phone('a');
    final ids = seed(a);
    await reschedule(a);
    a.store.createCard(ids.board, ids.list, 'Essay', due: const DateValue('2026-11-20'));
    await reschedule(a);
    expect(a.notifier.scheduled, isNotEmpty);
    a.container.read(prefsProvider.notifier).set(notifyPref, false);
    await reschedule(a);
    expect(a.notifier.scheduled, isEmpty);
    await a.dispose();
  });

  test('notification ids are stable and differ per due value', () {
    expect(notificationId('c1:2026-11-20'), notificationId('c1:2026-11-20'));
    expect(notificationId('c1:2026-11-20'), isNot(notificationId('c1:2026-11-21')));
    expect(notificationId('c1:2026-11-20'), greaterThanOrEqualTo(0));
    expect(notificationId('c1:2026-11-20'), lessThan(1 << 31));
  });
}
