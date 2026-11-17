import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../data/dates.dart';
import '../data/selection.dart';
import '../data/store.dart';
import 'bell.dart';
import 'boards_page.dart';
import 'card_page.dart';
import 'settings_page.dart';
import 'state.dart';
import 'theme.dart';
import 'widgets/card_face.dart';
import 'widgets/common.dart';

/// "Planned yesterday" and so on, for a plan carried over from an earlier day.
String? plannedNote(TaskCard card, int now) {
  if (todayReason(card, now) != TodayReason.planned || card.plannedFor == null) return null;
  final days = daysBetween(card.plannedFor!, todayString(now));
  if (days <= 0) return null;
  return days == 1 ? 'Planned yesterday' : 'Planned $days days ago';
}

/// "What do I have to do today", across all boards (SPEC §3.6): overdue, due today and in
/// progress, then what was planned by hand, grouped by board. Ticking a card completes it in
/// place: it stays, struck through, while its Undo toast runs, then collapses out.
class TodayPage extends ConsumerStatefulWidget {
  const TodayPage({super.key});

  @override
  ConsumerState<TodayPage> createState() => _TodayPageState();
}

class _TodayPageState extends ConsumerState<TodayPage> {
  /// Ticked cards still on screen: held while Undo runs, then leaving.
  final Map<String, bool> _held = {};
  final Map<String, List<Timer>> _timers = {};
  bool _selecting = false;
  final Set<String> _selected = {};

  static const _collapse = Duration(milliseconds: 250);

  @override
  void initState() {
    super.initState();
    backHandlers[1] = () {
      if (!_selecting) return false;
      _stopSelecting();
      return true;
    };
  }

  @override
  void dispose() {
    backHandlers.remove(1);
    for (final list in _timers.values) {
      for (final t in list) {
        t.cancel();
      }
    }
    super.dispose();
  }

  void _release(String id) {
    for (final t in _timers.remove(id) ?? const <Timer>[]) {
      t.cancel();
    }
    if (mounted) setState(() => _held.remove(id));
  }

  void _toggle(TaskCard card, bool _) {
    final store = ref.read(storeProvider.notifier);
    HapticFeedback.lightImpact();
    if (card.completed) {
      // Unticking within the Undo window keeps it on the screen, now open again.
      store.setCardCompleted(card.id, false);
      _release(card.id);
      return;
    }
    store.setCardCompleted(card.id, true);
    setState(() => _held[card.id] = false);
    _timers[card.id] = [
      Timer(undoDuration, () {
        if (mounted) setState(() => _held[card.id] = true);
      }),
      Timer(undoDuration + _collapse, () => _release(card.id)),
    ];
    Toasts.show(
      'Card completed',
      duration: undoDuration,
      actionLabel: 'Undo',
      onAction: () {
        store.setCardCompleted(card.id, false);
        _release(card.id);
      },
    );
  }

  void _stopSelecting() => setState(() {
    _selecting = false;
    _selected.clear();
  });

  @override
  Widget build(BuildContext context) {
    final lib = ref.watch(storeProvider);
    final now = ref.watch(nowProvider);
    final d = ref.watch(densityProvider);
    // A held card still counts as open for choosing what's on the screen.
    final forSelection = [
      for (final c in lib.cards.values) _held.containsKey(c.id) ? c.withFields({'completed': false}) : c,
    ];
    final groups = selectToday(lib.boards, lib.lists, forSelection, now);
    final anyPlanned = groups.any((g) => g.cards.any((c) => isPlanned(lib.cards[c.id]!, now)));
    final selection = _selecting
        ? CardSelection(
            selected: _selected,
            toggle: (id) => setState(() => _selected.contains(id) ? _selected.remove(id) : _selected.add(id)),
            // Only cards put here by hand can be taken off. Due dates keep the rest here.
            canSelect: (c) => isPlanned(c, now),
          )
        : null;

    return ColoredBox(
      color: context.kit.bg,
      child: Stack(
        children: [
          Column(
            children: [
              TopBar(
                title: 'Today',
                onFix: () => openConnection(context),
                actions: [
                  if (anyPlanned || _selecting)
                    IconBtn(
                      icon: LucideIcons.listChecks,
                      label: _selecting ? 'Stop selecting' : 'Select cards',
                      active: _selecting,
                      onTap: _selecting ? _stopSelecting : () => setState(() => _selecting = true),
                    ),
                  const BellButton(),
                ],
              ),
              Expanded(
                child: groups.isEmpty
                    ? (lib.synced ? const EmptyLine('Nothing due today.') : const SizedBox.shrink())
                    : ListView(
                        padding: EdgeInsets.fromLTRB(Space.s4, Space.s2, Space.s4, _selecting ? 160 : Space.s8),
                        children: [
                          for (final g in groups) ...[
                            Semantics(
                              header: true,
                              button: true,
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () => openBoard(ref, g.board.id),
                                child: Padding(
                                  padding: const EdgeInsets.only(top: Space.s3, bottom: Space.s2),
                                  child: Row(
                                    children: [
                                      Flexible(
                                        child: Text(
                                          g.board.title,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: context.text.titleSmall!.copyWith(fontSize: 15),
                                        ),
                                      ),
                                      const SizedBox(width: Space.s1),
                                      Icon(LucideIcons.chevronRight, size: 16, color: context.kit.textFaint),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            for (final shown in g.cards)
                              Builder(
                                builder: (context) {
                                  final card = lib.cards[shown.id]!;
                                  final listName = lib.lists[card.listId]?.name ?? '';
                                  final note = plannedNote(shown, now);
                                  return CardSlot(
                                    key: ValueKey(card.id),
                                    leaving: _held[card.id] == true,
                                    gap: d.gap,
                                    child: CardFace(
                                      card: card,
                                      now: now,
                                      listName: note == null ? listName : '$listName · $note',
                                      selection: selection,
                                      onToggle: _toggle,
                                      onOpen: (c) => openCard(context, c.id),
                                    ),
                                  );
                                },
                              ),
                          ],
                        ],
                      ),
              ),
            ],
          ),
          if (_selecting)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: SelectionBar(
                count: _selected.length,
                onCancel: _stopSelecting,
                actions: [
                  KitButton(
                    label: 'Remove from today',
                    small: true,
                    variant: ButtonVariant.primary,
                    onPressed: _selected.isEmpty
                        ? null
                        : () {
                            planCards(ref, _selected, plan: false);
                            _stopSelecting();
                          },
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
