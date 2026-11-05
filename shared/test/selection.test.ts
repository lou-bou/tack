import { describe, expect, it } from 'vitest';
import {
  cardRestorePlan,
  isCardLive,
  selectTrash,
  selectToday,
  todayBadgeCount,
  todayReason,
  trashDaysLeft,
  zonedMs,
  type Board,
  type Card,
  type DateValue,
  type List,
  type Priority,
} from '../src/index.js';

const T = '2026-01-01T00:00:00.000Z';
const NOW = zonedMs('2026-11-05', '12:00');
const d = (date: string, time: string | null = null): DateValue => ({ date, time });

function board(id: string, position: string, deletedAt: string | null = null): Board {
  return {
    id,
    clocks: {},
    name: id,
    emoji: null,
    color: 'neutral',
    showCompleted: false,
    position,
    createdAt: T,
    updatedAt: T,
    deletedAt,
  };
}

function list(id: string, boardId: string, deletedAt: string | null = null): List {
  return {
    id,
    clocks: {},
    boardId,
    name: id,
    position: 'a0',
    createdAt: T,
    updatedAt: T,
    deletedAt,
  };
}

function card(
  id: string,
  overrides: {
    listId?: string;
    due?: DateValue | null;
    start?: DateValue | null;
    priority?: Priority;
    completed?: boolean;
    deletedAt?: string | null;
  } = {},
): Card {
  return {
    id,
    clocks: {},
    boardId: 'first',
    listId: 'l1',
    position: `a${id}`,
    title: id,
    description: '',
    start: null,
    due: null,
    priority: 'none',
    completed: false,
    completedAt: null,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    ...overrides,
  };
}

describe('liveness', () => {
  const lists = new Map([
    ['live', { deletedAt: null, boardId: 'b' }],
    ['gone', { deletedAt: T, boardId: 'b' }],
    ['orphan', { deletedAt: null, boardId: 'goneBoard' }],
  ]);
  const boards = new Map([
    ['b', { deletedAt: null }],
    ['goneBoard', { deletedAt: T }],
  ]);

  it('needs the card, list and board all live', () => {
    expect(isCardLive({ deletedAt: null, listId: 'live' }, lists, boards)).toBe(true);
    expect(isCardLive({ deletedAt: T, listId: 'live' }, lists, boards)).toBe(false);
    expect(isCardLive({ deletedAt: null, listId: 'gone' }, lists, boards)).toBe(false);
    expect(isCardLive({ deletedAt: null, listId: 'orphan' }, lists, boards)).toBe(false);
    expect(isCardLive({ deletedAt: null, listId: 'unknown' }, lists, boards)).toBe(false);
  });
});

describe('today reason', () => {
  const reason = (start: DateValue | null, due: DateValue | null, completed = false) =>
    todayReason({ start, due, completed }, NOW);

  it('covers overdue, due today and in progress', () => {
    expect(reason(null, d('2026-11-04'))).toBe('overdue');
    expect(reason(null, d('2026-11-05'))).toBe('dueToday');
    expect(reason(null, d('2026-11-05', '08:00'))).toBe('overdue');
    expect(reason(d('2026-11-05'), d('2026-11-09'))).toBe('inProgress');
    expect(reason(d('2026-11-01'), d('2026-11-09'))).toBe('inProgress');
  });

  it('leaves out future cards, completed cards and start-only cards', () => {
    expect(reason(null, d('2026-11-06'))).toBeNull();
    expect(reason(d('2026-11-06'), d('2026-11-09'))).toBeNull();
    expect(reason(null, d('2026-11-04'), true)).toBeNull();
    expect(reason(d('2026-11-01'), null)).toBeNull();
  });
});

describe('selectToday', () => {
  const boards = [board('second', 'a2'), board('first', 'a1'), board('trashed', 'a0', T)];
  const lists = [
    list('l1', 'first'),
    list('l2', 'second'),
    list('l3', 'trashed'),
    list('l4', 'first', T),
  ];

  it('groups by board, in board order, without empty groups', () => {
    const groups = selectToday(
      boards,
      lists,
      [
        card('1', { listId: 'l2', due: d('2026-11-05') }),
        card('2', { listId: 'l1', due: d('2026-11-05') }),
        card('3', { listId: 'l3', due: d('2026-11-05') }),
        card('4', { listId: 'l4', due: d('2026-11-05') }),
        card('5', { listId: 'l1', due: d('2026-12-05') }),
      ],
      NOW,
    );
    expect(groups.map((g) => [g.board.id, g.cards.map((c) => c.id)])).toEqual([
      ['first', ['2']],
      ['second', ['1']],
    ]);
  });

  it('sorts overdue first, then timed before date-only, then by priority', () => {
    const groups = selectToday(
      boards,
      lists,
      [
        card('dateOnlyLow', { due: d('2026-11-05'), priority: 'low' }),
        card('dateOnlyUrgent', { due: d('2026-11-05'), priority: 'urgent' }),
        card('dateOnlyNone', { due: d('2026-11-05') }),
        card('late', { due: d('2026-11-05', '20:00') }),
        card('soon', { due: d('2026-11-05', '13:00') }),
        card('overdue', { due: d('2026-11-03') }),
        card('progress', { start: d('2026-11-01'), due: d('2026-11-09') }),
      ],
      NOW,
    );
    expect(groups[0]?.cards.map((c) => c.id)).toEqual([
      'overdue',
      'soon',
      'late',
      'dateOnlyUrgent',
      'dateOnlyLow',
      'dateOnlyNone',
      'progress',
    ]);
  });
});

describe('badge', () => {
  it('counts overdue and due today but not in progress', () => {
    const boards = [board('first', 'a1')];
    const lists = [list('l1', 'first')];
    const count = todayBadgeCount(
      boards,
      lists,
      [
        card('1', { due: d('2026-11-04') }),
        card('2', { due: d('2026-11-05') }),
        card('3', { start: d('2026-11-01'), due: d('2026-11-09') }),
        card('4', { due: d('2026-11-04'), completed: true }),
        card('5', { due: d('2026-11-04'), deletedAt: T }),
      ],
      NOW,
    );
    expect(count).toBe(2);
  });
});

describe('trash days left', () => {
  it('counts down from 30 and stops at 0', () => {
    expect(trashDaysLeft(new Date(NOW).toISOString(), NOW)).toBe(30);
    expect(trashDaysLeft(new Date(NOW).toISOString(), NOW + 86_400_000 * 29)).toBe(1);
    expect(trashDaysLeft(new Date(NOW).toISOString(), NOW + 86_400_000 * 40)).toBe(0);
  });
});

describe('selectTrash', () => {
  const T = '2026-11-01T10:00:00.000Z';
  const NOW = new Date('2026-11-05T12:00:00.000Z').getTime();
  const board = (id: string, deletedAt: string | null = null) =>
    ({ id, name: `B-${id}`, deletedAt, position: 'a0' }) as Board;
  const list = (id: string, boardId: string, deletedAt: string | null = null) =>
    ({ id, boardId, name: `L-${id}`, deletedAt, position: 'a0' }) as List;
  const card = (id: string, listId: string, deletedAt: string | null, boardId = 'b1') =>
    ({ id, listId, boardId, title: `C-${id}`, deletedAt, position: 'a0' }) as Card;

  it('lists only what was deleted directly, newest first, with its origin', () => {
    const rows = selectTrash(
      [board('b1')],
      [list('l1', 'b1'), list('l2', 'b1', '2026-11-03T00:00:00.000Z')],
      [
        card('c1', 'l1', T),
        card('live', 'l1', null),
        card('inGone', 'l2', null), // Goes with its list, so no row of its own.
      ],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(['l2', 'c1']);
    expect(rows[0]).toMatchObject({ kind: 'list', where: 'B-b1', cardCount: 1, needsBoard: false });
    expect(rows[1]).toMatchObject({ kind: 'card', where: 'B-b1 / L-l1', daysLeft: 26 });
  });

  it('says a child needs its board back first', () => {
    const rows = selectTrash([board('b1', T)], [list('l1', 'b1', T)], [card('c1', 'l1', T)], NOW);
    expect(rows.find((r) => r.kind === 'board')?.needsBoard).toBe(false);
    expect(rows.find((r) => r.kind === 'list')?.needsBoard).toBe(true);
    expect(rows.find((r) => r.kind === 'card')?.needsBoard).toBe(true);
  });

  it('counts a board by its live cards, and drops rows whose board was purged', () => {
    const rows = selectTrash(
      [board('b1', T)],
      [list('l1', 'b1')],
      [card('c1', 'l1', null), card('c2', 'l1', null), card('orphan', 'x', T, 'purged')],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'board', cardCount: 2 });
  });

  it('names just the board when the card outlived its list', () => {
    const [row] = selectTrash([board('b1')], [], [card('c1', 'purgedList', T)], NOW);
    expect(row?.where).toBe('B-b1');
  });
});

describe('cardRestorePlan', () => {
  const list = (id: string, position: string, deletedAt: string | null = null) =>
    ({ id, position, deletedAt }) as List;

  it('stays in its own list while that is live', () => {
    expect(cardRestorePlan({ listId: 'a' }, [list('a', 'a0')])).toEqual({ kind: 'inPlace' });
  });

  it('goes to the first live list when its list is purged or in Trash', () => {
    const lists = [list('t', 'a0', 'x'), list('second', 'a2'), list('first', 'a1')];
    expect(cardRestorePlan({ listId: 'gone' }, lists)).toEqual({ kind: 'moveTo', listId: 'first' });
    expect(cardRestorePlan({ listId: 't' }, lists)).toEqual({ kind: 'moveTo', listId: 'first' });
  });

  it('asks for a new list when the board has none', () => {
    expect(cardRestorePlan({ listId: 'x' }, [])).toEqual({ kind: 'newList' });
  });
});
