import {
  NOTIFICATION_KEEP_DAYS,
  dueKey,
  isOverdue,
  notificationBody,
  notifyAt,
  type DateValue,
} from '@tack/shared';
import type { Db } from './db/index.js';
import { bumpSeq, removeRow, writeRow } from './sync.js';

const DAY_MS = 86_400_000;

export interface DueNotification {
  cardId: string;
  boardId: string;
  title: string;
  body: string;
  seq: number;
}

/**
 * Makes a row for each live, open card whose trigger has passed and that isn't due yet. A late run
 * after downtime still catches them, worded from the real day (SPEC §3.8).
 */
export function createDueNotifications(db: Db, now: number): DueNotification[] {
  return db.transaction(() => {
    const cards = db
      .prepare(
        `SELECT c.id, c.boardId, c.title, c.due
         FROM cards c
         JOIN lists l ON l.id = c.listId
         JOIN boards b ON b.id = l.boardId
         WHERE c.deletedAt IS NULL AND l.deletedAt IS NULL AND b.deletedAt IS NULL
           AND c.completed = 0 AND c.due IS NOT NULL`,
      )
      .all() as { id: string; boardId: string; title: string; due: string }[];

    const logged = db.prepare('SELECT 1 FROM notification_log WHERE cardId = ? AND dueKey = ?');
    const log = db.prepare('INSERT INTO notification_log (cardId, dueKey) VALUES (?, ?)');
    const created: DueNotification[] = [];
    let seq: number | null = null;

    for (const card of cards) {
      const due = JSON.parse(card.due) as DateValue;
      if (now < notifyAt(due) || isOverdue(due, now)) continue;
      const key = dueKey(due);
      if (logged.get(card.id, key)) continue;

      seq ??= bumpSeq(db);
      log.run(card.id, key);
      const body = notificationBody(due, now);
      writeRow(
        db,
        'notifications',
        {
          id: `${card.id}:${key}`,
          cardId: card.id,
          dueKey: key,
          title: card.title,
          body,
          createdAt: new Date(now).toISOString(),
          readAt: null,
          clocks: {},
        },
        seq,
      );
      created.push({ cardId: card.id, boardId: card.boardId, title: card.title, body, seq });
    }
    return created;
  })();
}

/** The bell only lists the last 30 days. The log stays, so nothing old can notify again. */
export function pruneNotifications(db: Db, now: number): boolean {
  return db.transaction(() => {
    const cutoff = new Date(now - NOTIFICATION_KEEP_DAYS * DAY_MS).toISOString();
    const old = db
      .prepare('SELECT id FROM notifications WHERE createdAt < ?')
      .pluck()
      .all(cutoff) as string[];
    if (old.length === 0) return false;
    const seq = bumpSeq(db);
    for (const id of old) removeRow(db, 'notifications', id, seq);
    return true;
  })();
}
