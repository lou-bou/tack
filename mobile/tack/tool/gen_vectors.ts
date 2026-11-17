// Generates test/vectors.json from the real JS code (shared/ and server/src/sync.ts), so the
// Dart port can be checked against it value for value. Run from the repository root after
// changing shared/ or the server's sync rules:
//
//   npx tsx mobile/tack/tool/gen_vectors.ts
//
// The Dart side is test/vectors_test.dart (rules) and test/fake_server_test.dart (the fake
// server used by the convergence tests must answer exactly like the real one).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyBetween } from 'fractional-indexing';
import {
  HlcClock,
  addDays,
  byPosition,
  cardRestorePlan,
  clampHlc,
  dayOfWeek,
  daysBetween,
  dropPosition,
  dueKey,
  dueMoment,
  dueState,
  entriesOnDay,
  formatChip,
  formatDate,
  formatHlc,
  formatMonth,
  formatTimestamp,
  mergeChange,
  monthStart,
  monthWeeks,
  moveDue,
  notificationBody,
  notifyAt,
  parseTime,
  positionAt,
  positionBetween,
  presetDate,
  selectCalendar,
  selectToday,
  selectTrash,
  startAfterDue,
  todayBadgeCount,
  todayReason,
  todayString,
  trashDaysLeft,
  zonedMs,
  type Board,
  type Card,
  type Change,
  type DateValue,
  type List,
  type Row,
  type TableName,
} from '../../../shared/src/index.ts';
import { openDb } from '../../../server/src/db/index.ts';
import { applyChanges, bumpSeq, pullChanges, writeRow } from '../../../server/src/sync.ts';

// A small seeded generator, so the file is the same on every run.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261117);
const int = (n: number) => Math.floor(rnd() * n);
const pick = <T>(items: readonly T[]): T => items[int(items.length)]!;
const chance = (p: number) => rnd() < p;

/** A `random` for position functions that records what it handed out, to replay in Dart. */
function recorded(): { fn: () => number; used: number[] } {
  const used: number[] = [];
  return {
    used,
    fn: () => {
      const value = rnd();
      used.push(value);
      return value;
    },
  };
}

const BASE = Date.UTC(2026, 10, 17, 8, 0, 0); // 17/11/2026 09:00 in Algiers
const iso = (ms: number) => new Date(ms).toISOString();
const NODES = ['aaaa1111', 'bbbb2222', 'cccc3333'];
const randomHlc = (around = BASE) =>
  formatHlc(around + int(600_000) - 300_000, int(4), pick(NODES));

// ---------- clocks ----------

function hlcVectors() {
  const format = [
    [0, 0, ''],
    [1, 2, 'n'],
    [BASE, 12, 'aaaa1111'],
    [9_999_999_999_999, 9999, 'zz'],
    [BASE, 12345, 'big'],
  ].map(([ms, counter, node]) => ({
    ms,
    counter,
    node,
    out: formatHlc(ms as number, counter as number, node as string),
  }));

  const runs = [];
  for (let r = 0; r < 40; r += 1) {
    let wall = BASE + int(10_000);
    const node = pick(NODES);
    const clock = new HlcClock(node, () => wall);
    const steps: unknown[] = [];
    for (let s = 0; s < 30; s += 1) {
      const roll = rnd();
      if (roll < 0.55) {
        // The device clock moves forward, stands still or jumps back.
        wall += pick([0, 0, 1, 5, 1000, -3000, 60_000]);
        steps.push({ op: 'now', wall, out: clock.now() });
      } else if (roll < 0.85) {
        const seen = formatHlc(wall + int(20_000) - 10_000, int(6), pick(NODES));
        clock.observe(seen);
        steps.push({ op: 'observe', hlc: seen });
      } else {
        const server = wall + int(600_000) - 300_000;
        clock.syncWall(server);
        steps.push({ op: 'syncWall', wall, server });
      }
    }
    runs.push({ node, steps });
  }

  const clamp = [];
  for (let i = 0; i < 60; i += 1) {
    const serverNow = BASE + int(1000);
    const hlc = formatHlc(
      serverNow + pick([-1000, 0, 299_999, 300_000, 300_001, 9_000_000]),
      int(20),
      pick(NODES),
    );
    clamp.push({ hlc, serverNow, out: clampHlc(hlc, serverNow) });
  }
  return { format, runs, clamp };
}

// ---------- merge ----------

function mergeVectors() {
  const fields = ['title', 'priority', 'completed', 'due', 'listId'];
  const value = (field: string): unknown => {
    switch (field) {
      case 'title':
        return pick(['a', 'b', 'Écrire', '']);
      case 'priority':
        return pick(['none', 'low', 'urgent']);
      case 'completed':
        return chance(0.5);
      case 'due':
        return chance(0.3) ? null : { date: '2026-11-1' + int(9), time: chance(0.5) ? '18:30' : null };
      default:
        return pick(['l1', 'l2']);
    }
  };
  const out = [];
  for (let i = 0; i < 300; i += 1) {
    let existing: Row | null = null;
    if (chance(0.8)) {
      existing = { id: 'c1', clocks: {} };
      for (const field of fields) {
        if (chance(0.7)) {
          existing[field] = value(field);
          existing.clocks[field] = randomHlc();
        }
      }
    }
    const change: Change = { table: 'cards', id: 'c1', fields: {}, clocks: {} };
    for (const field of fields) {
      if (!chance(0.6)) continue;
      change.fields[field] = value(field);
      // Sometimes a field arrives without its clock (ignored), sometimes with an equal clock.
      if (chance(0.9)) {
        change.clocks[field] =
          existing?.clocks[field] && chance(0.15) ? existing.clocks[field]! : randomHlc();
      }
    }
    if (chance(0.1)) change.clocks.stray = randomHlc();
    const result = mergeChange(existing, change);
    out.push({ existing, change, row: result.row, changed: result.changed });
  }
  return out;
}

// ---------- positions ----------

function positionVectors() {
  const keys: unknown[] = [];
  const pool: string[] = [generateKeyBetween(null, null)];
  for (let i = 0; i < 600; i += 1) {
    const sorted = [...pool].sort();
    const at = int(sorted.length + 1);
    const a = sorted[at - 1] ?? null;
    const b = sorted[at] ?? null;
    const key = generateKeyBetween(a, b);
    keys.push([a, b, key]);
    pool.push(key);
  }
  // Runs of appends and prepends walk through the integer heads.
  let last: string | null = null;
  for (let i = 0; i < 200; i += 1) {
    const key = generateKeyBetween(last, null);
    keys.push([last, null, key]);
    last = key;
  }
  let first: string | null = null;
  for (let i = 0; i < 200; i += 1) {
    const key = generateKeyBetween(null, first);
    keys.push([null, first, key]);
    first = key;
  }

  const between = [];
  for (let i = 0; i < 200; i += 1) {
    const sorted = [...pool].sort();
    const at = int(sorted.length + 1);
    const before = sorted[at - 1] ?? null;
    const after = sorted[at] ?? null;
    const random = recorded();
    between.push({ before, after, out: positionBetween(before, after, random.fn), randoms: random.used });
  }

  // positionAt and dropPosition draw from Math.random, so it is swapped for the recorder.
  const realRandom = Math.random;
  const withRandom = <T>(run: () => T): { out: T; randoms: number[] } => {
    const random = recorded();
    Math.random = random.fn;
    try {
      return { out: run(), randoms: random.used };
    } finally {
      Math.random = realRandom;
    }
  };
  const items = (n: number) => {
    const chosen = Array.from({ length: n }, (_, i) => ({
      id: `i${i}`,
      // A few equal positions, as after an offline collision.
      position: chance(0.15) ? 'a0' : pick(pool),
    }));
    return chosen.sort(byPosition);
  };

  const at = [];
  for (let i = 0; i < 200; i += 1) {
    const sorted = items(int(7));
    const index = int(sorted.length + 1);
    at.push({ sorted, index, ...withRandom(() => positionAt(sorted, index)) });
  }

  const drop = [];
  for (let i = 0; i < 200; i += 1) {
    const siblings = items(int(7));
    const visible = siblings.filter(() => chance(0.7)).map((s) => s.id);
    const movedId = 'moved';
    const visibleOrder = [...visible];
    if (chance(0.95)) visibleOrder.splice(int(visibleOrder.length + 1), 0, movedId);
    drop.push({
      siblings,
      visibleOrder,
      movedId,
      ...withRandom(() => dropPosition(siblings, visibleOrder, movedId)),
    });
  }

  const order = [];
  for (let i = 0; i < 40; i += 1) {
    const list = Array.from({ length: 8 }, (_, n) => ({
      id: pick(['x', 'y', 'z', 'A', 'b0', '0']) + n,
      position: pick(['a0', 'a1', 'Zz', 'a0V', 'a0']),
    }));
    order.push({ items: list, sorted: [...list].sort(byPosition).map((x) => x.id) });
  }
  return { keys, between, at, drop, order };
}

// ---------- dates ----------

const randomDate = () => addDays('2026-11-17', int(80) - 40);
const randomTime = () => `${String(int(24)).padStart(2, '0')}:${String(int(60)).padStart(2, '0')}`;
const randomValue = (): DateValue => ({ date: randomDate(), time: chance(0.5) ? randomTime() : null });
const randomNow = () => BASE + int(40 * 86_400_000) - 20 * 86_400_000;

function dateVectors() {
  const many = <T>(n: number, make: () => T) => Array.from({ length: n }, make);
  const edgeDates = ['2024-02-28', '2024-02-29', '2025-12-31', '2026-01-01', '2026-03-29', '2026-10-25'];
  return {
    addDays: many(80, () => {
      const date = chance(0.3) ? pick(edgeDates) : randomDate();
      const days = int(800) - 400;
      return [date, days, addDays(date, days)];
    }),
    daysBetween: many(60, () => {
      const a = chance(0.3) ? pick(edgeDates) : randomDate();
      const b = chance(0.3) ? pick(edgeDates) : randomDate();
      return [a, b, daysBetween(a, b)];
    }),
    dayOfWeek: many(40, () => {
      const date = randomDate();
      return [date, dayOfWeek(date)];
    }),
    todayString: many(80, () => {
      // Around midnight in Algiers (23:00 UTC), where the day changes.
      const now = chance(0.5)
        ? Date.UTC(2026, int(12), 1 + int(28), 22 + int(2), int(60), int(60))
        : randomNow();
      return [now, todayString(now)];
    }),
    zonedMs: many(60, () => {
      const date = chance(0.3) ? pick(edgeDates) : randomDate();
      const time = randomTime();
      return [date, time, zonedMs(date, time)];
    }),
    due: many(200, () => {
      const due = randomValue();
      const now = chance(0.5) ? dueMoment(due) + pick([-86_400_001, -86_400_000, -1, 0, 1, 60_000]) : randomNow();
      const completed = chance(0.15);
      return {
        due,
        now,
        completed,
        moment: dueMoment(due),
        state: dueState({ due, completed }, now),
        notifyAt: notifyAt(due),
        body: notificationBody(due, now),
        key: dueKey(due),
      };
    }),
    noDue: dueState({ due: null, completed: false }, BASE),
    chips: many(40, () => {
      const start = chance(0.5) ? randomValue() : null;
      const due = chance(0.7) ? randomValue() : null;
      return { start, due, out: formatChip(start, due), after: startAfterDue(start, due) };
    }),
    sameDay: [
      [{ date: '2026-11-17', time: '10:00' }, { date: '2026-11-17', time: '09:00' }],
      [{ date: '2026-11-17', time: '09:00' }, { date: '2026-11-17', time: '09:00' }],
      [{ date: '2026-11-17', time: null }, { date: '2026-11-17', time: '09:00' }],
      [{ date: '2026-11-17', time: '10:00' }, { date: '2026-11-17', time: null }],
    ].map(([start, due]) => ({ start, due, after: startAfterDue(start!, due!) })),
    formatDate: many(20, () => {
      const date = randomDate();
      return [date, formatDate(date), formatMonth(date)];
    }),
    timestamps: many(40, () => {
      const stamp = iso(randomNow());
      return [stamp, formatTimestamp(stamp)];
    }),
    months: many(30, () => {
      const date = chance(0.3) ? pick(edgeDates) : randomDate();
      const offset = int(30) - 15;
      return { date, offset, start: monthStart(date, offset), weeks: monthWeeks(date) };
    }),
    parseTime: ['9:05', '09:05', '0905', '905', '24:00', '23:59', ' 7:30 ', '7:3', 'abc', '', '12:60', '00:00', '2359', '1:00'].map(
      (text) => [text, parseTime(text)],
    ),
    presets: many(40, () => {
      const now = randomNow();
      return {
        now,
        today: presetDate('today', now),
        tomorrow: presetDate('tomorrow', now),
        nextWeek: presetDate('nextWeek', now),
      };
    }),
    moveDue: many(40, () => {
      const due = randomValue();
      const start = chance(0.6) ? randomValue() : null;
      const to = randomDate();
      return { start, due, to, out: moveDue({ start, due }, to) };
    }),
  };
}

// ---------- what each screen shows ----------

const T0 = iso(BASE - 30 * 86_400_000);

function world() {
  const boards: Board[] = [];
  const lists: List[] = [];
  const cards: Card[] = [];
  const now = randomNow();
  const deleted = (p: number) => (chance(p) ? iso(now - int(45 * 86_400_000)) : null);
  const positions = ['a0', 'a1', 'a2', 'Zz', 'a0V', 'a0'];
  for (let b = 0; b < 3; b += 1) {
    boards.push({
      id: `b${b}`,
      clocks: {},
      name: `Board ${b}`,
      emoji: chance(0.5) ? '📚' : null,
      color: 'neutral',
      showCompleted: chance(0.4),
      position: pick(positions),
      createdAt: T0,
      updatedAt: T0,
      deletedAt: deleted(0.15),
    });
    for (let l = 0; l < 2; l += 1) {
      lists.push({
        id: `l${b}${l}`,
        clocks: {},
        boardId: `b${b}`,
        name: `List ${b}${l}`,
        position: pick(positions),
        createdAt: T0,
        updatedAt: T0,
        deletedAt: deleted(0.15),
      });
    }
  }
  const today = todayString(now);
  for (let c = 0; c < 24; c += 1) {
    const board = int(3);
    const due = chance(0.75)
      ? { date: addDays(today, int(9) - 4), time: chance(0.5) ? randomTime() : null }
      : null;
    const start = chance(0.4) ? { date: addDays(today, int(9) - 5), time: chance(0.3) ? randomTime() : null } : null;
    cards.push({
      id: `c${String(c).padStart(2, '0')}`,
      clocks: {},
      boardId: `b${board}`,
      // Now and then a card whose list is gone.
      listId: chance(0.05) ? 'gone' : `l${board}${int(2)}`,
      position: pick(positions),
      title: `Card ${c}`,
      description: chance(0.3) ? 'notes' : '',
      start,
      due,
      priority: pick(['none', 'low', 'medium', 'high', 'urgent'] as const),
      completed: chance(0.2),
      completedAt: null,
      plannedFor: chance(0.3) ? addDays(today, int(6) - 4) : null,
      createdAt: T0,
      updatedAt: T0,
      deletedAt: deleted(0.15),
    });
  }
  return { now, boards, lists, cards };
}

function screenVectors() {
  const out = [];
  for (let i = 0; i < 30; i += 1) {
    const { now, boards, lists, cards } = world();
    const filter = chance(0.4) ? new Set([pick(boards).id]) : new Set<string>();
    const entries = selectCalendar(boards, lists, cards, filter);
    const today = todayString(now);
    const days: Record<string, string[]> = {};
    for (let d = -5; d <= 5; d += 1) {
      const date = addDays(today, d);
      days[date] = entriesOnDay(entries, date).map((e) => e.card.id);
    }
    out.push({
      now,
      boards,
      lists,
      cards,
      reasons: Object.fromEntries(cards.map((c) => [c.id, todayReason(c, now)])),
      today: selectToday(boards, lists, cards, now).map((g) => ({
        boardId: g.board.id,
        cardIds: g.cards.map((c) => c.id),
      })),
      badge: todayBadgeCount(boards, lists, cards, now),
      trash: selectTrash(boards, lists, cards, now),
      daysLeft: cards.filter((c) => c.deletedAt).map((c) => [c.deletedAt, trashDaysLeft(c.deletedAt!, now)]),
      restore: cards.map((c) => [
        c.id,
        cardRestorePlan(
          c,
          lists.filter((l) => l.boardId === c.boardId),
        ),
      ]),
      filter: [...filter],
      calendar: entries.map((e) => ({ cardId: e.card.id, from: e.from, to: e.to, listName: e.listName })),
      days,
    });
  }
  return out;
}

// ---------- the server: push and pull ----------

function serverVectors() {
  const scenarios = [];
  for (let s = 0; s < 20; s += 1) {
    const db = openDb(':memory:');
    let now = BASE + s * 1000;
    const ids: Record<TableName, string[]> = {
      boards: ['b1', 'b2'],
      lists: ['l1', 'l2', 'l3'],
      cards: ['c1', 'c2', 'c3', 'c4', 'c5'],
      settings: ['settings'],
      notifications: ['c1:2026-11-20', 'c2:2026-11-21T18:00'],
    };
    const stamp = () => iso(now - int(86_400_000));
    const fieldValues: Record<TableName, Record<string, () => unknown>> = {
      boards: {
        name: () => (chance(0.08) ? '' : pick(['Uni', 'Work', 'Home'])),
        emoji: () => pick([null, '📚', '🏠']),
        color: () => (chance(0.08) ? 'pink' : pick(['neutral', 'blue', 'rose'])),
        showCompleted: () => (chance(0.05) ? 1 : chance(0.5)),
        position: () => pick(['a0', 'a1', 'Zz']),
        createdAt: stamp,
        updatedAt: stamp,
        deletedAt: () => (chance(0.3) ? stamp() : null),
      },
      lists: {
        boardId: () => pick(ids.boards),
        name: () => pick(['To do', 'Doing', 'Done']),
        position: () => pick(['a0', 'a1', 'Zz']),
        createdAt: stamp,
        updatedAt: stamp,
        deletedAt: () => (chance(0.3) ? stamp() : null),
      },
      cards: {
        boardId: () => pick(ids.boards),
        listId: () => pick(ids.lists),
        position: () => pick(['a0', 'a1', 'Zz', 'a0V']),
        title: () => (chance(0.05) ? '' : pick(['Read', 'Write report', 'Call'])),
        description: () => pick(['', '# Notes\n- [ ] one']),
        start: () => (chance(0.6) ? null : { date: '2026-11-18', time: null }),
        due: () =>
          chance(0.4)
            ? null
            : chance(0.08)
              ? { date: '18/11/2026', time: null }
              : { date: '2026-11-2' + int(9), time: chance(0.5) ? '18:00' : null },
        priority: () => (chance(0.05) ? 'top' : pick(['none', 'low', 'medium', 'high', 'urgent'])),
        completed: () => chance(0.3),
        completedAt: () => (chance(0.3) ? stamp() : null),
        plannedFor: () => (chance(0.3) ? '2026-11-17' : null),
        createdAt: stamp,
        updatedAt: () => (chance(0.03) ? 'yesterday' : stamp()),
        deletedAt: () => (chance(0.2) ? stamp() : null),
      },
      settings: {
        theme: () => pick(['system', 'light', 'dark']),
        density: () => pick(['compact', 'roomy']),
        updatedAt: stamp,
      },
      notifications: {
        cardId: () => 'c1',
        dueKey: () => '2026-11-20',
        title: () => 'Changed by a device',
        body: () => 'Changed by a device',
        createdAt: stamp,
        readAt: () => (chance(0.8) ? stamp() : null),
      },
    };
    const makeChange = (): Change => {
      const table = pick(['boards', 'lists', 'cards', 'cards', 'cards', 'settings', 'notifications'] as TableName[]);
      const id = pick(ids[table]);
      if (chance(0.07)) return { table, id, fields: {}, clocks: {}, purge: true };
      const names = Object.keys(fieldValues[table]);
      const whole = chance(0.55);
      const change: Change = { table, id, fields: {}, clocks: {} };
      // One edit stamps all its fields with the same clock, as the apps do.
      const clock = chance(0.06)
        ? formatHlc(now + 3_600_000, int(3), pick(NODES)) // a phone with a wrong clock
        : formatHlc(now - int(120_000), int(3), pick(NODES));
      for (const name of names) {
        if (!whole && !chance(0.3)) continue;
        change.fields[name] = fieldValues[table][name]!();
        if (chance(0.97)) change.clocks[name] = clock;
      }
      return change;
    };

    const steps: unknown[] = [];
    let lastSeq = 0;
    for (let i = 0; i < 40; i += 1) {
      now += 1 + int(5000);
      const roll = rnd();
      if (roll < 0.65) {
        const changes = Array.from({ length: 1 + int(5) }, makeChange);
        const { changed: _changed, ...response } = applyChanges(db, structuredClone(changes), now);
        steps.push({ op: 'push', now, changes, response });
      } else if (roll < 0.9) {
        const since = chance(0.5) ? 0 : int(lastSeq + 1);
        const response = pullChanges(db, since, now);
        lastSeq = response.seq;
        steps.push({ op: 'pull', now, since, response });
      } else {
        // The server makes a notification row itself (server/src/notifications.ts).
        const id = pick(ids.notifications);
        const row: Row = {
          id,
          cardId: id.split(':')[0],
          dueKey: id.split(':')[1],
          title: 'Read',
          body: 'Due tomorrow',
          createdAt: iso(now),
          readAt: null,
          clocks: {},
        };
        writeRow(db, 'notifications', row, bumpSeq(db));
        steps.push({ op: 'serverWrite', table: 'notifications', row });
      }
    }
    const final = pullChanges(db, 0, now);
    steps.push({ op: 'pull', now, since: 0, response: final });
    scenarios.push(steps);
    db.close();
  }
  return scenarios;
}

const vectors = {
  hlc: hlcVectors(),
  merge: mergeVectors(),
  positions: positionVectors(),
  dates: dateVectors(),
  screens: screenVectors(),
  server: serverVectors(),
};

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'test', 'vectors.json');
fs.writeFileSync(target, `${JSON.stringify(vectors)}\n`);
console.log(`Wrote ${target} (${Math.round(fs.statSync(target).size / 1024)} KB)`);
