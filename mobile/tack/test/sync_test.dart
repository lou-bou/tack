import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:tack/data/dates.dart';
import 'package:tack/data/hlc.dart';
import 'package:tack/data/positions.dart';
import 'package:tack/data/selection.dart';
import 'package:tack/data/store.dart';
import 'package:tack/data/sync.dart';

import 'fake_server.dart';
import 'vectors_test.dart' show text;

/// Two (or three) phones against the fake server, which answers exactly like the real one
/// (fake_server_test.dart). Real SQLite, real store, real sync engine.
void main() {
  late Directory dir;
  late FakeTack server;
  // One clock for everyone, moving 1 ms per reading, so "later" is never a tie.
  var t = DateTime.utc(2026, 11, 17, 8).millisecondsSinceEpoch;
  int tick() => t += 1;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('tack_sync');
    server = FakeTack(now: tick);
  });
  tearDown(() => dir.deleteSync(recursive: true));

  Future<Client> phone(String name, {int Function()? clock}) =>
      Client.start(server, dir, name: name, clock: clock ?? tick);
  Future<void> sync(Client c) => c.container.read(syncProvider.notifier).sync();
  SyncState stateOf(Client c) => c.container.read(syncProvider).state;

  /// Everything a phone holds, as text.
  String dump(Library lib) => text({
    for (final table in tableNames) table: {for (final r in lib.rows(table)) r['id']: r},
  });
  String serverDump() => text({for (final table in tableNames) table: server.tables[table]});

  /// A board with one list, made on [c] and synced.
  Future<({String board, String list})> seed(Client c) async {
    final board = c.store.createBoard(name: 'Uni', emoji: '📚');
    final list = c.store.createList(board, 'To do');
    await sync(c);
    return (board: board, list: list);
  }

  List<String> titles(Client c, String listId) =>
      (c.lib.cards.values.where((x) => x.listId == listId && x.deletedAt == null).toList()..sort(byPosition))
          .map((x) => x.title)
          .toList();

  test('a board, list and card made on one phone arrive on the other', () async {
    final a = await phone('a');
    final b = await phone('b');
    final ids = await seed(a);
    final card = a.store.createCard(ids.board, ids.list, 'Read chapter 3', due: const DateValue('2026-11-20', '18:00'));
    await sync(a);
    expect(stateOf(a), SyncState.synced);
    expect(a.lib.outbox, isEmpty);

    expect(b.lib.synced, false);
    await sync(b);
    expect(b.lib.synced, true);
    expect(b.lib.boards[ids.board]!.title, '📚 Uni');
    expect(b.lib.lists[ids.list]!.name, 'To do');
    expect(b.lib.cards[card]!.due, const DateValue('2026-11-20', '18:00'));
    // The server's own settings row came down too.
    expect(b.lib.theme, 'system');
    expect(dump(a.lib), dump(b.lib));
    expect(dump(a.lib), serverDump());
    await a.dispose();
    await b.dispose();
  });

  test('offline edits of different fields of one card on two phones are both kept', () async {
    final a = await phone('a');
    final b = await phone('b');
    final ids = await seed(a);
    final card = a.store.createCard(ids.board, ids.list, 'Essay');
    await sync(a);
    await sync(b);

    server.offline = true;
    a.store.updateCard(card, {'priority': 'urgent'});
    a.store.updateCard(card, {'description': 'Outline first'});
    b.store.updateCard(card, {'due': const DateValue('2026-11-21').toJson()});
    b.store.setCardCompleted(card, true);
    await sync(a);
    await sync(b);
    expect(stateOf(a), SyncState.offline);
    expect(a.lib.outbox.length, 1, reason: 'one queued entry per row, however many edits');
    expect(a.lib.cards[card]!.priority, 'urgent', reason: 'the edit shows at once, offline');

    server.offline = false;
    await sync(a);
    await sync(b);
    await sync(a);
    for (final c in [a, b]) {
      final x = c.lib.cards[card]!;
      expect(x.priority, 'urgent');
      expect(x.description, 'Outline first');
      expect(x.due, const DateValue('2026-11-21'));
      expect(x.completed, true);
      expect(c.lib.outbox, isEmpty);
    }
    expect(dump(a.lib), dump(b.lib));
    expect(dump(a.lib), serverDump());
    await a.dispose();
    await b.dispose();
  });

  test('the same field edited offline on two phones: the later edit wins on both, whoever syncs first', () async {
    final a = await phone('a');
    final b = await phone('b');
    final ids = await seed(a);
    final card = a.store.createCard(ids.board, ids.list, 'Start');
    await sync(a);
    await sync(b);

    server.offline = true;
    a.store.updateCard(card, {'title': 'From A (earlier)'});
    b.store.updateCard(card, {'title': 'From B (later)'});
    server.offline = false;
    // The later edit reaches the server first; the earlier one must not overwrite it.
    await sync(b);
    await sync(a);
    await sync(b);
    expect(a.lib.cards[card]!.title, 'From B (later)');
    expect(b.lib.cards[card]!.title, 'From B (later)');
    expect(server.row('cards', card)!['title'], 'From B (later)');
    expect(dump(a.lib), dump(b.lib));
    await a.dispose();
    await b.dispose();
  });

  test('cards added at the same spot offline on two phones are all kept, in the same order everywhere', () async {
    final a = await phone('a');
    final b = await phone('b');
    final ids = await seed(a);
    a.store.createCard(ids.board, ids.list, 'first');
    await sync(a);
    await sync(b);

    server.offline = true;
    a.store.createCard(ids.board, ids.list, 'a1');
    a.store.createCard(ids.board, ids.list, 'a2');
    b.store.createCard(ids.board, ids.list, 'b1');
    server.offline = false;
    await sync(a);
    await sync(b);
    await sync(a);
    expect(titles(a, ids.list).toSet(), {'first', 'a1', 'a2', 'b1'});
    expect(titles(a, ids.list).first, 'first');
    expect(titles(a, ids.list), titles(b, ids.list));
    await a.dispose();
    await b.dispose();
  });

  test('a card moved to another list on one phone and renamed on the other keeps both', () async {
    final a = await phone('a');
    final b = await phone('b');
    final ids = await seed(a);
    final done = a.store.createList(ids.board, 'Done');
    final card = a.store.createCard(ids.board, ids.list, 'Lab report');
    await sync(a);
    await sync(b);

    server.offline = true;
    a.store.moveCardToList(card, done);
    b.store.updateCard(card, {'title': 'Lab report (physics)'});
    server.offline = false;
    await sync(a);
    await sync(b);
    await sync(a);
    for (final c in [a, b]) {
      expect(c.lib.cards[card]!.listId, done);
      expect(c.lib.cards[card]!.title, 'Lab report (physics)');
    }
    await a.dispose();
    await b.dispose();
  });

  test('a push whose answer is lost is sent again and changes nothing twice', () async {
    final a = await phone('a');
    final b = await phone('b');
    final ids = await seed(a);
    final card = a.store.createCard(ids.board, ids.list, 'Only once');
    a.store.updateCard(card, {'priority': 'high'});

    server.loseNextPush = true;
    await sync(a);
    expect(stateOf(a), SyncState.offline);
    expect(a.lib.outbox, isNotEmpty, reason: 'nothing leaves the queue without an answer');
    expect(server.row('cards', card), isNotNull, reason: 'the server did get it');
    final seqAfterFirst = server.seq;
    final held = serverDump();

    await sync(a);
    expect(stateOf(a), SyncState.synced);
    expect(a.lib.outbox, isEmpty);
    expect(server.seq, seqAfterFirst, reason: 'the repeat was recognised: no new change on the server');
    expect(serverDump(), held);
    expect(server.tables['cards']!.length, 1);

    await sync(b);
    expect(b.lib.cards.length, 1);
    expect(b.lib.cards[card]!.priority, 'high');
    expect(dump(a.lib), dump(b.lib));
    await a.dispose();
    await b.dispose();
  });

  test('a push that never arrives is kept and sent later; nothing is lost', () async {
    final a = await phone('a');
    final ids = await seed(a);
    final card = a.store.createCard(ids.board, ids.list, 'Kept');
    server.dropNextPush = true;
    await sync(a);
    expect(server.row('cards', card), isNull);
    expect(a.lib.outbox.length, 1);
    await sync(a);
    expect(server.row('cards', card)!['title'], 'Kept');
    expect(a.lib.outbox, isEmpty);
    await a.dispose();
  });

  test('the very same batch pushed three times leaves the server as after the first', () async {
    final a = await phone('a');
    final ids = await seed(a);
    a.store.createCard(ids.board, ids.list, 'Replayed');
    a.store.trashList(ids.list);
    final batch = jsonDecode(jsonEncode(a.store.outboxBatch(200))) as List;
    server.applyChanges(batch, tick());
    final seq = server.seq;
    final held = serverDump();
    server.applyChanges(batch, tick());
    server.applyChanges(batch.reversed.toList(), tick());
    expect(server.seq, seq);
    expect(serverDump(), held);
    await sync(a);
    expect(a.lib.outbox, isEmpty);
    expect(dump(a.lib), serverDump());
    await a.dispose();
  });

  test('an edit made while a push is in the air stays queued and goes out next', () async {
    final a = await phone('a');
    final ids = await seed(a);
    final card = a.store.createCard(ids.board, ids.list, 'v1');
    final real = server.adapter.handler;
    var edited = false;
    server.adapter.handler = (r, body) {
      if (r.uri.path == '/api/sync/push' && !edited) {
        edited = true;
        // The user types again while the request is on its way.
        a.store.updateCard(card, {'title': 'v2', 'priority': 'low'});
      }
      return real(r, body);
    };
    await sync(a);
    expect(a.lib.cards[card]!.title, 'v2', reason: 'the newer local text is not replaced by the older server row');
    expect(a.lib.outbox, isEmpty, reason: 'the same sync run sends what was edited meanwhile');
    expect(server.row('cards', card)!['title'], 'v2');
    expect(server.row('cards', card)!['priority'], 'low');
    expect(dump(a.lib), serverDump());
    await a.dispose();
  });

  test('delete forever on one phone beats an offline edit on the other: gone on both', () async {
    final a = await phone('a');
    final b = await phone('b');
    final ids = await seed(a);
    final card = a.store.createCard(ids.board, ids.list, 'Doomed');
    await sync(a);
    await sync(b);

    server.offline = true;
    a.store.trashCard(card);
    a.store.purgeForever(TrashKind.card, card);
    b.store.updateCard(card, {'title': 'Edited after'});
    expect(a.lib.cards[card], isNull);
    server.offline = false;
    await sync(a);
    await sync(b);
    expect(b.lib.cards[card], isNull);
    expect(b.lib.outbox, isEmpty, reason: 'the refused edit does not stay queued for ever');
    expect(server.row('cards', card), isNull);
    await sync(a);
    expect(dump(a.lib), dump(b.lib));
    await a.dispose();
    await b.dispose();
  });

  test('a card added offline to a list deleted elsewhere travels with the list and comes back with it', () async {
    final a = await phone('a');
    final b = await phone('b');
    final ids = await seed(a);
    await sync(b);

    server.offline = true;
    a.store.trashList(ids.list);
    final card = b.store.createCard(ids.board, ids.list, 'Added offline');
    server.offline = false;
    await sync(a);
    await sync(b);
    await sync(a);
    for (final c in [a, b]) {
      expect(c.lib.cards[card], isNotNull);
      expect(isCardLive(c.lib.cards[card]!, c.lib.lists, c.lib.boards), false);
      final trash = selectTrash(c.lib.boards, c.lib.lists, c.lib.cards.values, t);
      expect(trash.single.kind, TrashKind.list);
      expect(trash.single.cardCount, 1);
    }
    b.store.restoreFromTrash(TrashKind.list, ids.list);
    await sync(b);
    await sync(a);
    expect(isCardLive(a.lib.cards[card]!, a.lib.lists, a.lib.boards), true);
    await a.dispose();
    await b.dispose();
  });

  test('deleting a board for ever removes its lists and cards on the other phone too', () async {
    final a = await phone('a');
    final b = await phone('b');
    final ids = await seed(a);
    a.store.createCard(ids.board, ids.list, 'One');
    a.store.createCard(ids.board, ids.list, 'Two');
    await sync(a);
    await sync(b);
    a.store.trashBoard(ids.board);
    a.store.purgeForever(TrashKind.board, ids.board);
    await sync(a);
    await sync(b);
    for (final c in [a, b]) {
      expect(c.lib.boards, isEmpty);
      expect(c.lib.lists, isEmpty);
      expect(c.lib.cards, isEmpty);
    }
    await a.dispose();
    await b.dispose();
  });

  test('restoring a card whose list is gone puts it in the first live list, or a new one', () async {
    final a = await phone('a');
    final ids = await seed(a);
    final second = a.store.createList(ids.board, 'Later');
    final card = a.store.createCard(ids.board, second, 'Orphan');
    a.store.trashCard(card);
    a.store.trashList(second);
    a.store.restoreFromTrash(TrashKind.card, card);
    expect(a.lib.cards[card]!.listId, ids.list);
    expect(a.lib.cards[card]!.deletedAt, isNull);

    a.store.trashCard(card);
    a.store.trashList(ids.list);
    a.store.restoreFromTrash(TrashKind.card, card);
    final made = a.lib.lists[a.lib.cards[card]!.listId]!;
    expect(made.name, 'Restored');
    await sync(a);
    expect(dump(a.lib), serverDump());
    await a.dispose();
  });

  test('a change the server refuses is dropped and the phone takes the server row', () async {
    final a = await phone('a');
    final ids = await seed(a);
    final card = a.store.createCard(ids.board, ids.list, 'Good');
    await sync(a);
    // An empty title is not a valid card (shared/src/schema.ts).
    a.store.updateCard(card, {'title': ''});
    await sync(a);
    expect(a.lib.outbox, isEmpty);
    expect(a.lib.cards[card]!.title, 'Good');
    expect(stateOf(a), SyncState.synced);
    await a.dispose();
  });

  test('server restored from a backup: the phone starts over, and edits still queued survive', () async {
    final a = await phone('a');
    final b = await phone('b');
    final ids = await seed(a);
    final kept = a.store.createCard(ids.board, ids.list, 'In the backup');
    await sync(a);
    final backup = server.snapshot();

    final lost = a.store.createCard(ids.board, ids.list, 'Made after the backup');
    await sync(a);
    await sync(b);
    expect(b.lib.cards[lost], isNotNull);

    server.offline = true;
    final queued = b.store.createCard(ids.board, ids.list, 'Typed while the server was down');
    server.offline = false;
    server.restoreFrom(backup, newEpoch: 7);

    await sync(b);
    await sync(a);
    await sync(b);
    for (final c in [a, b]) {
      expect(c.lib.epoch, 7);
      expect(c.lib.cards[kept], isNotNull);
      expect(c.lib.cards[lost], isNull, reason: 'what the server no longer has is gone here too');
      expect(c.lib.cards[queued]!.title, 'Typed while the server was down');
      expect(c.lib.outbox, isEmpty);
    }
    expect(dump(a.lib), dump(b.lib));
    expect(dump(a.lib), serverDump());
    await a.dispose();
    await b.dispose();
  });

  test('Access refusing the token is not "offline", and the queue waits', () async {
    final a = await phone('a');
    final ids = await seed(a);
    server.accessDenied = true;
    final card = a.store.createCard(ids.board, ids.list, 'Waiting');
    await sync(a);
    expect(stateOf(a), SyncState.accessDenied);
    expect(a.lib.outbox.length, 1);
    server.accessDenied = false;
    await sync(a);
    expect(stateOf(a), SyncState.synced);
    expect(server.row('cards', card), isNotNull);
    await a.dispose();
  });

  test('a server with a newer protocol: the app says so and holds its queue', () async {
    final a = await phone('a');
    final ids = await seed(a);
    server.protocol = 2;
    a.store.createCard(ids.board, ids.list, 'Held');
    await sync(a);
    expect(stateOf(a), SyncState.outdated);
    expect(a.lib.outbox.length, 1);
    await a.dispose();
  });

  test('the app killed with edits unsent: they are still there, and still sent, after a restart', () async {
    var a = await phone('a');
    final ids = await seed(a);
    server.offline = true;
    final card = a.store.createCard(ids.board, ids.list, 'Written offline');
    a.store.updateCard(card, {'priority': 'urgent'});
    await sync(a);
    final before = dump(a.lib);
    final seq = a.lib.seq;
    await a.dispose();

    a = await phone('a');
    expect(dump(a.lib), before, reason: 'everything is loaded from SQLite before the first frame');
    expect(a.lib.seq, seq);
    expect(a.lib.outbox.length, 1);
    server.offline = false;
    await sync(a);
    expect(server.row('cards', card)!['priority'], 'urgent');
    expect(a.lib.outbox, isEmpty);
    // The clock never goes back after a restart, so a new edit still beats the old one.
    final old = a.lib.cards[card]!.row['clocks'] as Map;
    a.store.updateCard(card, {'priority': 'low'});
    expect(
      ((a.lib.cards[card]!.row['clocks'] as Map)['priority'] as String).compareTo(old['priority'] as String),
      greaterThan(0),
    );
    await a.dispose();
  });

  test('a phone whose clock is two hours ahead cannot win every conflict', () async {
    const ahead = 2 * 3600 * 1000;
    final a = await phone('a', clock: () => tick() + ahead);
    final b = await phone('b');
    final ids = await seed(b);
    final card = b.store.createCard(ids.board, ids.list, 'Start');
    await sync(b);

    // A phone whose clock is wrong, but which syncs before editing: having heard the server's
    // time, it stamps edits with it.
    final c = await phone('c', clock: () => tick() + ahead);
    await sync(c);
    c.store.updateCard(card, {'title': 'C, clock corrected'});
    final stamp = (c.lib.cards[card]!.row['clocks'] as Map)['title'] as String;
    expect((hlcMs(stamp) - t).abs(), lessThan(5000));
    await sync(c);
    // So a later edit from a phone with a right clock wins, as it should.
    await sync(b);
    b.store.updateCard(card, {'title': 'B, later'});
    await sync(b);
    await sync(c);
    expect(c.lib.cards[card]!.title, 'B, later');

    // Before it has ever heard from the server, a phone stamps with its own wrong time; the
    // server then limits that to five minutes ahead.
    final early = a.store.createBoard(name: 'Made before the first sync');
    expect(hlcMs((a.lib.boards[early]!.row['clocks'] as Map)['name'] as String) - t, greaterThan(ahead - 5000));
    await sync(a);
    final onServer = hlcMs((server.row('boards', early)!['clocks'] as Map)['name'] as String);
    expect(onServer - t, lessThanOrEqualTo(5 * 60000));
    await a.dispose();
    await b.dispose();
    await c.dispose();
  });

  test('settings and "read" marks sync like any other row', () async {
    final a = await phone('a');
    final b = await phone('b');
    await sync(a);
    await sync(b);
    a.store.setTheme('dark');
    b.store.setDensity('roomy');
    server.serverWrite('notifications', {
      'id': 'c1:2026-11-20',
      'cardId': 'c1',
      'dueKey': '2026-11-20',
      'title': 'Essay',
      'body': 'Due tomorrow',
      'createdAt': '2026-11-19T08:00:00.000Z',
      'readAt': null,
      'clocks': <String, String>{},
    });
    await sync(a);
    await sync(b);
    await sync(a);
    expect(a.lib.notices.length, 1);
    a.store.markNoticesRead(['c1:2026-11-20']);
    await sync(a);
    await sync(b);
    for (final c in [a, b]) {
      expect(c.lib.theme, 'dark');
      expect(c.lib.density, 'roomy');
      expect(c.lib.notices['c1:2026-11-20']!.readAt, isNotNull);
    }
    await a.dispose();
    await b.dispose();
  });

  test('random edits on three phones with a bad connection always converge (20 runs)', () async {
    for (var run = 0; run < 20; run++) {
      final rnd = Random(run);
      server = FakeTack(now: tick);
      final sub = Directory('${dir.path}/r$run')..createSync();
      final phones = [
        for (final n in ['a', 'b', 'c']) await Client.start(server, sub, name: n, clock: tick),
      ];
      final first = phones.first;
      final board = first.store.createBoard(name: 'B');
      final lists = [first.store.createList(board, 'L1'), first.store.createList(board, 'L2')];
      for (final p in phones) {
        await sync(p);
      }

      for (var step = 0; step < 60; step++) {
        final p = phones[rnd.nextInt(phones.length)];
        final cards = p.lib.cards.keys.toList();
        final roll = rnd.nextInt(100);
        if (roll < 22 || cards.isEmpty) {
          p.store.createCard(board, lists[rnd.nextInt(2)], 'card $step');
        } else if (roll < 60) {
          final id = cards[rnd.nextInt(cards.length)];
          switch (rnd.nextInt(6)) {
            case 0:
              p.store.updateCard(id, {'title': 'edit $step'});
            case 1:
              p.store.updateCard(id, {'priority': priorities[rnd.nextInt(5)]});
            case 2:
              p.store.setCardCompleted(id, rnd.nextBool());
            case 3:
              p.store.updateCard(id, {
                'due': rnd.nextBool() ? null : DateValue('2026-11-${10 + rnd.nextInt(18)}').toJson(),
              });
            case 4:
              p.store.moveCardToList(id, lists[rnd.nextInt(2)]);
            case 5:
              p.store.setPlanned([id], rnd.nextBool() ? '2026-11-17' : null);
          }
        } else if (roll < 68) {
          final id = cards[rnd.nextInt(cards.length)];
          p.store.trashCard(id);
          if (rnd.nextBool()) p.store.purgeForever(TrashKind.card, id);
        } else if (roll < 72) {
          final list = lists[rnd.nextInt(2)];
          rnd.nextBool() ? p.store.trashList(list) : p.store.restoreList(list);
        } else {
          // A sync on a connection that may drop the request or lose the answer.
          final net = rnd.nextInt(10);
          server.offline = net == 0;
          server.dropNextPush = net == 1;
          server.loseNextPush = net == 2;
          await sync(p);
          server
            ..offline = false
            ..dropNextPush = false
            ..loseNextPush = false;
        }
      }

      // The connection comes back: everyone syncs until nothing is left to say.
      for (var round = 0; round < 3; round++) {
        for (final p in phones) {
          await sync(p);
        }
      }
      for (final p in phones) {
        expect(p.lib.outbox, isEmpty, reason: 'run $run');
        expect(dump(p.lib), serverDump(), reason: 'run $run: phone and server differ');
      }
      for (final p in phones) {
        await p.dispose();
      }
    }
  });
}
