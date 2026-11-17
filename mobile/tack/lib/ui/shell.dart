import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../data/api.dart';
import '../data/store.dart';
import '../data/sync.dart';
import '../notify/notifier.dart';
import '../notify/schedule.dart';
import 'boards_page.dart';
import 'calendar_page.dart';
import 'card_page.dart';
import 'settings_page.dart';
import 'state.dart';
import 'theme.dart';
import 'today_page.dart';
import 'widgets/common.dart';
import 'widgets/logo.dart';

/// The root navigator, for opening a card from a notification.
final navigatorKey = GlobalKey<NavigatorState>();

/// The app once connected: four tabs, and sync kept running in the background (on open, on
/// resume, when the network returns, after edits, when the server announces a change, and every
/// 30 seconds). Notifications are rescheduled whenever the cards change.
class Shell extends ConsumerStatefulWidget {
  const Shell({super.key});

  @override
  ConsumerState<Shell> createState() => _ShellState();
}

class _ShellState extends ConsumerState<Shell> with WidgetsBindingObserver {
  Timer? _poll;
  Timer? _soon;
  Timer? _eventsRetry;
  StreamSubscription<void>? _net;
  StreamSubscription<void>? _local;
  StreamSubscription<String>? _events;
  late bool _splash = ref.read(splashProvider);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _net = ref.read(networkRegainedProvider).listen((_) => _sync(), onError: (_) {});
    _local = ref.read(storeProvider.notifier).localChanges.listen((_) {
      // Soon after an edit, but one request for a burst of them.
      _soon?.cancel();
      _soon = Timer(const Duration(milliseconds: 600), _sync);
    });
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => _sync());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _sync();
      _listen();
      unawaited(_startNotifications());
    });
  }

  Future<void> _startNotifications() async {
    final notifier = ref.read(dueNotifierProvider);
    try {
      await notifier.init(_openFromNotification);
      final card = await notifier.launchCard();
      if (card != null) _openFromNotification(card);
    } catch (_) {
      // No notification support here (tests, an unsupported platform): the app works without.
    }
    if (mounted) ref.read(notificationSchedulerProvider).start();
  }

  void _openFromNotification(String cardId) {
    final ctx = navigatorKey.currentContext;
    if (ctx != null) openCard(ctx, cardId);
  }

  void _sync() => unawaited(ref.read(syncProvider.notifier).sync());

  /// Server-sent events: each one means another device changed something.
  void _listen() {
    _events?.cancel();
    _eventsRetry?.cancel();
    _events = ref
        .read(tackApiProvider)
        .events()
        .listen((_) => _sync(), onError: (_) => _retryEvents(), onDone: _retryEvents, cancelOnError: true);
  }

  void _retryEvents() {
    _eventsRetry?.cancel();
    _eventsRetry = Timer(const Duration(seconds: 20), () {
      if (mounted) _listen();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(nowProvider.notifier).refresh();
      _sync();
      _listen();
      _poll?.cancel();
      _poll = Timer.periodic(const Duration(seconds: 30), (_) => _sync());
    } else if (state == AppLifecycleState.paused) {
      // Send what's queued before Android stops the app, and stop talking in the background.
      _sync();
      _poll?.cancel();
      _events?.cancel();
      _eventsRetry?.cancel();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _soon?.cancel();
    _eventsRetry?.cancel();
    _net?.cancel();
    _local?.cancel();
    _events?.cancel();
    super.dispose();
  }

  /// Back: out of a board, then out of Select mode, then to the Boards tab, then out.
  Future<void> _back() async {
    final tab = ref.read(tabProvider);
    final boards = boardsNavKey.currentState;
    if (tab == 0 && boards != null && boards.canPop()) {
      await boards.maybePop();
      return;
    }
    if (backHandlers[tab]?.call() ?? false) return;
    if (tab != 0) {
      ref.read(tabProvider.notifier).go(0);
      return;
    }
    await SystemNavigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    final tab = ref.watch(tabProvider);
    final t = context.kit;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: overlayStyle(t, Theme.of(context).brightness),
        child: Stack(
          children: [
            Scaffold(
              backgroundColor: t.bg,
              body: IndexedStack(
                index: tab,
                children: [
                  HeroControllerScope.none(
                    child: Navigator(
                      key: boardsNavKey,
                      onGenerateRoute: (_) => MaterialPageRoute<void>(builder: (_) => const BoardsPage()),
                    ),
                  ),
                  const TodayPage(),
                  const CalendarPage(),
                  const SettingsPage(),
                ],
              ),
              bottomNavigationBar: const _TabBar(),
            ),
            if (_splash)
              Positioned.fill(
                child: Splash(target: logoKey, onDone: () => setState(() => _splash = false)),
              ),
          ],
        ),
      ),
    );
  }
}

/// Boards, Today, Calendar, Settings, with icon and label; the active tab in the accent colour,
/// and the Today badge (overdue, due today and planned).
class _TabBar extends ConsumerWidget {
  const _TabBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.kit;
    final tab = ref.watch(tabProvider);
    final badge = ref.watch(todayBadgeProvider);
    const tabs = [
      (LucideIcons.layoutGrid, 'Boards'),
      (LucideIcons.sun, 'Today'),
      (LucideIcons.calendarDays, 'Calendar'),
      (LucideIcons.settings, 'Settings'),
    ];
    return Container(
      decoration: BoxDecoration(
        color: t.bg,
        border: Border(top: BorderSide(color: t.border)),
      ),
      padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom),
      child: SizedBox(
        height: 60,
        child: Row(
          children: [
            for (final (i, (icon, label)) in tabs.indexed)
              Expanded(
                child: Semantics(
                  selected: i == tab,
                  button: true,
                  label: i == 1 && badge > 0 ? '$label, $badge' : label,
                  excludeSemantics: true,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () {
                      HapticFeedback.selectionClick();
                      if (i == tab && i == 0) boardsNavKey.currentState?.popUntil((r) => r.isFirst);
                      ref.read(tabProvider.notifier).go(i);
                    },
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Stack(
                          clipBehavior: Clip.none,
                          children: [
                            AnimatedContainer(
                              duration: Motion.fast,
                              width: 56,
                              height: 30,
                              decoration: BoxDecoration(
                                color: i == tab ? t.accentSoft : null,
                                borderRadius: BorderRadius.circular(Radii.pill),
                              ),
                              child: Icon(icon, size: 20, color: i == tab ? t.accent : t.textMuted),
                            ),
                            if (i == 1 && badge > 0)
                              Positioned(
                                top: -4,
                                right: 4,
                                child: Container(
                                  constraints: const BoxConstraints(minWidth: 18),
                                  height: 18,
                                  padding: const EdgeInsets.symmetric(horizontal: 5),
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    color: t.accent,
                                    borderRadius: BorderRadius.circular(Radii.pill),
                                    border: Border.all(color: t.bg, width: 1.5),
                                  ),
                                  child: Text(
                                    badge > 99 ? '99+' : '$badge',
                                    style: context.mono(11, color: t.onAccent, weight: FontWeight.w600),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          label,
                          style: context.text.labelMedium!.copyWith(
                            color: i == tab ? t.text : t.textMuted,
                            fontWeight: i == tab ? FontWeight.w600 : FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
