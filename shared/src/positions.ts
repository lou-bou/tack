import { generateKeyBetween } from 'fractional-indexing';

/**
 * Fractional position strings. A random walk over nearby keys means two devices inserting at the
 * same spot offline almost never pick the same key, and if they do, `id` breaks the tie.
 */
export function positionBetween(
  before: string | null,
  after: string | null,
  random: () => number = Math.random,
): string {
  let lo = before;
  let hi = after;
  let key = generateKeyBetween(lo, hi);
  for (let i = 0; i < 4; i += 1) {
    if (random() < 0.5) {
      lo = key;
      key = generateKeyBetween(key, hi);
    } else {
      hi = key;
      key = generateKeyBetween(lo, key);
    }
  }
  return key;
}

export interface Positioned {
  id: string;
  position: string;
}

export function byPosition(a: Positioned, b: Positioned): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The position for an item placed at `index` in `sorted`, which must not include the item itself.
 * Two neighbours with equal positions (a rare offline collision) have nothing between them, so the
 * item goes after all of the equal ones.
 */
export function positionAt(sorted: readonly Positioned[], index: number): string {
  const before = sorted[index - 1]?.position ?? null;
  let next = index;
  while (before !== null && sorted[next] !== undefined && sorted[next]!.position <= before) {
    next += 1;
  }
  return positionBetween(before, sorted[next]?.position ?? null);
}

export function positionAtEnd(sorted: readonly Positioned[]): string {
  return positionAt(sorted, sorted.length);
}
