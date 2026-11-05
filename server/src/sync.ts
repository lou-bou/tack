import {
  TABLE_NAMES,
  TABLE_SCHEMAS,
  clampHlc,
  dueKey,
  fieldNames,
  hlcMs,
  mergeChange,
  notifyAt,
  trashDaysLeft,
  type Change,
  type DateValue,
  type PullResponse,
  type PushResponse,
  type RejectedChange,
  type Row,
  type TableName,
  type Tombstone,
} from '@tack/shared';
import type { Db } from './db/index.js';

const BOOLEAN_FIELDS = new Set(['showCompleted', 'completed']);
const JSON_FIELDS = new Set(['start', 'due', 'clocks']);

type DbRow = Record<string, unknown>;

function fromDb(row: DbRow): Row {
  const out: DbRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'seq') continue;
    if (BOOLEAN_FIELDS.has(key)) out[key] = value === 1;
    else if (JSON_FIELDS.has(key)) out[key] = value === null ? null : JSON.parse(value as string);
    else out[key] = value;
  }
  return out as Row;
}

function toDb(value: unknown, field: string): unknown {
  if (BOOLEAN_FIELDS.has(field)) return value ? 1 : 0;
  if (JSON_FIELDS.has(field)) return value === null ? null : JSON.stringify(value);
  return value;
}

function readRow(db: Db, table: TableName, id: string): Row | null {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as DbRow | undefined;
  return row ? fromDb(row) : null;
}

export function writeRow(db: Db, table: TableName, row: Row, seq: number): void {
  const fields = fieldNames(table);
  const columns = ['id', ...fields, 'clocks', 'seq'];
  const values = [row.id, ...fields.map((f) => toDb(row[f], f)), JSON.stringify(row.clocks), seq];
  db.prepare(
    `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  ).run(...values);
}

export function currentSeq(db: Db): number {
  return db.prepare("SELECT value FROM meta WHERE key = 'seq'").pluck().get() as number;
}

export function bumpSeq(db: Db): number {
  const seq = currentSeq(db) + 1;
  db.prepare("UPDATE meta SET value = ? WHERE key = 'seq'").run(seq);
  return seq;
}

function isTombstoned(db: Db, table: TableName, id: string): boolean {
  return !!db.prepare('SELECT 1 FROM tombstones WHERE tableName = ? AND id = ?').get(table, id);
}

export function removeRow(db: Db, table: TableName, id: string, seq: number): void {
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  db.prepare('INSERT OR REPLACE INTO tombstones (tableName, id, seq) VALUES (?, ?, ?)').run(
    table,
    id,
    seq,
  );
}

const ids = (db: Db, sql: string, ...params: unknown[]) =>
  db
    .prepare(sql)
    .pluck()
    .all(...params) as string[];

/**
 * Deletes forever. A list takes the cards that went to Trash with it, but a card trashed on its own
 * keeps its own 30 days. A board takes everything in it.
 */
export function purgeRow(db: Db, table: TableName, id: string, seq: number): void {
  if (table === 'lists') {
    for (const cardId of ids(
      db,
      'SELECT id FROM cards WHERE listId = ? AND deletedAt IS NULL',
      id,
    )) {
      removeRow(db, 'cards', cardId, seq);
    }
  }
  if (table === 'boards') {
    for (const cardId of ids(db, 'SELECT id FROM cards WHERE boardId = ?', id)) {
      removeRow(db, 'cards', cardId, seq);
    }
    for (const listId of ids(db, 'SELECT id FROM lists WHERE boardId = ?', id)) {
      removeRow(db, 'lists', listId, seq);
    }
  }
  removeRow(db, table, id, seq);
}

/**
 * A due date set after its notification would have gone out never notifies (SPEC §3.8). This goes
 * by when the edit was made, not when it arrived, so one made offline in time still gets its
 * notification once it syncs.
 */
function skipIfPastTrigger(db: Db, card: Row): void {
  const due = card.due as DateValue | null;
  const clock = card.clocks.due;
  if (!due || !clock || hlcMs(clock) < notifyAt(due)) return;
  db.prepare('INSERT OR IGNORE INTO notification_log (cardId, dueKey) VALUES (?, ?)').run(
    card.id,
    dueKey(due),
  );
}

/** Devices can only mark notifications read. The server creates them. */
function allowedFields(table: TableName): Set<string> {
  return new Set(table === 'notifications' ? ['readAt'] : fieldNames(table));
}

const PURGEABLE: readonly TableName[] = ['boards', 'lists', 'cards'];

export interface ApplyResult extends PushResponse {
  changed: boolean;
}

export function applyChanges(db: Db, changes: Change[], now: number): ApplyResult {
  return db.transaction((): ApplyResult => {
    const rejected: RejectedChange[] = [];
    let seq: number | null = null;
    const nextSeq = () => (seq ??= bumpSeq(db));

    for (const change of changes) {
      const { table, id } = change;
      if (isTombstoned(db, table, id)) {
        rejected.push({ table, id, row: null });
        continue;
      }
      const existing = readRow(db, table, id);

      if (change.purge) {
        if (PURGEABLE.includes(table)) purgeRow(db, table, id, nextSeq());
        else rejected.push({ table, id, row: existing });
        continue;
      }

      const allowed = allowedFields(table);
      const clocks = Object.fromEntries(
        Object.entries(change.clocks)
          .filter(([field]) => allowed.has(field))
          .map(([field, clock]) => [field, clampHlc(clock, now)]),
      );
      const { row, changed } = mergeChange(existing, { ...change, clocks });
      if (!changed) continue;

      const { id: _id, clocks: _clocks, ...fields } = row;
      const valid = TABLE_SCHEMAS[table].safeParse(fields);
      if (!valid.success) {
        rejected.push({ table, id, row: existing });
        continue;
      }
      writeRow(db, table, row, nextSeq());
      if (table === 'cards' && row.clocks.due !== existing?.clocks.due) skipIfPastTrigger(db, row);
    }

    return { seq: seq ?? currentSeq(db), serverTime: now, rejected, changed: seq !== null };
  })();
}

/** Deletes anything whose 30 days in Trash are up. Each item's time runs from its own deletion. */
export function purgeExpired(db: Db, now: number): boolean {
  return db.transaction(() => {
    let seq: number | null = null;
    for (const table of PURGEABLE) {
      // Purging a board or list can already have removed the later rows, hence the second check.
      const found = db
        .prepare(`SELECT id, deletedAt FROM ${table} WHERE deletedAt IS NOT NULL`)
        .all() as { id: string; deletedAt: string }[];
      for (const { id, deletedAt } of found) {
        if (trashDaysLeft(deletedAt, now) > 0 || !readRow(db, table, id)) continue;
        seq ??= bumpSeq(db);
        purgeRow(db, table, id, seq);
      }
    }
    return seq !== null;
  })();
}

export function pullChanges(db: Db, since: number, now: number): PullResponse {
  return db.transaction((): PullResponse => {
    const rows: PullResponse['rows'] = {};
    for (const table of TABLE_NAMES) {
      const found = db.prepare(`SELECT * FROM ${table} WHERE seq > ?`).all(since) as DbRow[];
      if (found.length > 0) rows[table] = found.map(fromDb);
    }
    const tombstones = db
      .prepare('SELECT tableName AS "table", id FROM tombstones WHERE seq > ?')
      .all(since) as Tombstone[];
    return { seq: currentSeq(db), serverTime: now, rows, tombstones };
  })();
}
