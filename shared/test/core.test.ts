import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  HlcClock,
  byPosition,
  clampHlc,
  hlcMs,
  mergeChange,
  positionAt,
  positionBetween,
  type Change,
  type Row,
} from '../src/index.js';

describe('HLC', () => {
  it('always moves forward, even when the wall clock jumps back', () => {
    let wall = 1000;
    const clock = new HlcClock('a', () => wall);
    const first = clock.now();
    wall = 500;
    const second = clock.now();
    const third = clock.now();
    expect(second > first).toBe(true);
    expect(third > second).toBe(true);
  });

  it('moves past a clock observed from elsewhere', () => {
    const a = new HlcClock('a', () => 1000);
    const b = new HlcClock('b', () => 5000);
    a.observe(b.now());
    const edit = a.now();
    expect(hlcMs(edit)).toBe(5000);
    expect(a.now() > edit).toBe(true);
  });

  it('corrects a wrong device clock from server time', () => {
    const clock = new HlcClock('a', () => 1000);
    clock.syncWall(9000);
    expect(hlcMs(clock.now())).toBe(9000);
  });

  it('clamps timestamps too far in the future', () => {
    const far = new HlcClock('a', () => 10_000_000).now();
    const clamped = clampHlc(far, 1000);
    expect(hlcMs(clamped)).toBe(301_000);
    expect(clamped.endsWith(':a')).toBe(true);
    const near = new HlcClock('a', () => 2000).now();
    expect(clampHlc(near, 1000)).toBe(near);
  });
});

function change(fields: Record<string, unknown>, clock: string): Change {
  const clocks = Object.fromEntries(Object.keys(fields).map((k) => [k, clock]));
  return { table: 'cards', id: 'c1', fields, clocks };
}

describe('merge', () => {
  it('keeps the later write per field, independently', () => {
    const base: Row = {
      id: 'c1',
      title: 'A',
      priority: 'low',
      clocks: { title: '2', priority: '2' },
    };
    const { row } = mergeChange(
      mergeChange(base, change({ title: 'B' }, '3')).row,
      change({ priority: 'high', title: 'C' }, '1'),
    );
    expect(row.title).toBe('B');
    expect(row.priority).toBe('low');
  });

  it('reports no change for a repeated batch', () => {
    const first = mergeChange(null, change({ title: 'A' }, '1'));
    expect(first.changed).toBe(true);
    expect(mergeChange(first.row, change({ title: 'A' }, '1')).changed).toBe(false);
  });

  it('does not touch the row it was given', () => {
    const base: Row = { id: 'c1', title: 'A', clocks: { title: '1' } };
    mergeChange(base, change({ title: 'B' }, '2'));
    expect(base).toEqual({ id: 'c1', title: 'A', clocks: { title: '1' } });
  });

  it('gives the same result in any order, however often changes repeat', () => {
    const edit = fc.record({
      field: fc.constantFrom('title', 'priority', 'position'),
      value: fc.string(),
      clock: fc.integer({ min: 1, max: 1_000_000 }),
    });
    fc.assert(
      fc.property(
        fc
          .uniqueArray(edit, { selector: (e) => e.clock, minLength: 1 })
          .chain((edits) =>
            fc.tuple(
              fc.constant(edits),
              fc.shuffledSubarray([...edits, ...edits], { minLength: edits.length * 2 }),
            ),
          ),
        ([edits, shuffled]) => {
          const apply = (list: typeof edits) =>
            list.reduce<Row | null>(
              (row, e) =>
                mergeChange(row, change({ [e.field]: e.value }, String(e.clock).padStart(10, '0')))
                  .row,
              null,
            );
          expect(apply(shuffled)).toEqual(apply(edits));
        },
      ),
    );
  });
});

describe('positions', () => {
  it('generates between its neighbours', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 0.999, noNaN: true }), { maxLength: 30 }),
        (rolls) => {
          let a: string | null = null;
          let b: string | null = null;
          let i = 0;
          const random = () => rolls[i++ % Math.max(rolls.length, 1)] ?? 0.5;
          for (let step = 0; step < 20; step += 1) {
            const key = positionBetween(a, b, random);
            if (a !== null) expect(key > a).toBe(true);
            if (b !== null) expect(key < b).toBe(true);
            if (random() < 0.5) a = key;
            else b = key;
          }
        },
      ),
    );
  });

  it('rarely picks the same key on two devices at the same spot', () => {
    const keys = new Set(Array.from({ length: 200 }, () => positionBetween('a1', 'a2')));
    expect(keys.size).toBeGreaterThan(10);
  });

  it('sorts equal positions by id', () => {
    const items = [
      { id: 'b', position: 'a1' },
      { id: 'a', position: 'a1' },
    ];
    expect([...items].sort(byPosition).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('places an item correctly in a sorted list', () => {
    const sorted = [
      { id: 'a', position: 'a1' },
      { id: 'b', position: 'a3' },
    ];
    const start = positionAt(sorted, 0);
    const middle = positionAt(sorted, 1);
    const end = positionAt(sorted, 2);
    expect(start < 'a1').toBe(true);
    expect(middle > 'a1' && middle < 'a3').toBe(true);
    expect(end > 'a3').toBe(true);
  });

  it('goes after neighbours with equal positions instead of throwing', () => {
    const sorted = [
      { id: 'a', position: 'a1' },
      { id: 'b', position: 'a1' },
      { id: 'c', position: 'a3' },
    ];
    const key = positionAt(sorted, 1);
    expect(key > 'a1' && key < 'a3').toBe(true);
  });
});
