import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:material_ui/material_ui.dart';

import '../data/dates.dart';
import '../data/positions.dart';
import '../data/selection.dart';
import '../data/store.dart';
import '../data/sync.dart';

/// The current time, refreshed each minute so overdue states change without an edit.
class NowTicker extends Notifier<int> {
  @override
  int build() {
    final clock = ref.watch(wallClockProvider);
    final timer = Timer.periodic(const Duration(minutes: 1), (_) => state = clock());
    ref.onDispose(timer.cancel);
    return clock();
  }

  void refresh() => state = ref.read(wallClockProvider)();
}

final nowProvider = NotifierProvider<NowTicker, int>(NowTicker.new);

class BoardSummary {
  const BoardSummary(this.board, this.open, this.overdue);
  final Board board;
  final int open;
  final int overdue;
}

/// Live boards in order, with their counts of open and overdue cards.
final boardSummariesProvider = Provider<List<BoardSummary>>((ref) {
  final lib = ref.watch(storeProvider);
  final now = ref.watch(nowProvider);
  final open = <String, int>{};
  final overdue = <String, int>{};
  for (final card in lib.cards.values) {
    if (card.completed || !isCardLive(card, lib.lists, lib.boards)) continue;
    open[card.boardId] = (open[card.boardId] ?? 0) + 1;
    if (card.due != null && isOverdue(card.due!, now)) overdue[card.boardId] = (overdue[card.boardId] ?? 0) + 1;
  }
  final boards = lib.boards.values.where((b) => b.deletedAt == null).toList()..sort(byPosition);
  return [for (final b in boards) BoardSummary(b, open[b.id] ?? 0, overdue[b.id] ?? 0)];
});

class ListWithCards {
  const ListWithCards(this.list, this.cards);
  final BoardList list;

  /// Every live card in position order, completed ones included.
  final List<TaskCard> cards;
}

class BoardView {
  const BoardView(this.board, this.lists);
  final Board board;
  final List<ListWithCards> lists;
}

/// One board with its lists and cards. Null if it's missing or in Trash.
final boardViewProvider = Provider.family<BoardView?, String>((ref, boardId) {
  final lib = ref.watch(storeProvider);
  final board = lib.boards[boardId];
  if (board == null || board.deletedAt != null) return null;
  final byList = <String, List<TaskCard>>{};
  for (final card in lib.cards.values) {
    if (card.boardId != boardId || card.deletedAt != null) continue;
    byList.putIfAbsent(card.listId, () => []).add(card);
  }
  final lists = lib.lists.values.where((l) => l.boardId == boardId && l.deletedAt == null).toList()..sort(byPosition);
  return BoardView(board, [for (final l in lists) ListWithCards(l, (byList[l.id] ?? [])..sort(byPosition))]);
});

/// The Today badge: overdue, due today and planned.
final todayBadgeProvider = Provider<int>((ref) {
  final lib = ref.watch(storeProvider);
  return todayBadgeCount(lib.boards, lib.lists, lib.cards.values, ref.watch(nowProvider));
});

const _cardPrefix = 'cards:';
const Set<String> _none = {};

/// Cards with edits still queued. While online the queue empties in a moment, and marking that
/// would only make cards flicker on every edit, so this only counts when something is holding
/// the queue back (SPEC §4).
final unsentProvider = Provider<Set<String>>((ref) {
  final stalled = ref.watch(syncProvider.select((s) => s.stalled));
  if (!stalled) return _none;
  final keys = ref.watch(storeProvider.select((l) => l.outbox)).keys;
  return {
    for (final k in keys)
      if (k.startsWith(_cardPrefix)) k.substring(_cardPrefix.length),
  };
});

/// Live notifications of the last 30 days, newest first.
final noticesProvider = Provider<List<Notice>>((ref) {
  final now = ref.watch(nowProvider);
  final cutoff = DateTime.fromMillisecondsSinceEpoch(now - notificationKeepDays * dayMs, isUtc: true).toIso8601String();
  final rows = ref
      .watch(storeProvider.select((l) => l.notices))
      .values
      .where((n) => n.createdAt.compareTo(cutoff) >= 0)
      .toList();
  rows.sort((a, b) => b.createdAt.compareTo(a.createdAt));
  return rows;
});

const undoDuration = Duration(seconds: 5);

String cardCount(int n) => n == 1 ? '1 card' : '$n cards';

/// Plans cards for today or takes them off, then offers Undo.
void planCards(WidgetRef ref, Iterable<String> ids, {required bool plan}) {
  final list = ids.toList();
  if (list.isEmpty) return;
  final store = ref.read(storeProvider.notifier);
  final before = store.setPlanned(list, plan ? todayString(ref.read(wallClockProvider)()) : null);
  Toasts.show(
    plan ? '${cardCount(list.length)} planned for today' : '${cardCount(list.length)} taken off Today',
    duration: undoDuration,
    actionLabel: 'Undo',
    onAction: () => store.restorePlanned(before),
  );
}

/// Ticks and unticks cards. When ticking would hide a card it lingers for its done animation,
/// with the row already saved, and an Undo toast appears (SPEC §3.3).
mixin Completion<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  final Set<String> lingering = {};
  final List<Timer> _lingerTimers = [];

  static const linger = Duration(milliseconds: 450);

  void toggleCard(TaskCard card, bool willHide) {
    final store = ref.read(storeProvider.notifier);
    final completing = !card.completed;
    HapticFeedback.lightImpact();
    store.setCardCompleted(card.id, completing);
    if (!completing || !willHide) return;
    if (!MediaQuery.disableAnimationsOf(context)) {
      setState(() => lingering.add(card.id));
      _lingerTimers.add(
        Timer(linger, () {
          if (mounted) setState(() => lingering.remove(card.id));
        }),
      );
    }
    Toasts.show(
      'Card completed',
      duration: undoDuration,
      actionLabel: 'Undo',
      onAction: () => store.setCardCompleted(card.id, false),
    );
  }

  @override
  void dispose() {
    for (final t in _lingerTimers) {
      t.cancel();
    }
    super.dispose();
  }
}

/// Select mode for a screen: pick several cards, then act on them all at once.
class CardSelection {
  const CardSelection({required this.selected, required this.toggle, this.canSelect});
  final Set<String> selected;
  final void Function(String id) toggle;

  /// On Today only planned cards can be taken off, so only they can be picked there.
  final bool Function(TaskCard card)? canSelect;
}

/// Which tab the shell shows.
class TabIndex extends Notifier<int> {
  @override
  int build() => 0;
  void go(int i) => state = i;
}

final tabProvider = NotifierProvider<TabIndex, int>(TabIndex.new);

/// The splash plays once per launch. Tests and screenshots turn it off.
final splashProvider = Provider<bool>((_) => true);

/// Screens that want Back first (Today in Select mode), by tab index.
final backHandlers = <int, bool Function()>{};
