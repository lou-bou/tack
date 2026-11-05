import { describe, expect, it } from 'vitest';
import {
  compareEntries,
  entriesOnDay,
  layoutWeek,
  monthWeeks,
  selectCalendar,
  type Board,
  type CalendarEntry,
  type Card,
  type DateValue,
  type List,
} from '../src/index.js';

const d = (date: string, time: string | null = null): DateValue => ({ date, time });
const board = (id: string, showCompleted = false, deletedAt: string | null = null) =>
  ({ id, name: id, showCompleted, deletedAt, position: id }) as Board;
const list = (id: string, boardId: string, deletedAt: string | null = null) =>
  ({ id, boardId, name: `L-${id}`, deletedAt, position: id }) as List;
const card = (id: string, fields: Partial<Card> = {}) =>
  ({
    id,
    boardId: 'b',
    listId: 'l',
    position: id,
    title: id,
    start: null,
    due: d('2026-11-10'),
    priority: 'none',
    completed: false,
    deletedAt: null,
    ...fields,
  }) as Card;

const ids = (entries: { card: Card }[]) => entries.map((e) => e.card.id);

describe('selectCalendar', () => {
  const boards = [board('b'), board('shows', true)];
  const lists = [list('l', 'b'), list('m', 'shows')];

  it('shows only live cards with a due date', () => {
    const entries = selectCalendar(
      [...boards, board('binned', false, 'x')],
      [...lists, list('gone', 'b', 'x'), list('n', 'binned')],
      [
        card('yes'),
        card('noDue', { due: null, start: d('2026-11-01') }),
        card('trashed', { deletedAt: 'x' }),
        card('listGone', { listId: 'gone' }),
        card('boardGone', { listId: 'n' }),
      ],
    );
    expect(ids(entries)).toEqual(['yes']);
    expect(entries[0]).toMatchObject({ listName: 'L-l', from: '2026-11-10', to: '2026-11-10' });
  });

  it("completed cards follow each board's setting", () => {
    const entries = selectCalendar(boards, lists, [
      card('hidden', { completed: true }),
      card('shown', { completed: true, listId: 'm' }),
    ]);
    expect(ids(entries)).toEqual(['shown']);
  });

  it('filters to chosen boards, and an empty choice means all', () => {
    const cards = [card('one'), card('two', { listId: 'm' })];
    expect(ids(selectCalendar(boards, lists, cards, new Set(['shows'])))).toEqual(['two']);
    expect(selectCalendar(boards, lists, cards, new Set())).toHaveLength(2);
  });

  it('spans from start to due, and ignores a start left after due by a merge', () => {
    const [span, bad] = selectCalendar(boards, lists, [
      card('span', { start: d('2026-11-08'), due: d('2026-11-10') }),
      card('bad', { start: d('2026-11-20'), due: d('2026-11-10') }),
    ]);
    expect(span).toMatchObject({ from: '2026-11-08', to: '2026-11-10' });
    expect(bad).toMatchObject({ from: '2026-11-10', to: '2026-11-10' });
  });
});

const entry = (id: string, from: string, to = from, fields: Partial<Card> = {}): CalendarEntry => ({
  card: card(id, { due: d(to), ...fields }),
  board: board('b'),
  listName: 'L',
  from,
  to,
});

describe('layoutWeek', () => {
  // 8 to 14 November 2026, Sunday to Saturday.
  const week = monthWeeks('2026-11-15')[1]!;

  it('stacks overlapping cards in lanes and reuses free lanes', () => {
    const { segments, lanes } = layoutWeek(
      [
        entry('bar', '2026-11-09', '2026-11-11'),
        entry('same', '2026-11-10'),
        entry('later', '2026-11-12'),
      ],
      week,
    );
    const lane = Object.fromEntries(segments.map((s) => [s.entry.card.id, s.lane]));
    expect(lane).toEqual({ bar: 0, same: 1, later: 0 });
    expect(lanes).toBe(2);
    expect(segments[0]).toMatchObject({ column: 1, span: 3 });
  });

  it('clips bars at the week edges and says they continue', () => {
    const { segments } = layoutWeek([entry('long', '2026-11-01', '2026-11-20')], week);
    expect(segments[0]).toMatchObject({
      column: 0,
      span: 7,
      continuesBefore: true,
      continuesAfter: true,
    });
  });

  it('leaves out cards from other weeks', () => {
    expect(layoutWeek([entry('off', '2026-11-20')], week).segments).toEqual([]);
  });

  it('counts what overflows per day, including every day of a hidden bar', () => {
    const { segments, hidden } = layoutWeek(
      [
        entry('a', '2026-11-09', '2026-11-13'),
        entry('b', '2026-11-09', '2026-11-12'),
        entry('c', '2026-11-09', '2026-11-11'),
        entry('d', '2026-11-10'),
      ],
      week,
      2,
    );
    expect(ids(segments.map((s) => s.entry))).toEqual(['a', 'b']);
    expect(hidden).toEqual([0, 1, 2, 1, 0, 0, 0]);
  });
});

describe('ordering', () => {
  it('puts timed before all-day, then the higher priority first', () => {
    const on = '2026-11-10';
    const sorted = [
      entry('allday', on),
      entry('urgent', on, on, { priority: 'urgent' }),
      entry('late', on, on, { due: d(on, '18:00') }),
      entry('early', on, on, { due: d(on, '09:00') }),
    ].sort(compareEntries);
    expect(ids(sorted)).toEqual(['early', 'late', 'urgent', 'allday']);
  });

  it('finds cards on a day inside their span', () => {
    const entries = [entry('span', '2026-11-08', '2026-11-12'), entry('off', '2026-11-20')];
    expect(ids(entriesOnDay(entries, '2026-11-10'))).toEqual(['span']);
    expect(entriesOnDay(entries, '2026-11-13')).toEqual([]);
  });
});
