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
