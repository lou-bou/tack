import { PRIORITIES } from './constants.js';
import { startAfterDue } from './dates.js';
import { byPosition } from './positions.js';
import type { Board, Card, List } from './schema.js';
import { isCardLive } from './selection.js';

export interface CalendarEntry {
  card: Card;
  board: Board;
  listName: string;
  /** The first day it shows on: its start date, or its due date when there's no valid start. */
  from: string;
  /** Its due date. */
  to: string;
}

/**
 * Every card the calendar can show: live, with a due date, and completed only where its board
 * shows completed cards (SPEC §3.7). `boardIds` narrows to those boards; empty means all.
 */
export function selectCalendar(
  boards: readonly Board[],
  lists: readonly List[],
  cards: readonly Card[],
  boardIds: ReadonlySet<string> = new Set(),
): CalendarEntry[] {
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const listById = new Map(lists.map((l) => [l.id, l]));
  const entries: CalendarEntry[] = [];
  for (const card of cards) {
    if (!card.due || !isCardLive(card, listById, boardById)) continue;
    const list = listById.get(card.listId)!;
    const board = boardById.get(list.boardId)!;
    if (boardIds.size > 0 && !boardIds.has(board.id)) continue;
    if (card.completed && !board.showCompleted) continue;
    // A sync merge can leave start after due. It shows on its due date until the next edit.
    const from =
      card.start && !startAfterDue(card.start, card.due) ? card.start.date : card.due.date;
    entries.push({ card, board, listName: list.name, from, to: card.due.date });
  }
  return entries;
}

/** Longest bars first, so they get the top lanes, then timed before all-day, then by priority. */
export function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  const aSpan = a.from !== a.to;
  const bSpan = b.from !== b.to;
  if (aSpan !== bSpan) return aSpan ? -1 : 1;
  if (a.from !== b.from) return a.from < b.from ? -1 : 1;
  if (a.to !== b.to) return a.to > b.to ? -1 : 1;
  const aTime = a.card.due?.time ?? null;
  const bTime = b.card.due?.time ?? null;
  if (!aTime !== !bTime) return aTime ? -1 : 1;
  if (aTime && bTime && aTime !== bTime) return aTime < bTime ? -1 : 1;
  const priority = PRIORITIES.indexOf(b.card.priority) - PRIORITIES.indexOf(a.card.priority);
  return priority !== 0 ? priority : byPosition(a.card, b.card);
}

export function entriesOnDay(entries: readonly CalendarEntry[], date: string): CalendarEntry[] {
  return entries.filter((e) => e.from <= date && date <= e.to).sort(compareEntries);
}

export interface WeekSegment {
  entry: CalendarEntry;
  /** Column of its first day this week, 0 to 6. */
  column: number;
  /** How many days it covers this week. */
  span: number;
  lane: number;
  /** The bar carries on from the week before, or into the week after. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface WeekLayout {
  segments: WeekSegment[];
  /** Cards that didn't fit under `maxLanes`, per day of the week. */
  hidden: number[];
  /** Lanes actually used by what's shown. */
  lanes: number;
}

/** Packs a week's cards into lanes, so bars never overlap, and counts what's left over. */
export function layoutWeek(
  entries: readonly CalendarEntry[],
  week: readonly string[],
  maxLanes = Number.POSITIVE_INFINITY,
): WeekLayout {
  const first = week[0] ?? '';
  const last = week[week.length - 1] ?? '';
  const inWeek = entries.filter((e) => e.from <= last && first <= e.to).sort(compareEntries);

  const laneEnds: number[] = []; // The last column used in each lane.
  const segments: WeekSegment[] = [];
  const hidden = week.map(() => 0);

  for (const entry of inWeek) {
    const column = entry.from < first ? 0 : week.indexOf(entry.from);
    const end = entry.to > last ? week.length - 1 : week.indexOf(entry.to);
    let lane = laneEnds.findIndex((used) => used < column);
    if (lane < 0) lane = laneEnds.length;
    if (lane >= maxLanes) {
      for (let day = column; day <= end; day += 1) hidden[day]! += 1;
      continue;
    }
    laneEnds[lane] = end;
    segments.push({
      entry,
      column,
      span: end - column + 1,
      lane,
      continuesBefore: entry.from < first,
      continuesAfter: entry.to > last,
    });
  }
  return { segments, hidden, lanes: laneEnds.length };
}
