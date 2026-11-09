import { z } from 'zod';
import { BOARD_COLORS, DENSITIES, PRIORITIES, THEMES } from './constants.js';

const isoTime = z.iso.datetime();
const dateValue = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
  })
  .nullable();
const position = z.string().min(1);

const boardFields = {
  name: z.string().min(1),
  emoji: z.string().nullable(),
  color: z.enum(BOARD_COLORS),
  showCompleted: z.boolean(),
  position,
  createdAt: isoTime,
  updatedAt: isoTime,
  deletedAt: isoTime.nullable(),
};

const listFields = {
  boardId: z.string().min(1),
  name: z.string().min(1),
  position,
  createdAt: isoTime,
  updatedAt: isoTime,
  deletedAt: isoTime.nullable(),
};

const cardFields = {
  // Never changes, since cards don't move between boards. A trashed card can outlive its list, and
  // this is how restore still finds the board (SPEC §3.9).
  boardId: z.string().min(1),
  listId: z.string().min(1),
  position,
  title: z.string().min(1),
  description: z.string(),
  start: dateValue,
  due: dateValue,
  priority: z.enum(PRIORITIES),
  completed: z.boolean(),
  completedAt: isoTime.nullable(),
  /** The day it was put on Today by hand. It stays there until done or taken off. */
  plannedFor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  createdAt: isoTime,
  updatedAt: isoTime,
  deletedAt: isoTime.nullable(),
};

const settingsFields = {
  theme: z.enum(THEMES),
  density: z.enum(DENSITIES),
  updatedAt: isoTime,
};

const notificationFields = {
  cardId: z.string().min(1),
  dueKey: z.string().min(1),
  title: z.string(),
  body: z.string(),
  createdAt: isoTime,
  readAt: isoTime.nullable(),
};

/** Every synced table and its fields. A field that isn't listed here can't sync. */
export const TABLE_SCHEMAS = {
  boards: z.object(boardFields),
  lists: z.object(listFields),
  cards: z.object(cardFields),
  settings: z.object(settingsFields),
  notifications: z.object(notificationFields),
};

export type TableName = keyof typeof TABLE_SCHEMAS;

/**
 * Values for fields added after release. A version of the app from before a field existed can still
 * create rows, and the server fills the field in rather than refusing them.
 */
export const FIELD_DEFAULTS: Partial<Record<TableName, Record<string, unknown>>> = {
  cards: { plannedFor: null },
};
export const TABLE_NAMES = Object.keys(TABLE_SCHEMAS) as TableName[];

export type BoardFields = z.infer<typeof TABLE_SCHEMAS.boards>;
export type ListFields = z.infer<typeof TABLE_SCHEMAS.lists>;
export type CardFields = z.infer<typeof TABLE_SCHEMAS.cards>;
export type SettingsFields = z.infer<typeof TABLE_SCHEMAS.settings>;
export type NotificationFields = z.infer<typeof TABLE_SCHEMAS.notifications>;

export type FieldsOf<T extends TableName> = z.infer<(typeof TABLE_SCHEMAS)[T]>;

/** Field name to the clock of its last write. */
export type Clocks = Record<string, string>;

/** A row as stored on devices and sent over the wire. */
export type Row<F = Record<string, unknown>> = F & { id: string; clocks: Clocks };

export type Board = Row<BoardFields>;
export type List = Row<ListFields>;
export type Card = Row<CardFields>;
export type Settings = Row<SettingsFields>;
export type Notification = Row<NotificationFields>;

export function fieldNames(table: TableName): string[] {
  return Object.keys(TABLE_SCHEMAS[table].shape);
}

const change = z.object({
  table: z.enum(Object.keys(TABLE_SCHEMAS) as [TableName, ...TableName[]]),
  id: z.string().min(1),
  fields: z.record(z.string(), z.unknown()),
  clocks: z.record(z.string(), z.string()),
  /** Delete forever, with no way back. */
  purge: z.boolean().optional(),
});

export type Change = z.infer<typeof change>;

export const pushRequestSchema = z.object({
  protocol: z.number().int(),
  changes: z.array(change),
});

export type PushRequest = z.infer<typeof pushRequestSchema>;

/** Changes the server refused, with the row as it stands (null if it doesn't exist). */
export interface RejectedChange {
  table: TableName;
  id: string;
  row: Row | null;
}

export interface PushResponse {
  seq: number;
  serverTime: number;
  rejected: RejectedChange[];
}

export interface Tombstone {
  table: TableName;
  id: string;
}

export interface PullResponse {
  /**
   * Changes when the server's database is restored from a backup. Its seq has gone back in time,
   * so a device seeing a new epoch starts over instead of trusting its own seq.
   */
  epoch: number;
  seq: number;
  serverTime: number;
  rows: Partial<Record<TableName, Row[]>>;
  tombstones: Tombstone[];
}
