import { TZDate } from '@date-fns/tz';
import { TIME_ZONE } from './constants.js';

/**
 * A date with an optional time, stored as wall-clock strings and always read in TIME_ZONE, so a
 * date-only value can never shift across zones. `date` and `time` merge as one unit in sync.
 */
export interface DateValue {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, or null for all day */
  time: string | null;
}

export const DEFAULT_DUE_TIME = '23:59';
export const DEFAULT_START_TIME = '09:00';
/** A date-only due date notifies at this time on the day before (SPEC §3.8). */
export const DATE_ONLY_NOTIFY_TIME = '09:00';

const DAY_MS = 86_400_000;

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y ?? 0, m ?? 1, d ?? 1];
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Calendar arithmetic through UTC, where every day is exactly 24 hours. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/** 0 is Sunday. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The current date in TIME_ZONE. */
export function todayString(now: number): string {
  const t = new TZDate(now, TIME_ZONE);
  return `${pad(t.getFullYear(), 4)}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** Epoch ms of a wall-clock moment in TIME_ZONE. */
export function zonedMs(date: string, time: string): number {
  const [y, m, d] = parts(date);
  const [hh, mm] = time.split(':').map(Number);
  return new TZDate(y, m - 1, d, hh ?? 0, mm ?? 0, TIME_ZONE).getTime();
}

/** Compares date values in time order. A date-only value counts as the end of its day. */
export function dueMoment(value: DateValue): number {
  return value.time
    ? zonedMs(value.date, value.time)
    : zonedMs(addDays(value.date, 1), '00:00') - 1;
}

export function isOverdue(due: DateValue, now: number): boolean {
  return now > dueMoment(due);
}

/** A timed card is due soon in its last 24 hours, a date-only card on its due day. */
export function isDueSoon(due: DateValue, now: number): boolean {
  if (isOverdue(due, now)) return false;
  if (!due.time) return due.date === todayString(now);
  return dueMoment(due) - now <= DAY_MS;
}

export type DueState = 'none' | 'neutral' | 'dueSoon' | 'overdue' | 'completed';

export function dueState(
  card: { due: DateValue | null; completed: boolean },
  now: number,
): DueState {
  if (card.completed) return 'completed';
  if (!card.due) return 'none';
  if (isOverdue(card.due, now)) return 'overdue';
  if (isDueSoon(card.due, now)) return 'dueSoon';
  return 'neutral';
}

/** DD/MM/YYYY */
export function formatDate(date: string): string {
  const [y, m, d] = parts(date);
  return `${pad(d)}/${pad(m)}/${pad(y, 4)}`;
}

export function formatDateValue(value: DateValue): string {
  return value.time ? `${formatDate(value.date)} ${value.time}` : formatDate(value.date);
}

/** Text of the date chip: `start → due`, or whichever one is set. */
export function formatChip(start: DateValue | null, due: DateValue | null): string {
  if (start && due) return `${formatDateValue(start)} → ${formatDateValue(due)}`;
  const only = due ?? start;
  return only ? formatDateValue(only) : '';
}

export type DatePreset = 'today' | 'tomorrow' | 'nextWeek';

/** "Next week" is the next Sunday. On a Sunday that is 7 days on, never today. */
export function presetDate(preset: DatePreset, now: number): string {
  const today = todayString(now);
  if (preset === 'today') return today;
  if (preset === 'tomorrow') return addDays(today, 1);
  return addDays(today, 7 - dayOfWeek(today));
}

/** Whether `start` falls after `due`. The UI prevents it; a sync merge can still produce it. */
export function startAfterDue(start: DateValue | null, due: DateValue | null): boolean {
  if (!start || !due) return false;
  if (start.date !== due.date) return start.date > due.date;
  return !!start.time && !!due.time && start.time > due.time;
}

/**
 * New dates for a card dragged to another day on the calendar: the due date moves and keeps its
 * time, and the start date shifts by the same number of days (SPEC §3.7).
 */
export function moveDue(
  card: { start: DateValue | null; due: DateValue },
  newDueDate: string,
): { start: DateValue | null; due: DateValue } {
  const delta = daysBetween(card.due.date, newDueDate);
  return {
    due: { ...card.due, date: newDueDate },
    start: card.start ? { ...card.start, date: addDays(card.start.date, delta) } : null,
  };
}

/** When the "due tomorrow" notification fires: 24 hours before, or 09:00 the day before. */
export function notifyAt(due: DateValue): number {
  return due.time
    ? zonedMs(due.date, due.time) - DAY_MS
    : zonedMs(addDays(due.date, -1), DATE_ONLY_NOTIFY_TIME);
}

/** Notification text, based on the real day, since a send can run late after server downtime. */
export function notificationBody(due: DateValue, now: number): string {
  const today = todayString(now);
  const at = due.time ? ` at ${due.time}` : '';
  if (due.date === today) return `Due today${at}`;
  if (due.date === addDays(today, 1)) return `Due tomorrow${at}`;
  return `Due ${formatDate(due.date)}${at}`;
}

/** Identifies one due date value, so each is notified at most once. */
export function dueKey(due: DateValue): string {
  return due.time ? `${due.date}T${due.time}` : due.date;
}
