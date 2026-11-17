import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tack/data/dates.dart';
import 'package:tack/data/hlc.dart';
import 'package:tack/data/merge.dart';
import 'package:tack/data/model.dart';
import 'package:tack/data/positions.dart';
import 'package:tack/data/selection.dart';

/// The Dart port against the real JS code: test/vectors.json is written by
/// tool/gen_vectors.ts from shared/ (run it again after changing shared/).
class _Item implements Ordered {
  _Item(Map m) : id = m['id'] as String, position = m['position'] as String;
  @override
  final String id;
  @override
  final String position;
}

/// JSON with its keys in order, so two values are equal when their text is.
Object? canon(Object? v) {
  if (v is Map) {
    final keys = v.keys.map((k) => '$k').toList()..sort();
    return {for (final k in keys) k: canon(v[k])};
  }
  if (v is List) return [for (final x in v) canon(x)];
  return v;
}

String text(Object? v) => jsonEncode(canon(v));

double Function() replay(List randoms) {
  var i = 0;
  return () => (randoms[i++] as num).toDouble();
}

DateValue? dv(Object? json) => DateValue.fromJson(json);

void main() {
  final v = jsonDecode(File('test/vectors.json').readAsStringSync()) as Map;

  group('clock (shared/src/hlc.ts)', () {
    final hlc = v['hlc'] as Map;
    test('format', () {
      for (final f in hlc['format'] as List) {
        expect(formatHlc(f['ms'] as int, f['counter'] as int, f['node'] as String), f['out']);
      }
      expect(formatHlc(0, 0, ''), hlcZero);
    });

    test('now, observe and syncWall give the same stamps, step by step', () {
      var stamps = 0;
      for (final run in hlc['runs'] as List) {
        var wall = 0;
        final clock = HlcClock(run['node'] as String, wall: () => wall);
        for (final s in run['steps'] as List) {
          switch (s['op']) {
            case 'now':
              wall = s['wall'] as int;
              expect(clock.now(), s['out']);
              stamps++;
            case 'observe':
              clock.observe(s['hlc'] as String);
            case 'syncWall':
              wall = s['wall'] as int;
              clock.syncWall(s['server'] as int);
          }
        }
      }
      expect(stamps, greaterThan(400));
    });

    test('clamp', () {
      for (final c in hlc['clamp'] as List) {
        expect(clampHlc(c['hlc'] as String, c['serverNow'] as int), c['out']);
      }
    });

    test('parts', () {
      expect(hlcMs('1789632000000:0012:aaaa1111'), 1789632000000);
      expect(hlcCounter('1789632000000:0012:aaaa1111'), 12);
    });
  });

  test('merge (shared/src/merge.ts): the same row and the same "changed" for 300 cases', () {
    for (final m in v['merge'] as List) {
      final existing = m['existing'] == null ? null : Map<String, Object?>.from(m['existing'] as Map);
      final before = text(existing);
      final result = mergeChange(existing, Map<String, Object?>.from(m['change'] as Map));
      expect(text(result.row), text(m['row']));
      expect(result.changed, m['changed']);
      expect(text(existing), before, reason: 'the existing row must not be changed in place');
      // Merging the same change again changes nothing.
      final again = mergeChange(result.row, Map<String, Object?>.from(m['change'] as Map));
      expect(again.changed, false);
      expect(text(again.row), text(m['row']));
    }
  });

  group('positions (shared/src/positions.ts)', () {
    final p = v['positions'] as Map;
    test('generateKeyBetween matches fractional-indexing', () {
      final keys = p['keys'] as List;
      expect(keys.length, 1000);
      for (final k in keys) {
        expect(generateKeyBetween(k[0] as String?, k[1] as String?), k[2], reason: '$k');
      }
    });

    test('positionBetween with the same random numbers', () {
      for (final b in p['between'] as List) {
        expect(positionBetween(b['before'] as String?, b['after'] as String?, replay(b['randoms'] as List)), b['out']);
      }
    });

    test('positionAt', () {
      for (final a in p['at'] as List) {
        final sorted = [for (final i in a['sorted'] as List) _Item(i as Map)];
        expect(positionAt(sorted, a['index'] as int, replay(a['randoms'] as List)), a['out']);
      }
    });

    test('dropPosition', () {
      for (final d in p['drop'] as List) {
        final siblings = [for (final i in d['siblings'] as List) _Item(i as Map)];
        expect(
          dropPosition(
            siblings,
            (d['visibleOrder'] as List).cast<String>(),
            d['movedId'] as String,
            replay(d['randoms'] as List),
          ),
          d['out'],
        );
      }
    });

    test('byPosition orders the same way, ties broken by id', () {
      for (final o in p['order'] as List) {
        final items = [for (final i in o['items'] as List) _Item(i as Map)]..sort(byPosition);
        expect([for (final i in items) i.id], o['sorted']);
      }
    });
  });

  group('dates (shared/src/dates.ts)', () {
    final d = v['dates'] as Map;
    test('calendar arithmetic', () {
      for (final a in d['addDays'] as List) {
        expect(addDays(a[0] as String, a[1] as int), a[2]);
      }
      for (final a in d['daysBetween'] as List) {
        expect(daysBetween(a[0] as String, a[1] as String), a[2]);
      }
      for (final a in d['dayOfWeek'] as List) {
        expect(dayOfWeek(a[0] as String), a[1]);
      }
    });

    test('today and wall-clock moments are read in Africa/Algiers', () {
      for (final a in d['todayString'] as List) {
        expect(todayString(a[0] as int), a[1]);
      }
      for (final a in d['zonedMs'] as List) {
        expect(zonedMs(a[0] as String, a[1] as String), a[2]);
      }
    });

    test('due moment, state, notification time and wording', () {
      for (final c in d['due'] as List) {
        final due = dv(c['due'])!;
        final now = c['now'] as int;
        expect(dueMoment(due), c['moment']);
        expect(dueState(due: due, completed: c['completed'] as bool, now: now).name, c['state']);
        expect(notifyAt(due), c['notifyAt']);
        expect(notificationBody(due, now), c['body']);
        expect(dueKey(due), c['key']);
      }
      expect(dueState(due: null, completed: false, now: 0).name, d['noDue']);
    });

    test('chips and start-after-due', () {
      for (final c in [...d['chips'] as List, ...d['sameDay'] as List]) {
        if (c['out'] != null) expect(formatChip(dv(c['start']), dv(c['due'])), c['out']);
        expect(startAfterDue(dv(c['start']), dv(c['due'])), c['after']);
      }
    });

    test('formats: DD/MM/YYYY, month names, timestamps', () {
      for (final a in d['formatDate'] as List) {
        expect(formatDate(a[0] as String), a[1]);
        expect(formatMonth(a[0] as String), a[2]);
      }
      for (final a in d['timestamps'] as List) {
        expect(formatTimestamp(a[0] as String), a[1]);
      }
    });

    test('months start on the 1st and weeks on Sunday', () {
      for (final m in d['months'] as List) {
        expect(monthStart(m['date'] as String, m['offset'] as int), m['start']);
        expect(monthWeeks(m['date'] as String), m['weeks']);
      }
    });

    test('time field, presets, moving a due date', () {
      for (final a in d['parseTime'] as List) {
        expect(parseTime(a[0] as String), a[1], reason: '"${a[0]}"');
      }
      for (final p in d['presets'] as List) {
        final now = p['now'] as int;
        expect(presetDate(DatePreset.today, now), p['today']);
        expect(presetDate(DatePreset.tomorrow, now), p['tomorrow']);
        expect(presetDate(DatePreset.nextWeek, now), p['nextWeek']);
      }
      for (final m in d['moveDue'] as List) {
        final out = moveDue(start: dv(m['start']), due: dv(m['due'])!, to: m['to'] as String);
        expect(text(out.due.toJson()), text(m['out']['due']));
        expect(text(out.start?.toJson()), text(m['out']['start']));
      }
    });
  });

  group('screens (shared/src/selection.ts, calendar.ts)', () {
    final worlds = v['screens'] as List;
    for (var i = 0; i < worlds.length; i++) {
      test('world $i: Today, badge, Trash, restore, Calendar', () {
        final w = worlds[i] as Map;
        final now = w['now'] as int;
        Json row(Object? r) => Map<String, Object?>.from(r as Map);
        final boards = {for (final b in w['boards'] as List) b['id'] as String: Board(row(b))};
        final lists = {for (final l in w['lists'] as List) l['id'] as String: BoardList(row(l))};
        final cards = [for (final c in w['cards'] as List) TaskCard(row(c))];

        for (final c in cards) {
          expect(todayReason(c, now)?.name, (w['reasons'] as Map)[c.id], reason: c.id);
        }
        expect([
          for (final g in selectToday(boards, lists, cards, now))
            {
              'boardId': g.board.id,
              'cardIds': [for (final c in g.cards) c.id],
            },
        ], w['today']);
        expect(todayBadgeCount(boards, lists, cards, now), w['badge']);

        expect([
          for (final t in selectTrash(boards, lists, cards, now))
            {
              'kind': t.kind.name,
              'id': t.id,
              'name': t.name,
              'where': t.where,
              'deletedAt': t.deletedAt,
              'daysLeft': t.daysLeft,
              'cardCount': t.cardCount,
              'needsBoard': t.needsBoard,
            },
        ], w['trash']);
        for (final d in w['daysLeft'] as List) {
          expect(trashDaysLeft(d[0] as String, now), d[1]);
        }
        for (final r in w['restore'] as List) {
          final card = cards.firstWhere((c) => c.id == r[0]);
          final plan = cardRestorePlan(card, lists.values.where((l) => l.boardId == card.boardId));
          final expected = r[1] as Map;
          expect(plan.inPlace, expected['kind'] == 'inPlace');
          expect(plan.listId, expected['listId']);
        }

        final entries = selectCalendar(boards, lists, cards, {...(w['filter'] as List).cast<String>()});
        expect([
          for (final e in entries) {'cardId': e.card.id, 'from': e.from, 'to': e.to, 'listName': e.listName},
        ], w['calendar']);
        for (final day in (w['days'] as Map).entries) {
          expect(
            [for (final e in entriesOnDay(entries, day.key as String)) e.card.id],
            day.value,
            reason: '${day.key}',
          );
        }
      });
    }
  });
}
