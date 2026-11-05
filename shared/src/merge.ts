import { HLC_ZERO } from './hlc.js';
import type { Change, Row } from './schema.js';

export interface MergeResult {
  row: Row;
  changed: boolean;
}

/**
 * Last write wins per field: each field keeps the value with the higher clock. Merging the same
 * change twice gives the same result, so a retried batch does no harm.
 */
export function mergeChange(existing: Row | null, change: Change): MergeResult {
  const row: Row = existing
    ? { ...existing, clocks: { ...existing.clocks } }
    : { id: change.id, clocks: {} };
  let changed = false;
  for (const [field, value] of Object.entries(change.fields)) {
    const clock = change.clocks[field];
    if (clock === undefined) continue;
    if (clock > (row.clocks[field] ?? HLC_ZERO)) {
      row[field] = value;
      row.clocks[field] = clock;
      changed = true;
    }
  }
  return { row, changed };
}
