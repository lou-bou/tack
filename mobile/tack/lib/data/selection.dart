/// What each screen shows, ported from shared/src/selection.ts and shared/src/calendar.ts.
library;

import 'dates.dart';
import 'model.dart';
import 'positions.dart';

/// A card is visible only if it, its list and its board are all live (no cascading deletes).
bool isCardLive(TaskCard card, Map<String, BoardList> lists, Map<String, Board> boards) {
  if (card.deletedAt != null) return false;
  final list = lists[card.listId];
  if (list == null || list.deletedAt != null) return false;
  final board = boards[list.boardId];
  return board != null && board.deletedAt == null;
}

enum TodayReason { overdue, dueToday, inProgress, planned }

/// Put on Today by hand, on or before today. A plan carries over until done or taken off.
bool isPlanned(TaskCard card, int now) =>
    !card.completed &&
    card.plannedFor != null &&
    card.plannedFor!.isNotEmpty &&
    card.plannedFor!.compareTo(todayString(now)) <= 0;

/// Why a card belongs on Today, or null if it doesn't (SPEC §3.6). Dates win over a plan.
TodayReason? todayReason(TaskCard card, int now) {
  if (card.completed) return null;
  final today = todayString(now);
  final due = card.due;
  if (due != null) {
    if (isOverdue(due, now)) return TodayReason.overdue;
    if (due.date == today) return TodayReason.dueToday;
    final start = card.start;
    if (start != null && start.date.compareTo(today) <= 0 && due.date.compareTo(today) > 0) {
      return TodayReason.inProgress;
    }
  }
  return isPlanned(card, now) ? TodayReason.planned : null;
}

// `priorities` runs none → urgent, and urgent sorts first.
int _byPriority(TaskCard a, TaskCard b) => priorities.indexOf(b.priority) - priorities.indexOf(a.priority);

/// Overdue first, then by due time with timed cards before date-only, then by priority. Cards
/// only there because they were planned come after, longest-waiting first.
int compareToday(TaskCard a, TaskCard b, int now) {
  final aPlanned = todayReason(a, now) == TodayReason.planned;
  final bPlanned = todayReason(b, now) == TodayReason.planned;
  if (aPlanned != bPlanned) return aPlanned ? 1 : -1;
  if (aPlanned) {
    final aDay = a.plannedFor ?? '';
    final bDay = b.plannedFor ?? '';
    if (aDay != bDay) return aDay.compareTo(bDay) < 0 ? -1 : 1;
    final p = _byPriority(a, b);
    return p != 0 ? p : byPosition(a, b);
  }
  final aDue = a.due!;
  final bDue = b.due!;
  final overdue = (isOverdue(bDue, now) ? 1 : 0) - (isOverdue(aDue, now) ? 1 : 0);
  if (overdue != 0) return overdue;
  if (aDue.date != bDue.date) return aDue.date.compareTo(bDue.date) < 0 ? -1 : 1;
  if ((aDue.time == null) != (bDue.time == null)) return aDue.time != null ? -1 : 1;
  if (aDue.time != null && bDue.time != null && aDue.time != bDue.time) {
    return aDue.time!.compareTo(bDue.time!) < 0 ? -1 : 1;
  }
  final p = _byPriority(a, b);
  return p != 0 ? p : byPosition(a, b);
}

class TodayGroup {
  const TodayGroup(this.board, this.cards);
  final Board board;
  final List<TaskCard> cards;
}

List<TodayGroup> selectToday(
  Map<String, Board> boards,
  Map<String, BoardList> lists,
  Iterable<TaskCard> cards,
  int now,
) {
  final byBoard = <String, List<TaskCard>>{};
  for (final card in cards) {
    if (!isCardLive(card, lists, boards) || todayReason(card, now) == null) continue;
    byBoard.putIfAbsent(lists[card.listId]!.boardId, () => []).add(card);
  }
  final shown = boards.values.where((b) => byBoard.containsKey(b.id)).toList()..sort(byPosition);
  return [for (final board in shown) TodayGroup(board, byBoard[board.id]!..sort((a, b) => compareToday(a, b, now)))];
}

/// The Today badge: overdue, due today and planned, leaving out cards that are only in progress.
int todayBadgeCount(Map<String, Board> boards, Map<String, BoardList> lists, Iterable<TaskCard> cards, int now) {
  var n = 0;
  for (final card in cards) {
    if (!isCardLive(card, lists, boards)) continue;
    final reason = todayReason(card, now);
    if (reason == TodayReason.overdue || reason == TodayReason.dueToday || isPlanned(card, now)) n++;
  }
  return n;
}

/// Days until an item's automatic purge, never below 0.
int trashDaysLeft(String deletedAt, int now) {
  final deletedOn = todayString(DateTime.parse(deletedAt).millisecondsSinceEpoch);
  final left = trashDays - daysBetween(deletedOn, todayString(now));
  return left < 0 ? 0 : left;
}

enum TrashKind { board, list, card }

const trashTable = {TrashKind.board: 'boards', TrashKind.list: 'lists', TrashKind.card: 'cards'};

/// One row per item deleted directly. Its children come back with it, so they have no row.
class TrashRow {
  const TrashRow({
    required this.kind,
    required this.id,
    required this.name,
    required this.where,
    required this.deletedAt,
    required this.daysLeft,
    required this.cardCount,
    required this.needsBoard,
  });
  final TrashKind kind;
  final String id;
  final String name;

  /// Where it came from, empty for a board.
  final String where;
  final String deletedAt;
  final int daysLeft;

  /// Live cards that go and come back with this list or board.
  final int cardCount;

  /// A list or card can't come back while its board is in Trash.
  final bool needsBoard;
}

/// Everything in Trash, newest first (SPEC §3.9).
List<TrashRow> selectTrash(Map<String, Board> boards, Map<String, BoardList> lists, Iterable<TaskCard> cards, int now) {
  final rows = <TrashRow>[];
  for (final board in boards.values) {
    if (board.deletedAt == null) continue;
    rows.add(
      TrashRow(
        kind: TrashKind.board,
        id: board.id,
        name: board.name,
        where: '',
        deletedAt: board.deletedAt!,
        daysLeft: trashDaysLeft(board.deletedAt!, now),
        cardCount: cards.where((c) => c.boardId == board.id && c.deletedAt == null).length,
        needsBoard: false,
      ),
    );
  }
  for (final list in lists.values) {
    final board = boards[list.boardId];
    // No board row means it was purged here, and this row's tombstone just hasn't arrived yet.
    if (list.deletedAt == null || board == null) continue;
    rows.add(
      TrashRow(
        kind: TrashKind.list,
        id: list.id,
        name: list.name,
        where: board.name,
        deletedAt: list.deletedAt!,
        daysLeft: trashDaysLeft(list.deletedAt!, now),
        cardCount: cards.where((c) => c.listId == list.id && c.deletedAt == null).length,
        needsBoard: board.deletedAt != null,
      ),
    );
  }
  for (final card in cards) {
    final board = boards[card.boardId];
    if (card.deletedAt == null || board == null) continue;
    final list = lists[card.listId];
    rows.add(
      TrashRow(
        kind: TrashKind.card,
        id: card.id,
        name: card.title,
        where: list != null ? '${board.name} / ${list.name}' : board.name,
        deletedAt: card.deletedAt!,
        daysLeft: trashDaysLeft(card.deletedAt!, now),
        cardCount: 0,
        needsBoard: board.deletedAt != null,
      ),
    );
  }
  rows.sort(
    (a, b) => a.deletedAt == b.deletedAt ? a.id.compareTo(b.id) : (a.deletedAt.compareTo(b.deletedAt) < 0 ? 1 : -1),
  );
  return rows;
}

/// Where a card goes back to: its own list if that's live (`inPlace`), otherwise the board's
/// first live list (`listId`), or a new list when the board has none left.
({bool inPlace, String? listId}) cardRestorePlan(TaskCard card, Iterable<BoardList> boardLists) {
  final live = boardLists.where((l) => l.deletedAt == null).toList()..sort(byPosition);
  if (live.any((l) => l.id == card.listId)) return (inPlace: true, listId: null);
  return (inPlace: false, listId: live.isEmpty ? null : live.first.id);
}

// ---------- calendar ----------

class CalendarEntry {
  const CalendarEntry({
    required this.card,
    required this.board,
    required this.listName,
    required this.from,
    required this.to,
  });
  final TaskCard card;
  final Board board;
  final String listName;

  /// The first day it shows on: its start date, or its due date when there's no valid start.
  final String from;

  /// Its due date.
  final String to;

  bool covers(String date) => from.compareTo(date) <= 0 && date.compareTo(to) <= 0;
}

/// Every card the calendar can show: live, with a due date, and completed only where its board
/// shows completed cards (SPEC §3.7). [boardIds] narrows to those boards; empty means all.
List<CalendarEntry> selectCalendar(
  Map<String, Board> boards,
  Map<String, BoardList> lists,
  Iterable<TaskCard> cards, [
  Set<String> boardIds = const {},
]) {
  final entries = <CalendarEntry>[];
  for (final card in cards) {
    final due = card.due;
    if (due == null || !isCardLive(card, lists, boards)) continue;
    final list = lists[card.listId]!;
    final board = boards[list.boardId]!;
    if (boardIds.isNotEmpty && !boardIds.contains(board.id)) continue;
    if (card.completed && !board.showCompleted) continue;
    // A sync merge can leave start after due. It shows on its due date until the next edit.
    final from = card.start != null && !startAfterDue(card.start, due) ? card.start!.date : due.date;
    entries.add(CalendarEntry(card: card, board: board, listName: list.name, from: from, to: due.date));
  }
  return entries;
}

/// Longest bars first, then timed before all-day, then by priority.
int compareEntries(CalendarEntry a, CalendarEntry b) {
  final aSpan = a.from != a.to;
  final bSpan = b.from != b.to;
  if (aSpan != bSpan) return aSpan ? -1 : 1;
  if (a.from != b.from) return a.from.compareTo(b.from) < 0 ? -1 : 1;
  if (a.to != b.to) return a.to.compareTo(b.to) > 0 ? -1 : 1;
  final aTime = a.card.due?.time;
  final bTime = b.card.due?.time;
  if ((aTime == null) != (bTime == null)) return aTime != null ? -1 : 1;
  if (aTime != null && bTime != null && aTime != bTime) return aTime.compareTo(bTime) < 0 ? -1 : 1;
  final priority = priorities.indexOf(b.card.priority) - priorities.indexOf(a.card.priority);
  return priority != 0 ? priority : byPosition(a.card, b.card);
}

List<CalendarEntry> entriesOnDay(List<CalendarEntry> entries, String date) =>
    entries.where((e) => e.covers(date)).toList()..sort(compareEntries);
