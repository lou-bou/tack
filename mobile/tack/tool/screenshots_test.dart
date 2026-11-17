// Renders every screen to PNG with the real fonts, for a visual check without a phone:
//
//   flutter test tool/screenshots_test.dart --update-goldens
//
// Images land in build/screens/. Not part of the normal test run. Uses the real SQLite store,
// the real sync engine and a fake server, at a fixed time (17/11/2026 10:30). Emoji show as
// boxes: the test renderer has no emoji font; Android does.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:tack/app.dart';
import 'package:tack/data/store.dart';
import 'package:tack/ui/card_page.dart';
import 'package:tack/ui/shell.dart';

import '../test/fake_server.dart';
import '../test/seed.dart';

Future<void> loadAppFonts() async {
  final manifest = jsonDecode(await rootBundle.loadString('FontManifest.json')) as List;
  for (final entry in manifest) {
    final loader = FontLoader(entry['family'] as String);
    for (final font in entry['fonts'] as List) {
      loader.addFont(rootBundle.load(font['asset'] as String));
    }
    await loader.load();
  }
}

void main() {
  late Directory dir;

  setUpAll(loadAppFonts);

  Future<(Client, Map<String, String>)> launch(
    WidgetTester tester, {
    bool dark = false,
    bool seed = true,
    bool connected = true,
    String density = 'compact',
  }) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.75;
    tester.view.padding = const FakeViewPadding(top: 66, bottom: 44);
    tester.view.viewPadding = const FakeViewPadding(top: 66, bottom: 44);
    addTearDown(tester.view.reset);
    late Client c;
    var ids = <String, String>{};
    await tester.runAsync(() async {
      dir = Directory.systemTemp.createTempSync('tack_shots');
      final server = FakeTack(now: () => seedNow);
      c = await Client.start(server, dir, connected: connected, clock: () => seedNow);
      if (seed) ids = await seedBoards(c.container, server);
      if (dark) c.store.setTheme('dark');
      if (density != 'compact') c.store.setDensity(density);
    });
    await tester.pumpWidget(UncontrolledProviderScope(container: c.container, child: const TackApp()));
    await real(tester, 8);
    return (c, ids);
  }

  Future<void> shot(WidgetTester tester, String name) async {
    await settle(tester);
    await expectLater(find.byType(TackApp), matchesGoldenFile('../build/screens/$name.png'));
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

  Future<void> tab(WidgetTester tester, String label) async {
    final bar = find.byWidgetPredicate((w) => w.runtimeType.toString() == '_TabBar');
    await tester.tap(find.descendant(of: bar, matching: find.text(label)));
    await settle(tester);
  }

  /// The Android Back button.
  Future<void> dismiss(WidgetTester tester) async {
    await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
      'flutter/navigation',
      const JSONMethodCodec().encodeMethodCall(const MethodCall('popRoute')),
      (_) {},
    );
    await settle(tester);
  }

  testWidgets('light', (tester) async {
    final (c, ids) = await launch(tester);
    await shot(tester, '01-boards');

    await tester.tap(find.text('Uni'));
    await settle(tester);
    await shot(tester, '02-board');

    await tester.tap(find.text('Add card').first);
    await settle(tester);
    await tester.enterText(find.byType(EditableText).last, 'Book the library room');
    await settle(tester);
    await shot(tester, '03-composer');
    await tester.tap(find.bySemanticsLabel('Close').last);
    await settle(tester);

    // Mid-drag: the card lifted over the "Doing" list name in the strip.
    final from = tester.getCenter(find.text('Problem set 6'));
    final gesture = await tester.startGesture(from);
    await tester.pump(const Duration(milliseconds: 400));
    await gesture.moveTo(from + const Offset(0, -40));
    await tester.pump(const Duration(milliseconds: 50));
    await gesture.moveTo(tester.getCenter(find.text('Doing').first));
    await tester.pump(const Duration(milliseconds: 200));
    await expectLater(find.byType(TackApp), matchesGoldenFile('../build/screens/04-drag.png'));
    await gesture.up();
    await settle(tester);
    // The card went to the end of "Doing".
    expect(c.lib.cards[ids['Problem set 6']]!.listId, ids['Doing']);

    await tester.tap(find.bySemanticsLabel('Select cards'));
    await settle(tester);
    await tester.tap(find.text('Essay draft: energy policy'));
    await tester.tap(find.text('Email the TA about the midterm'));
    await settle(tester);
    await shot(tester, '05-select');
    await tester.tap(find.text('Cancel'));
    await settle(tester);

    openCard(navigatorKey.currentContext!, ids['Lab report: heat capacity']!);
    await settle(tester);
    await shot(tester, '06-card');
    await tester.drag(find.byType(ListView).last, const Offset(0, -500));
    await settle(tester);
    await shot(tester, '07-card-lower');
    await tester.tap(find.textContaining('Collect the data', findRichText: true));
    await settle(tester);
    await shot(tester, '08-description-editing');
    await dismiss(tester);

    openCard(navigatorKey.currentContext!, ids['Essay draft: energy policy']!);
    await settle(tester);
    await tester.tap(find.bySemanticsLabel(RegExp('^Due:')));
    await settle(tester);
    await tester.tap(find.text('Add time'));
    await settle(tester);
    await shot(tester, '09-date-picker');
    await dismiss(tester);
    await dismiss(tester);

    await tab(tester, 'Today');
    await shot(tester, '10-today');
    await tab(tester, 'Calendar');
    await shot(tester, '11-calendar-month');
    await tester.tap(find.text('Week'));
    await settle(tester);
    await shot(tester, '12-calendar-week');
    await tester.tap(find.bySemanticsLabel(RegExp('^Add a card due')).first);
    await settle(tester);
    await shot(tester, '13-quick-add');
    await dismiss(tester);
    await tester.tap(find.text('Month'));
    await settle(tester);

    await tab(tester, 'Settings');
    await shot(tester, '14-settings');
    await tester.drag(find.byType(ListView).last, const Offset(0, -700));
    await settle(tester);
    await shot(tester, '15-settings-lower');

    await tab(tester, 'Boards');
    await tab(tester, 'Boards'); // again: back to the grid
    await tester.tap(find.bySemanticsLabel(RegExp('^Notifications')).first);
    await settle(tester);
    await shot(tester, '16-bell');
    await dismiss(tester);
    await tester.tap(find.byTooltip('Menu for Uni').first);
    await settle(tester);
    await shot(tester, '17-board-menu');
    await dismiss(tester);
    await tester.tap(find.text('New board'));
    await settle(tester);
    await shot(tester, '18-new-board');
    await dismiss(tester);
    await close(tester, c);
  });

  testWidgets('dark', (tester) async {
    final (c, ids) = await launch(tester, dark: true);
    await shot(tester, '20-boards-dark');
    await tester.tap(find.text('Uni'));
    await settle(tester);
    await shot(tester, '21-board-dark');
    openCard(navigatorKey.currentContext!, ids['Lab report: heat capacity']!);
    await settle(tester);
    await shot(tester, '22-card-dark');
    await dismiss(tester);
    await tab(tester, 'Today');
    await shot(tester, '23-today-dark');
    await tab(tester, 'Calendar');
    await shot(tester, '24-calendar-dark');
    await tab(tester, 'Settings');
    await shot(tester, '25-settings-dark');
    await close(tester, c);
  });

  testWidgets('roomy, completed shown, offline', (tester) async {
    final (c, ids) = await launch(tester, density: 'roomy');
    c.store.updateBoard(ids['Uni']!, {'showCompleted': true});
    await tester.runAsync(() async {
      await c.container.read(storeProvider.notifier).flushed;
    });
    await tester.tap(find.text('Uni'));
    await settle(tester);
    await tester.tap(find.text('Done').first);
    await settle(tester);
    await shot(tester, '30-board-roomy-done-list');
    await close(tester, c);
  });

  testWidgets('first run', (tester) async {
    final (c, _) = await launch(tester, seed: false, connected: false);
    await shot(tester, '40-connect');
    await close(tester, c);
  });

  testWidgets('splash', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    late Client c;
    await tester.runAsync(() async {
      dir = Directory.systemTemp.createTempSync('tack_shots');
      final server = FakeTack(now: () => seedNow);
      c = await Client.start(server, dir, clock: () => seedNow, splash: true);
      await seedBoards(c.container, server);
    });
    await tester.pumpWidget(UncontrolledProviderScope(container: c.container, child: const TackApp()));
    await tester.pump(const Duration(milliseconds: 700));
    await expectLater(find.byType(TackApp), matchesGoldenFile('../build/screens/41-splash-pin.png'));
    await tester.pump(const Duration(milliseconds: 500));
    await expectLater(find.byType(TackApp), matchesGoldenFile('../build/screens/42-splash-fly.png'));
    await close(tester, c);
  });
}

/// Let real I/O (SQLite) finish, pumping frames in between.
Future<void> real(WidgetTester tester, [int rounds = 20]) async {
  for (var i = 0; i < rounds; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// pumpAndSettle that also lets SQLite writes land.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
  await real(tester, 4);
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}
