import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';
import 'package:tack/app.dart';
import 'package:tack/data/dates.dart';
import 'package:tack/data/sync.dart';

import 'fake_server.dart';
import 'seed.dart';

/// The real app on a phone-sized screen: real SQLite, real sync, fake server, fixed time.
void main() {
  late Directory dir;
  late FakeTack server;

  Future<void> real(WidgetTester tester, [int rounds = 10]) async {
    for (var i = 0; i < rounds; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump(const Duration(milliseconds: 16));
    }
  }

  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 60));
    }
    await real(tester, 4);
  }

  Future<(Client, Map<String, String>)> launch(WidgetTester tester, {bool connected = true, bool seed = true}) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    late Client c;
    var ids = <String, String>{};
    await tester.runAsync(() async {
      dir = Directory.systemTemp.createTempSync('tack_app');
      server = FakeTack(now: () => seedNow);
      c = await Client.start(server, dir, connected: connected, clock: () => seedNow);
      if (seed) ids = await seedBoards(c.container, server);
    });
    await tester.pumpWidget(UncontrolledProviderScope(container: c.container, child: const TackApp()));
    await real(tester);
    return (c, ids);
  }

  Future<void> close(WidgetTester tester, Client c) async {
    await tester.pumpWidget(const SizedBox());
    await real(tester, 5);
    await tester.pump(const Duration(seconds: 30));
    await tester.runAsync(() async {
      await c.dispose();
      dir.deleteSync(recursive: true);
    });
  }

  /// Starts a sync and pumps until it has landed. The app may already be syncing in the test's
  /// fake time, so awaiting the run from real time would never finish.
  Future<void> syncNow(WidgetTester tester, Client c) async {
    unawaited(c.container.read(syncProvider.notifier).sync());
    await real(tester, 25);
  }

  Future<void> back(WidgetTester tester) async {
    await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
      'flutter/navigation',
      const JSONMethodCodec().encodeMethodCall(const MethodCall('popRoute')),
      (_) {},
    );
    await settle(tester);
  }

  testWidgets('first run: a refused token is explained, a good one connects', (tester) async {
    final (c, _) = await launch(tester, connected: false, seed: false);
    expect(find.text('Connect to your server'), findsOneWidget);
    server.accessDenied = true;
    await tester.enterText(find.byType(EditableText).at(0), 'tack.test');
    await tester.enterText(find.byType(EditableText).at(1), 'id.access');
    await tester.enterText(find.byType(EditableText).at(2), 'secret');
    await tester.tap(find.text('Test and save'));
    await real(tester, 15);
    expect(find.textContaining('Cloudflare Access refused'), findsOneWidget);
    server.accessDenied = false;
    await tester.tap(find.text('Test and save'));
    await real(tester, 15);
    await settle(tester);
    expect(find.text('Boards'), findsWidgets);
    await close(tester, c);
  });

  testWidgets('open from SQLite with the network down: everything is there at once', (tester) async {
    final (c, ids) = await launch(tester);
    server.offline = true;
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(UncontrolledProviderScope(container: c.container, child: const TackApp()));
    await tester.pump();
    // First frame, before any request has answered.
    expect(find.text('Client work'), findsOneWidget);
    await tester.tap(find.text('Uni'));
    await settle(tester);
    expect(find.text('Lab report: heat capacity'), findsOneWidget);
    // An edit offline is shown at once and queued, and the pill says why it hasn't gone.
    c.store.updateCard(ids['Problem set 6']!, {'title': 'Problem set 6 (with notes)'});
    await syncNow(tester, c);
    await settle(tester);
    expect(find.text('Problem set 6 (with notes)'), findsOneWidget);
    expect(find.text('Offline · changes will sync'), findsOneWidget);
    expect(find.byIcon(LucideIcons.cloudUpload), findsOneWidget);
    server.offline = false;
    await syncNow(tester, c);
    await settle(tester);
    expect(find.text('Offline · changes will sync'), findsNothing);
    expect(server.row('cards', ids['Problem set 6']!)!['title'], 'Problem set 6 (with notes)');
    await close(tester, c);
  });

  testWidgets('add a card with the composer, tick it with Undo, and Back leaves the board', (tester) async {
    final (c, ids) = await launch(tester);
    await tester.tap(find.text('Uni'));
    await settle(tester);
    await tester.tap(find.text('Add card').first);
    await settle(tester);
    await tester.enterText(find.byType(EditableText).last, 'Book the library room');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await settle(tester);
    // Enter keeps the composer open for the next one.
    await tester.enterText(find.byType(EditableText).last, 'Print the slides');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await settle(tester);
    final todo = c.lib.cards.values.where((x) => x.listId == ids['To do'] && x.deletedAt == null).toList();
    expect(todo.map((x) => x.title), containsAll(['Book the library room', 'Print the slides']));

    await tester.tap(find.bySemanticsLabel('Complete Email the TA about the midterm'));
    await settle(tester);
    expect(c.lib.cards[ids['Email the TA about the midterm']]!.completed, true);
    await tester.pump(const Duration(milliseconds: 500));
    await settle(tester);
    expect(
      find.text('Email the TA about the midterm'),
      findsNothing,
      reason: 'completed cards are hidden on this board',
    );
    await tester.tap(find.text('Undo'));
    await settle(tester);
    expect(c.lib.cards[ids['Email the TA about the midterm']]!.completed, false);
    expect(find.text('Email the TA about the midterm'), findsOneWidget);

    await back(tester);
    expect(find.text('Client work'), findsOneWidget, reason: 'back on the boards grid');
    await tester.pump(const Duration(seconds: 6));
    await close(tester, c);
  });

  testWidgets('a due date from a preset is two taps from the card panel', (tester) async {
    final (c, ids) = await launch(tester);
    await tester.tap(find.text('Uni'));
    await settle(tester);
    await tester.tap(find.text('Essay draft: energy policy'));
    await settle(tester);
    await tester.tap(find.bySemanticsLabel(RegExp('^Due:')));
    await settle(tester);
    await tester.tap(find.text('Tomorrow'));
    await settle(tester);
    expect(c.lib.cards[ids['Essay draft: energy policy']]!.due, DateValue(addDays(todayString(seedNow), 1)));
    expect(find.text('18/11/2026'), findsWidgets);

    // Priority is one tap.
    await tester.tap(find.bySemanticsLabel('High priority'));
    await settle(tester);
    expect(c.lib.cards[ids['Essay draft: energy policy']]!.priority, 'high');

    // A start date after the due date can't be picked.
    await tester.tap(find.bySemanticsLabel(RegExp('^Start:')));
    await settle(tester);
    await tester.tap(find.bySemanticsLabel(RegExp('^25, ')));
    await settle(tester);
    expect(c.lib.cards[ids['Essay draft: energy policy']]!.start, isNull);
    await back(tester);
    await back(tester);
    expect(find.text('Essay draft: energy policy'), findsOneWidget, reason: 'the panel closed, the board is there');
    await close(tester, c);
  });

  testWidgets('long-press a card and drop it on a list name: it goes to the end of that list', (tester) async {
    final (c, ids) = await launch(tester);
    await tester.tap(find.text('Uni'));
    await settle(tester);
    final from = tester.getCenter(find.text('Problem set 6'));
    final gesture = await tester.startGesture(from);
    await tester.pump(const Duration(milliseconds: 400));
    await gesture.moveTo(from + const Offset(0, -30));
    await tester.pump(const Duration(milliseconds: 50));
    await gesture.moveTo(tester.getCenter(find.text('Doing').first));
    await tester.pump(const Duration(milliseconds: 100));
    await gesture.up();
    await settle(tester);
    final card = c.lib.cards[ids['Problem set 6']]!;
    expect(card.listId, ids['Doing']);
    final doing = c.lib.cards.values.where((x) => x.listId == ids['Doing']).toList()
      ..sort((a, b) => a.position.compareTo(b.position));
    expect(doing.last.id, card.id);
    await syncNow(tester, c);
    expect(server.row('cards', card.id)!['listId'], ids['Doing']);
    await close(tester, c);
  });

  testWidgets('long-press and drag within a list reorders it', (tester) async {
    final (c, ids) = await launch(tester);
    await tester.tap(find.text('Uni'));
    await settle(tester);
    final from = tester.getCenter(find.text('Email the TA about the midterm'));
    final to = tester.getCenter(find.text('Lab report: heat capacity'));
    final gesture = await tester.startGesture(from);
    await tester.pump(const Duration(milliseconds: 400));
    for (var i = 1; i <= 10; i++) {
      await gesture.moveTo(Offset.lerp(from, to - const Offset(0, 30), i / 10)!);
      await tester.pump(const Duration(milliseconds: 40));
    }
    await gesture.up();
    await settle(tester);
    final todo =
        c.lib.cards.values.where((x) => x.listId == ids['To do'] && x.deletedAt == null && !x.completed).toList()
          ..sort((a, b) => a.position.compareTo(b.position));
    expect(todo.first.title, 'Email the TA about the midterm');
    await close(tester, c);
  });

  testWidgets('Today groups by board, completes in place, and plans can be taken off', (tester) async {
    final (c, ids) = await launch(tester);
    await tester.tap(find.text('Today'));
    await settle(tester);
    expect(find.text('Anki reviews'), findsOneWidget);
    expect(find.text('Daily · Planned 3 days ago'), findsOneWidget);
    expect(find.text('Pay the electricity bill'), findsNothing);

    await tester.tap(find.bySemanticsLabel('Complete Call with Sara about the logo'));
    await settle(tester);
    // Stays, struck through, while Undo runs.
    expect(find.text('Call with Sara about the logo'), findsOneWidget);
    await tester.pump(const Duration(seconds: 6));
    await settle(tester);
    expect(find.text('Call with Sara about the logo'), findsNothing);

    await tester.tap(find.bySemanticsLabel('Select cards'));
    await settle(tester);
    await tester.tap(find.text('Anki reviews'));
    await settle(tester);
    await tester.tap(find.text('Remove from today'));
    await settle(tester);
    expect(c.lib.cards[ids['Anki reviews']]!.plannedFor, isNull);
    await tester.pump(const Duration(seconds: 6));
    await close(tester, c);
  });

  testWidgets('settings: theme and density are saved and synced', (tester) async {
    final (c, _) = await launch(tester);
    await tester.tap(find.text('Settings'));
    await settle(tester);
    await tester.tap(find.text('Dark'));
    await tester.tap(find.text('Roomy'));
    await settle(tester);
    expect(c.lib.theme, 'dark');
    expect(c.lib.density, 'roomy');
    await syncNow(tester, c);
    expect(server.row('settings', 'settings')!['theme'], 'dark');
    await close(tester, c);
  });
}
