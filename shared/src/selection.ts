import { PRIORITIES, TRASH_DAYS } from './constants.js';
import { daysBetween, isOverdue, todayString, type DateValue } from './dates.js';
import { byPosition } from './positions.js';
import type { Board, Card, List } from './schema.js';

/** A card is visible only if it, its list and its board are all live (no cascading deletes). */
export function isCardLive(
  card: Pick<Card, 'deletedAt' | 'listId'>,
  lists: ReadonlyMap<string, Pick<List, 'deletedAt' | 'boardId'>>,
  boards: ReadonlyMap<string, Pick<Board, 'deletedAt'>>,
): boolean {
  if (card.deletedAt) return false;
  const list = lists.get(card.listId);
  if (!list || list.deletedAt) return false;
  const board = boards.get(list.boardId);
  return !!board && !board.deletedAt;
}

export type TodayReason = 'overdue' | 'dueToday' | 'inProgress';

/** Why a card belongs on Today, or null if it doesn't (SPEC §3.6). */
export function todayReason(
  card: { completed: boolean; start: DateValue | null; due: DateValue | null },
  now: number,
): TodayReason | null {
  if (card.completed || !card.due) return null;
  const today = todayString(now);
  if (isOverdue(card.due, now)) return 'overdue';
  if (card.due.date === today) return 'dueToday';
  if (card.start && card.start.date <= today && card.due.date > today) return 'inProgress';
  return null;
}

/** Overdue first, then by due time with timed cards before date-only, then by priority. */
export function compareToday(a: Card, b: Card, now: number): number {
  const aDue = a.due as DateValue;
  const bDue = b.due as DateValue;
  const overdue = Number(isOverdue(bDue, now)) - Number(isOverdue(aDue, now));
  if (overdue !== 0) return overdue;
  if (aDue.date !== bDue.date) return aDue.date < bDue.date ? -1 : 1;
  if (!aDue.time !== !bDue.time) return aDue.time ? -1 : 1;
  if (aDue.time && bDue.time && aDue.time !== bDue.time) return aDue.time < bDue.time ? -1 : 1;
  // PRIORITIES runs none → urgent, and urgent sorts first.
  const priority = PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority);
  if (priority !== 0) return priority;
  return byPosition(a, b);
}

export interface TodayGroup {
  board: Board;
  cards: Card[];
}

export function selectToday(
  boards: readonly Board[],
  lists: readonly List[],
  cards: readonly Card[],
  now: number,
): TodayGroup[] {
  const listById = new Map(lists.map((l) => [l.id, l]));
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const byBoard = new Map<string, Card[]>();
  for (const card of cards) {
    if (!isCardLive(card, listById, boardById) || !todayReason(card, now)) continue;
    const boardId = listById.get(card.listId)!.boardId;
    const group = byBoard.get(boardId);
    if (group) group.push(card);
    else byBoard.set(boardId, [card]);
  }
  return [...boards]
    .filter((b) => byBoard.has(b.id))
    .sort(byPosition)
    .map((board) => ({
      board,
      cards: byBoard.get(board.id)!.sort((a, b) => compareToday(a, b, now)),
    }));
}

/** The Today badge: overdue plus due today, leaving out cards that are only in progress. */
export function todayBadgeCount(
  boards: readonly Board[],
  lists: readonly List[],
  cards: readonly Card[],
  now: number,
): number {
  const listById = new Map(lists.map((l) => [l.id, l]));
  const boardById = new Map(boards.map((b) => [b.id, b]));
  return cards.filter((card) => {
    if (!isCardLive(card, listById, boardById)) return false;
    const reason = todayReason(card, now);
    return reason === 'overdue' || reason === 'dueToday';
  }).length;
}

/** Days until an item's automatic purge, never below 0. */
export function trashDaysLeft(deletedAt: string, now: number): number {
  const deletedOn = todayString(new Date(deletedAt).getTime());
  return Math.max(0, TRASH_DAYS - daysBetween(deletedOn, todayString(now)));
}

export type TrashKind = 'board' | 'list' | 'card';

/** One row per item deleted directly. Its children come back with it, so they have no row. */
export interface TrashRow {
  kind: TrashKind;
  id: string;
  name: string;
  /** Where it came from, empty for a board. */
  where: string;
  deletedAt: string;
  daysLeft: number;
  /** Live cards that go and come back with this list or board. */
  cardCount: number;
  /** A list or card can't come back while its board is in Trash. */
  needsBoard: boolean;
}

/** Everything in Trash, newest first (SPEC §3.9). */
export function selectTrash(
  boards: readonly Board[],
  lists: readonly List[],
  cards: readonly Card[],
  now: number,
): TrashRow[] {
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const listById = new Map(lists.map((l) => [l.id, l]));
  const rows: TrashRow[] = [];

  for (const board of boards) {
    if (!board.deletedAt) continue;
    rows.push({
      kind: 'board',
      id: board.id,
      name: board.name,
      where: '',
      deletedAt: board.deletedAt,
      daysLeft: trashDaysLeft(board.deletedAt, now),
      cardCount: cards.filter((c) => c.boardId === board.id && !c.deletedAt).length,
      needsBoard: false,
    });
  }
  for (const list of lists) {
    const board = boardById.get(list.boardId);
    // No board row means it was purged here, and this row's tombstone just hasn't arrived yet.
    if (!list.deletedAt || !board) continue;
    rows.push({
      kind: 'list',
      id: list.id,
      name: list.name,
      where: board.name,
      deletedAt: list.deletedAt,
      daysLeft: trashDaysLeft(list.deletedAt, now),
      cardCount: cards.filter((c) => c.listId === list.id && !c.deletedAt).length,
      needsBoard: !!board.deletedAt,
    });
  }
  for (const card of cards) {
    const board = boardById.get(card.boardId);
    if (!card.deletedAt || !board) continue;
    const list = listById.get(card.listId);
    rows.push({
      kind: 'card',
      id: card.id,
      name: card.title,
      where: list ? `${board.name} / ${list.name}` : board.name,
      deletedAt: card.deletedAt,
      daysLeft: trashDaysLeft(card.deletedAt, now),
      cardCount: 0,
      needsBoard: !!board.deletedAt,
    });
  }
  return rows.sort((a, b) =>
    a.deletedAt === b.deletedAt ? a.id.localeCompare(b.id) : a.deletedAt < b.deletedAt ? 1 : -1,
  );
}

export type CardRestorePlan =
  { kind: 'inPlace' } | { kind: 'moveTo'; listId: string } | { kind: 'newList' };

/**
 * Where a card goes back to: its own list if that's live, otherwise the board's first live list.
 * A board with no lists left gets a new one (PLAN §5).
 */
export function cardRestorePlan(
  card: Pick<Card, 'listId'>,
  boardLists: readonly List[],
): CardRestorePlan {
  const live = boardLists.filter((l) => !l.deletedAt).sort(byPosition);
  if (live.some((l) => l.id === card.listId)) return { kind: 'inPlace' };
  const first = live[0];
  return first ? { kind: 'moveTo', listId: first.id } : { kind: 'newList' };
}
