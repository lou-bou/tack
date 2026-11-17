import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tack/data/dates.dart';
import 'package:tack/data/store.dart';
import 'package:tack/data/sync.dart';

import 'fake_server.dart';

/// 17/11/2026, 10:30 in Algiers: a Tuesday.
final seedNow = DateTime.utc(2026, 11, 17, 9, 30).millisecondsSinceEpoch;

const labNotes = '''## Steps
- [x] Collect the data
- [ ] Plot the results
- [ ] Write the **conclusion**

Due at the lab office. See [the lab guide](https://example.com).''';

/// A realistic set of boards for the screenshots and app tests, synced to [server] so the phone
/// counts as having caught up. Returns ids by name.
Future<Map<String, String>> seedBoards(ProviderContainer c, FakeTack server) async {
  final s = c.read(storeProvider.notifier);
  final today = todayString(seedNow);
  DateValue day(int offset, [String? time]) => DateValue(addDays(today, offset), time);
  final ids = <String, String>{};

  String card(
    String board,
    String list,
    String title, {
    DateValue? due,
    DateValue? start,
    String priority = 'none',
    String? planned,
    String description = '',
    bool done = false,
  }) {
    final id = s.createCard(ids[board]!, ids[list]!, title, due: due);
    s.updateCard(id, {
      'start': ?start?.toJson(),
      if (priority != 'none') 'priority': priority,
      'plannedFor': ?planned,
      if (description.isNotEmpty) 'description': description,
    });
    if (done) s.setCardCompleted(id, true);
    ids[title] = id;
    return id;
  }

  ids['Uni'] = s.createBoard(name: 'Uni', emoji: '📚', color: 'blue');
  ids['To do'] = s.createList(ids['Uni']!, 'To do');
  ids['Doing'] = s.createList(ids['Uni']!, 'Doing');
  ids['Done'] = s.createList(ids['Uni']!, 'Done');
  card('Uni', 'To do', 'Lab report: heat capacity', due: day(-1, '17:00'), priority: 'urgent', description: labNotes);
  card('Uni', 'To do', 'Read chapter 4 of Thermodynamics', due: day(0, '18:00'), priority: 'high');
  card('Uni', 'To do', 'Problem set 6', start: day(-2), due: day(3), priority: 'medium');
  card('Uni', 'To do', 'Group meeting prep', priority: 'low', planned: today);
  card('Uni', 'To do', 'Essay draft: energy policy', due: day(6));
  card('Uni', 'To do', 'Email the TA about the midterm');
  card('Uni', 'Doing', 'Revise lecture notes', due: day(1), priority: 'medium');
  card('Uni', 'Doing', 'Statistics quiz', due: day(2, '09:00'), priority: 'high');
  card('Uni', 'Done', 'Register for exams', done: true);
  card('Uni', 'Done', 'Buy the lab coat', done: true);

  ids['Client work'] = s.createBoard(name: 'Client work', emoji: '💼', color: 'amber');
  ids['Backlog'] = s.createList(ids['Client work']!, 'Backlog');
  ids['This week'] = s.createList(ids['Client work']!, 'This week');
  card('Client work', 'This week', 'Call with Sara about the logo', due: day(0, '14:30'));
  card('Client work', 'This week', 'Send the March invoice', due: day(2), priority: 'high');
  card('Client work', 'Backlog', 'Website copy, second pass', start: day(1), due: day(9));
  card('Client work', 'Backlog', 'Update the portfolio');

  ids['Japanese'] = s.createBoard(name: 'Japanese', emoji: '🗣️', color: 'violet');
  ids['Daily'] = s.createList(ids['Japanese']!, 'Daily');
  card('Japanese', 'Daily', 'Anki reviews', planned: addDays(today, -3));
  card('Japanese', 'Daily', 'Kanji set 12', due: day(4));

  ids['Home'] = s.createBoard(name: 'Home', color: 'green');
  ids['Errands'] = s.createList(ids['Home']!, 'Errands');
  card('Home', 'Errands', 'Pay the electricity bill', due: day(10), priority: 'medium');
  card('Home', 'Errands', 'Groceries');

  final old = card('Uni', 'To do', 'Old reading list');
  s.trashCard(old);
  final scratch = s.createList(ids['Client work']!, 'Ideas');
  s.createCard(ids['Client work']!, scratch, 'Newsletter');
  s.trashList(scratch);

  await c.read(syncProvider.notifier).sync();
  server.serverWrite('notifications', {
    'id': '${ids['Revise lecture notes']}:${addDays(today, 1)}',
    'cardId': ids['Revise lecture notes'],
    'dueKey': addDays(today, 1),
    'title': 'Revise lecture notes',
    'body': 'Due tomorrow',
    'createdAt': DateTime.fromMillisecondsSinceEpoch(seedNow - 90 * 60000, isUtc: true).toIso8601String(),
    'readAt': null,
    'clocks': <String, String>{},
  });
  await c.read(syncProvider.notifier).sync();
  return ids;
}
