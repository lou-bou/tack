import Dexie, { type Table } from 'dexie';
import type {
  Board,
  Card,
  Change,
  List,
  Notification,
  Row,
  Settings,
  TableName,
} from '@tack/shared';

/** One queued change per row. Later edits to the same row merge into it. */
export interface OutboxEntry extends Change {
  key: string;
}

export type SyncStatus = 'connecting' | 'online' | 'offline' | 'expired' | 'outdated';

export interface MetaEntry {
  key: 'seq' | 'status' | 'epoch';
  value: number | SyncStatus;
}

export class TackDb extends Dexie {
  boards!: Table<Board, string>;
  lists!: Table<List, string>;
  cards!: Table<Card, string>;
  settings!: Table<Settings, string>;
  notifications!: Table<Notification, string>;
  outbox!: Table<OutboxEntry, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name = 'tack') {
    super(name);
    this.version(1).stores({
      boards: 'id',
      lists: 'id, boardId',
      cards: 'id, boardId, listId',
      settings: 'id',
      notifications: 'id',
      outbox: 'key',
      meta: 'key',
    });
  }

  rows(table: TableName): Table<Row, string> {
    return this.table(table);
  }
}

export const outboxKey = (table: TableName, id: string) => `${table}:${id}`;
