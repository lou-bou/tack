import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PROTOCOL_VERSION, type Change, type PullResponse, type PushResponse } from '@tack/shared';
import { buildApp } from '../src/app.js';
import { applyChanges, pullChanges, purgeExpired } from '../src/sync.js';

const T = '2026-01-01T00:00:00.000Z';
const CLOCK = '0000000001000:0000:a';

function stamp(fields: Record<string, unknown>, clock = CLOCK) {
  return Object.fromEntries(Object.keys(fields).map((f) => [f, clock]));
}

function insert(table: Change['table'], id: string, fields: Record<string, unknown>): Change {
  return { table, id, fields, clocks: stamp(fields) };
}

const common = { position: 'a0', createdAt: T, updatedAt: T, deletedAt: null };
const boardFields = { ...common, name: 'B', emoji: null, color: 'blue', showCompleted: true };
const listFields = { ...common, boardId: 'b1', name: 'L' };
const cardFields = {
  ...common,
  boardId: 'b1',
  listId: 'l1',
  title: 'C',
  description: 'text',
  start: { date: '2026-11-01', time: null },
  due: { date: '2026-11-05', time: '18:00' },
  priority: 'high',
  completed: false,
  completedAt: null,
};

describe('sync routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      dbPath: ':memory:',
      webDist: '/nonexistent',
      vapid: null,
    });
  });

  afterEach(() => app.close());

  async function push(changes: Change[]): Promise<PushResponse> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sync/push',
      payload: { protocol: PROTOCOL_VERSION, changes },
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  async function pull(since = 0): Promise<PullResponse> {
    const res = await app.inject({
      method: 'GET',
      url: `/api/sync/pull?since=${since}&protocol=${PROTOCOL_VERSION}`,
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  async function seed() {
    return push([
      insert('boards', 'b1', boardFields),
      insert('lists', 'l1', listFields),
      insert('cards', 'c1', cardFields),
    ]);
  }

  it('returns inserted rows with booleans and dates intact', async () => {
    await seed();
    const { rows } = await pull();
    expect(rows.boards?.[0]).toMatchObject({ id: 'b1', showCompleted: true });
    expect(rows.cards?.[0]).toMatchObject({
      id: 'c1',
      completed: false,
      due: { date: '2026-11-05', time: '18:00' },
      clocks: { title: CLOCK },
    });
  });

  it('gives a new device the default settings on its first pull', async () => {
    const { rows } = await pull();
    expect(rows.settings?.[0]).toMatchObject({
      id: 'settings',
      theme: 'system',
      density: 'compact',
    });
  });

  it('lets a device change the seeded settings', async () => {
    await push([
      { table: 'settings', id: 'settings', fields: { theme: 'dark' }, clocks: { theme: CLOCK } },
    ]);
    expect((await pull()).rows.settings?.[0]?.theme).toBe('dark');
  });

  it('only returns what changed since the given seq', async () => {
    const { seq } = await seed();
    expect((await pull(seq)).rows).toEqual({});
    await push([
      {
        table: 'cards',
        id: 'c1',
        fields: { title: 'New' },
        clocks: { title: '0000000002000:0000:a' },
      },
    ]);
    const later = await pull(seq);
    expect(Object.keys(later.rows)).toEqual(['cards']);
    expect(later.rows.cards?.[0]?.title).toBe('New');
  });

  it('keeps the later write per field', async () => {
    await seed();
    await push([
      {
        table: 'cards',
        id: 'c1',
        fields: { title: 'Newer' },
        clocks: { title: '0000000003000:0000:a' },
      },
      {
        table: 'cards',
        id: 'c1',
        fields: { title: 'Older', priority: 'low' },
        clocks: { title: '0000000002000:0000:b', priority: '0000000002000:0000:b' },
      },
    ]);
    const card = (await pull()).rows.cards?.[0];
    expect(card).toMatchObject({ title: 'Newer', priority: 'low' });
  });

  it('does not bump seq or notify for a repeated batch', async () => {
    const publish = vi.spyOn(app.hub, 'publish');
    const first = await seed();
    const second = await seed();
    expect(second.seq).toBe(first.seq);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid value and returns the row as it stands', async () => {
    await seed();
    const { rejected } = await push([
      {
        table: 'cards',
        id: 'c1',
        fields: { priority: 'huge' },
        clocks: { priority: '0000000002000:0000:a' },
      },
    ]);
    expect(rejected[0]).toMatchObject({ table: 'cards', id: 'c1', row: { priority: 'high' } });
  });

  it('rejects an incomplete new row', async () => {
    const { rejected } = await push([
      { table: 'cards', id: 'new', fields: { title: 'x' }, clocks: { title: CLOCK } },
    ]);
    expect(rejected).toEqual([{ table: 'cards', id: 'new', row: null }]);
    expect((await pull()).rows.cards).toBeUndefined();
  });

  it('ignores fields that are not in the schema', async () => {
    await seed();
    await push([
      {
        table: 'cards',
        id: 'c1',
        fields: { title: 'T', evil: 'x' },
        clocks: { title: '0000000002000:0000:a', evil: '0000000002000:0000:a' },
      },
    ]);
    const card = (await pull()).rows.cards?.[0];
    expect(card?.title).toBe('T');
    expect(card).not.toHaveProperty('evil');
  });

  it('only lets devices set readAt on a notification', async () => {
    app.db
      .prepare(
        `INSERT INTO notifications (id, cardId, dueKey, title, body, createdAt, readAt, clocks, seq)
         VALUES ('n1', 'c1', '2026-11-05', 'Title', 'Due tomorrow', ?, NULL, '{}', 1)`,
      )
      .run(T);
    await push([
      {
        table: 'notifications',
        id: 'n1',
        fields: { readAt: T, body: 'Hacked' },
        clocks: { readAt: CLOCK, body: CLOCK },
      },
    ]);
    expect((await pull()).rows.notifications?.[0]).toMatchObject({
      readAt: T,
      body: 'Due tomorrow',
    });
    const { rejected } = await push([
      { table: 'notifications', id: 'n2', fields: { readAt: T }, clocks: { readAt: CLOCK } },
    ]);
    expect(rejected[0]?.id).toBe('n2');
  });

  it('clamps a clock from far in the future', async () => {
    await seed();
    await push([
      {
        table: 'cards',
        id: 'c1',
        fields: { title: 'Future' },
        clocks: { title: '9999999999999:0000:a' },
      },
    ]);
    const clock = (await pull()).rows.cards?.[0]?.clocks.title as string;
    expect(Number(clock.slice(0, 13))).toBeLessThanOrEqual(Date.now() + 5 * 60_000);
  });

  describe('purge', () => {
    const purge = (table: Change['table'], id: string): Change => ({
      table,
      id,
      fields: {},
      clocks: {},
      purge: true,
    });

    it('removes a card and tells other devices', async () => {
      const { seq } = await seed();
      await push([purge('cards', 'c1')]);
      const later = await pull(seq);
      expect(later.tombstones).toEqual([{ table: 'cards', id: 'c1' }]);
      expect((await pull()).rows.cards).toBeUndefined();
    });

    it('rejects late edits to a purged row', async () => {
      await seed();
      await push([purge('cards', 'c1')]);
      const { rejected } = await push([
        {
          table: 'cards',
          id: 'c1',
          fields: { title: 'Late' },
          clocks: { title: '0000000009000:0000:a' },
        },
      ]);
      expect(rejected).toEqual([{ table: 'cards', id: 'c1', row: null }]);
    });

    it('does not bring back a purged row when a full copy arrives late', async () => {
      await seed();
      await push([purge('cards', 'c1')]);
      const { rejected } = await push([
        { ...insert('cards', 'c1', cardFields), clocks: stamp(cardFields, '0000000009000:0000:b') },
      ]);
      expect(rejected).toEqual([{ table: 'cards', id: 'c1', row: null }]);
      expect((await pull()).rows.cards).toBeUndefined();
    });

    it('takes a list and its live cards, but not a card trashed on its own', async () => {
      await seed();
      await push([
        insert('cards', 'trashed', { ...cardFields, deletedAt: T }),
        purge('lists', 'l1'),
      ]);
      const { rows, tombstones } = await pull();
      expect(rows.cards?.map((c) => c.id)).toEqual(['trashed']);
      expect(rows.lists).toBeUndefined();
      expect(tombstones).toContainEqual({ table: 'cards', id: 'c1' });
    });

    it('takes a board and everything in it', async () => {
      await seed();
      await push([
        insert('cards', 'trashed', { ...cardFields, deletedAt: T }),
        purge('boards', 'b1'),
      ]);
      const { rows, tombstones } = await pull();
      expect(rows.boards ?? rows.lists ?? rows.cards).toBeUndefined();
      expect(tombstones).toHaveLength(4);
    });

    it('cannot purge settings', async () => {
      const { rejected } = await push([purge('settings', 'settings')]);
      expect(rejected[0]?.id).toBe('settings');
    });
  });

  it('turns away a client on another protocol version', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sync/push',
      payload: { protocol: PROTOCOL_VERSION + 1, changes: [] },
    });
    expect(res.statusCode).toBe(426);
    const pullRes = await app.inject({
      method: 'GET',
      url: `/api/sync/pull?since=0&protocol=${PROTOCOL_VERSION + 1}`,
    });
    expect(pullRes.statusCode).toBe(426);
  });
});

describe('purgeExpired', () => {
  const DAY = 86_400_000;
  const NOW = new Date('2026-11-05T12:00:00.000Z').getTime();
  const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      dbPath: ':memory:',
      webDist: '/nonexistent',
      vapid: null,
    });
  });
  afterEach(async () => {
    await app.close();
  });

  const seed = (changes: Change[]) => applyChanges(app.db, changes, NOW);
  const exists = (table: string, id: string) =>
    !!app.db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);
  const board = insert('boards', 'b1', boardFields);
  const list = insert('lists', 'l1', listFields);

  it('removes items after 30 days and leaves younger ones', () => {
    seed([
      board,
      list,
      insert('cards', 'old', { ...cardFields, deletedAt: ago(30) }),
      insert('cards', 'young', { ...cardFields, deletedAt: ago(29) }),
      insert('cards', 'live', cardFields),
    ]);
    expect(purgeExpired(app.db, NOW)).toBe(true);
    expect(exists('cards', 'old')).toBe(false);
    expect(exists('cards', 'young')).toBe(true);
    expect(exists('cards', 'live')).toBe(true);
    expect(purgeExpired(app.db, NOW)).toBe(false);
  });

  it('tells other devices through tombstones', () => {
    seed([board, list, insert('cards', 'old', { ...cardFields, deletedAt: ago(31) })]);
    const before = pullChanges(app.db, 0, NOW).seq;
    purgeExpired(app.db, NOW);
    const { tombstones, seq } = pullChanges(app.db, before, NOW);
    expect(seq).toBeGreaterThan(before);
    expect(tombstones).toEqual([{ table: 'cards', id: 'old' }]);
  });

  it('a purged list takes its live cards but not one trashed on its own', () => {
    seed([
      board,
      insert('lists', 'l1', { ...listFields, deletedAt: ago(31) }),
      insert('cards', 'with', cardFields),
      insert('cards', 'alone', { ...cardFields, deletedAt: ago(5) }),
    ]);
    purgeExpired(app.db, NOW);
    expect(exists('lists', 'l1')).toBe(false);
    expect(exists('cards', 'with')).toBe(false);
    expect(exists('cards', 'alone')).toBe(true);
  });

  it('a purged board takes everything in it', () => {
    seed([
      insert('boards', 'b1', { ...boardFields, deletedAt: ago(30) }),
      list,
      insert('cards', 'c', cardFields),
      insert('cards', 'trashed', { ...cardFields, deletedAt: ago(1) }),
    ]);
    purgeExpired(app.db, NOW);
    for (const [t, id] of [
      ['boards', 'b1'],
      ['lists', 'l1'],
      ['cards', 'c'],
      ['cards', 'trashed'],
    ] as const) {
      expect(exists(t, id)).toBe(false);
    }
  });
});
