import 'fake-indexeddb/auto';
import fc from 'fast-check';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { HlcClock, type Card, type Change, type Priority } from '@tack/shared';
import { openDb, type Db } from '../server/src/db/index.js';
import { applyChanges, pullChanges } from '../server/src/sync.js';
import { TackDb } from '../web/src/data/db.js';
import { SyncEngine } from '../web/src/data/engine.js';
import { Store } from '../web/src/data/store.js';
import { SessionExpiredError, type Transport } from '../web/src/data/transport.js';

const T = '2026-01-01T00:00:00.000Z';
const BOARD = {
  name: 'B',
  emoji: null,
  color: 'neutral',
  showCompleted: false,
  position: 'a0',
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
} as const;
const LIST = {
  boardId: 'b',
  name: 'L',
  position: 'a0',
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
};
const card = (position: string) =>
  ({
    boardId: 'b',
    listId: 'l',
    position,
    title: 'start',
    description: '',
    start: null,
    due: null,
    priority: 'none' as Priority,
    completed: false,
    completedAt: null,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  }) satisfies Omit<Card, 'id' | 'clocks'>;

let dbCount = 0;
const openDbs: TackDb[] = [];
const servers: Db[] = [];

/** A device with its own database, clock and faulty network. */
class Device {
  readonly db = new TackDb(`test-${(dbCount += 1)}`);
  readonly clock: HlcClock;
  readonly store: Store;
  readonly engine: SyncEngine;
  online = true;
  loseNextResponse = false;
  expired = false;
  /** Runs after the server answered a pull but before the device applies the answer. */
  duringPull: (() => Promise<void>) | null = null;

  /** Points this device at another database, as a restored server would look to it. */
  useServer(next: Db) {
    this.server = next;
  }

  private server: Db;

  constructor(server: Db, name: string, wall: () => number) {
    this.server = server;
    openDbs.push(this.db);
    this.clock = new HlcClock(name, wall);
    this.store = new Store(this.db, this.clock);
    const transport: Transport = {
      push: async (changes: Change[]) => {
        if (this.expired) throw new SessionExpiredError();
        if (!this.online) throw new Error('offline');
        const { changed: _changed, ...response } = applyChanges(this.server, changes, wall());
        if (this.loseNextResponse) {
          this.loseNextResponse = false;
          throw new Error('response lost');
        }
        return response;
      },
      pull: async (since) => {
        if (this.expired) throw new SessionExpiredError();
        if (!this.online) throw new Error('offline');
        const response = pullChanges(this.server, since, wall());
        const during = this.duringPull;
        this.duringPull = null;
        await during?.();
        return response;
      },
    };
    this.engine = new SyncEngine(this.db, this.clock, transport);
  }

  async state() {
    const dump = async (table: 'boards' | 'lists' | 'cards') =>
      (await this.db.table(table).toArray()).sort((a, b) => (a.id < b.id ? -1 : 1));
    return { boards: await dump('boards'), lists: await dump('lists'), cards: await dump('cards') };
  }
}

function setup(devices: number) {
  const server = openDb(':memory:');
  servers.push(server);
  let time = 1_000_000;
  const tick = () => (time += 7);
  return {
    server,
    tick,
    devices: Array.from(
      { length: devices },
      (_, i) => new Device(server, `d${i}`, () => time + i * 3),
    ),
  };
}

function serverState(server: Db) {
  const { rows } = pullChanges(server, -1, 0);
  const sort = (list: { id: string }[] = []) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
  return { boards: sort(rows.boards), lists: sort(rows.lists), cards: sort(rows.cards) };
}

afterEach(async () => {
  for (const db of openDbs.splice(0)) await db.delete();
  for (const server of servers.splice(0)) server.close();
});

describe('sync scenarios', () => {
  it('delivers an edit to another device', async () => {
    const { devices } = setup(2);
    const [a, b] = devices as [Device, Device];
    await a.store.insert('boards', 'b', BOARD);
    await a.engine.sync();
    await b.engine.sync();
    expect((await b.db.boards.get('b'))?.name).toBe('B');
  });

  it('merges offline edits to different fields of one card', async () => {
    const { devices, tick } = setup(2);
    const [a, b] = devices as [Device, Device];
    await a.store.insert('cards', 'c', card('a0'));
    await a.engine.sync();
    await b.engine.sync();
    a.online = b.online = false;
    await a.store.update('cards', 'c', { title: 'from a' });
    tick();
    await b.store.update('cards', 'c', { priority: 'high' });
    a.online = b.online = true;
    for (const device of [a, b, a]) await device.engine.sync();
    for (const device of [a, b]) {
      expect(await device.db.cards.get('c')).toMatchObject({ title: 'from a', priority: 'high' });
    }
  });

  it('lets the later edit win on the same field, whichever syncs last', async () => {
    const { devices, tick } = setup(2);
    const [a, b] = devices as [Device, Device];
    await a.store.insert('cards', 'c', card('a0'));
    await a.engine.sync();
    await b.engine.sync();
    await a.store.update('cards', 'c', { title: 'earlier' });
    tick();
    await b.store.update('cards', 'c', { title: 'later' });
    await b.engine.sync(); // The later edit reaches the server first.
    await a.engine.sync();
    await b.engine.sync();
    for (const device of [a, b]) expect((await device.db.cards.get('c'))?.title).toBe('later');
  });

  it('keeps an edit made during a sync queued for the next one', async () => {
    const { devices, tick, server } = setup(1);
    const a = devices[0] as Device;
    await a.store.insert('cards', 'c', card('a0'));
    const sync = a.engine.sync();
    tick();
    await a.store.update('cards', 'c', { title: 'typed while syncing' });
    await sync;
    expect((await a.db.cards.get('c'))?.title).toBe('typed while syncing');
    await a.engine.sync();
    expect(await a.db.outbox.count()).toBe(0);
    expect(pullChanges(server, 0, 0).rows.cards?.[0]?.title).toBe('typed while syncing');
  });

  it('does not let a pull overwrite an edit made while it was running', async () => {
    const { devices, tick, server } = setup(2);
    const [a, b] = devices as [Device, Device];
    await a.store.insert('cards', 'c', card('a0'));
    await a.engine.sync();
    await b.engine.sync();
    await b.store.update('cards', 'c', { title: 'from b', priority: 'low' });
    await b.engine.sync();
    tick();
    a.duringPull = async () => {
      await a.store.update('cards', 'c', { title: 'typed during pull' });
    };
    await a.engine.sync();
    // The field being typed survives, and the other device's edit to another field still arrives.
    expect(await a.db.cards.get('c')).toMatchObject({
      title: 'typed during pull',
      priority: 'low',
    });
    expect(await a.db.outbox.count()).toBe(1);
    await a.engine.sync();
    await b.engine.sync();
    expect(pullChanges(server, 0, 0).rows.cards?.[0]?.title).toBe('typed during pull');
    expect((await b.db.cards.get('c'))?.title).toBe('typed during pull');
  });

  it('recovers when the server applied a push but the response got lost', async () => {
    const { devices } = setup(1);
    const a = devices[0] as Device;
    await a.store.insert('cards', 'c', card('a0'));
    a.loseNextResponse = true;
    await a.engine.sync();
    expect(await a.db.outbox.count()).toBe(1);
    expect((await a.db.meta.get('status'))?.value).toBe('offline');
    await a.engine.sync();
    expect(await a.db.outbox.count()).toBe(0);
    expect((await a.db.meta.get('status'))?.value).toBe('online');
  });

  it('starts over from a restored backup, keeping edits still queued', async () => {
    const { devices, server, tick } = setup(2);
    const [a, b] = devices as [Device, Device];
    await a.store.insert('boards', 'b', BOARD);
    await a.store.insert('lists', 'l', LIST);
    await a.store.insert('cards', 'old', card('a0'));
    await a.engine.sync();
    const backup = server.serialize();
    tick();
    await a.store.insert('cards', 'lost', card('a1'));
    await a.engine.sync();
    await b.engine.sync();
    expect(await b.db.cards.count()).toBe(2);

    // What restore.sh does: back to the snapshot, with a new epoch. Then more changes land on the
    // server, so its seq alone couldn't show that anything happened.
    const restored = openDb(':memory:');
    servers.push(restored);
    restored.exec(
      'DELETE FROM cards; DELETE FROM lists; DELETE FROM boards; DELETE FROM tombstones;',
    );
    const snapshot = new Database(backup);
    for (const table of ['boards', 'lists', 'cards', 'meta'] as const) {
      const rows = snapshot.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      for (const row of rows) {
        const columns = Object.keys(row);
        restored
          .prepare(
            `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          )
          .run(...columns.map((c) => row[c] as never));
      }
    }
    snapshot.close();
    restored.exec(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('epoch', 42); UPDATE meta SET value = value + 50 WHERE key = 'seq';",
    );

    // A device on the restored server, with an edit made offline that's still queued.
    tick();
    b.online = false;
    await b.store.update('cards', 'old', { title: 'edited offline' });
    b.online = true;
    b.useServer(restored);
    await b.engine.sync();
    await b.engine.sync();

    const cards = await b.db.cards.toArray();
    expect(cards.map((c) => c.id)).toEqual(['old']);
    expect(cards[0]?.title).toBe('edited offline');
    expect(pullChanges(restored, -1, 0).rows.cards?.[0]?.title).toBe('edited offline');
  });

  it('holds the queue through an expired session', async () => {
    const { devices } = setup(1);
    const a = devices[0] as Device;
    a.expired = true;
    await a.store.insert('boards', 'b', BOARD);
    await a.engine.sync();
    expect((await a.db.meta.get('status'))?.value).toBe('expired');
    expect(await a.db.outbox.count()).toBe(1);
    a.expired = false;
    await a.engine.sync();
    expect(await a.db.outbox.count()).toBe(0);
  });

  it('drops a change the server refuses and restores the real row', async () => {
    const { devices } = setup(1);
    const a = devices[0] as Device;
    await a.store.insert('cards', 'c', card('a0'));
    await a.engine.sync();
    await a.store.update('cards', 'c', { priority: 'huge' as Priority });
    await a.engine.sync();
    expect(await a.db.outbox.count()).toBe(0);
    expect((await a.db.cards.get('c'))?.priority).toBe('none');
  });

  it('removes a purged row everywhere, including edits queued for it', async () => {
    const { devices } = setup(2);
    const [a, b] = devices as [Device, Device];
    await a.store.insert('cards', 'c', card('a0'));
    await a.engine.sync();
    await b.engine.sync();
    await b.store.update('cards', 'c', { title: 'too late' });
    await a.store.purge('cards', 'c');
    await a.engine.sync();
    await b.engine.sync();
    expect(await b.db.cards.get('c')).toBeUndefined();
    expect(await b.db.outbox.count()).toBe(0);
  });
});

type Action =
  | {
      type: 'edit';
      device: number;
      card: number;
      field: 'title' | 'priority' | 'position';
      pick: number;
    }
  | { type: 'trash'; device: number; card: number; on: boolean }
  | { type: 'purge'; device: number; card: number }
  | { type: 'sync'; device: number }
  | { type: 'loseResponse'; device: number }
  | { type: 'offline'; device: number; on: boolean };

const DEVICES = 3;
const CARDS = 3;
const device = fc.integer({ min: 0, max: DEVICES - 1 });
const cardIndex = fc.integer({ min: 0, max: CARDS - 1 });
const action: fc.Arbitrary<Action> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      type: fc.constant('edit' as const),
      device,
      card: cardIndex,
      field: fc.constantFrom('title' as const, 'priority' as const, 'position' as const),
      pick: fc.integer({ min: 0, max: 3 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      type: fc.constant('trash' as const),
      device,
      card: cardIndex,
      on: fc.boolean(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ type: fc.constant('purge' as const), device, card: cardIndex }),
  },
  { weight: 4, arbitrary: fc.record({ type: fc.constant('sync' as const), device }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('loseResponse' as const), device }) },
  {
    weight: 1,
    arbitrary: fc.record({ type: fc.constant('offline' as const), device, on: fc.boolean() }),
  },
);

const VALUES = {
  title: ['one', 'two', 'three', 'four'],
  priority: ['low', 'medium', 'high', 'urgent'],
  position: ['a1', 'a2', 'a3', 'a4'],
} as const;

describe('sync under random conditions', () => {
  it('always converges, with the latest edit winning per field', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(action, { maxLength: 40 }), async (actions) => {
        const { devices, tick, server } = setup(DEVICES);
        const first = devices[0] as Device;
        await first.store.insert('boards', 'b', BOARD);
        await first.store.insert('lists', 'l', LIST);
        for (let i = 0; i < CARDS; i += 1)
          await first.store.insert('cards', `c${i}`, card(`a${i}`));
        for (const d of devices) await d.engine.sync();

        // The edit with the highest clock, per card and field, is what must survive.
        const latest = new Map<string, { clock: string; value: unknown }>();
        const purged = new Set<string>();

        for (const step of actions) {
          tick();
          const d = devices[step.device] as Device;
          const id = 'card' in step ? `c${step.card}` : '';
          // A device can't edit a row it has already removed; the UI has nothing to click.
          const present = id ? !!(await d.db.cards.get(id)) : false;
          switch (step.type) {
            case 'edit': {
              if (!present) break;
              const value = VALUES[step.field][step.pick];
              const clocks = await d.store.update('cards', id, { [step.field]: value });
              const clock = clocks[step.field] as string;
              const key = `${id}.${step.field}`;
              if (clock > (latest.get(key)?.clock ?? '')) latest.set(key, { clock, value });
              break;
            }
            case 'trash':
              if (present) await d.store.update('cards', id, { deletedAt: step.on ? T : null });
              break;
            case 'purge':
              if (present) {
                await d.store.purge('cards', id);
                purged.add(id);
              }
              break;
            case 'sync':
              await d.engine.sync();
              break;
            case 'loseResponse':
              d.loseNextResponse = true;
              break;
            case 'offline':
              d.online = !step.on;
              break;
          }
        }

        for (const d of devices) {
          d.online = true;
          d.loseNextResponse = false;
        }
        for (const d of devices) await d.engine.sync();
        for (const d of devices) await d.engine.sync();

        const expected = serverState(server);
        for (const d of devices) {
          expect(await d.db.outbox.count()).toBe(0);
          expect(await d.state()).toEqual(expected);
        }
        for (const [key, { value }] of latest) {
          const [id, field] = key.split('.') as [string, string];
          if (purged.has(id)) continue;
          const row = expected.cards.find((c) => c.id === id) as
            Record<string, unknown> | undefined;
          expect(row?.[field]).toBe(value);
        }
        expect(expected.cards.filter((c) => purged.has(c.id))).toEqual([]);
      }),
      { numRuns: 150 },
    );
  }, 60_000);
});
