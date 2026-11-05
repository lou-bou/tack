import webpush, { WebPushError } from 'web-push';
import type { Vapid } from './config.js';
import type { Db } from './db/index.js';

export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
}

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Sends through whichever push service owns the subscription. Tests replace this. */
export type PushSender = (sub: SubscriptionInput, payload: string) => Promise<unknown>;

export function vapidSender(vapid: Vapid): PushSender {
  const vapidDetails = {
    subject: vapid.subject,
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
  };
  return (sub, payload) => webpush.sendNotification(sub, payload, { vapidDetails });
}

export function saveSubscription(db: Db, sub: SubscriptionInput): void {
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, keys, createdAt) VALUES (?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET keys = excluded.keys`,
  ).run(sub.endpoint, JSON.stringify(sub.keys), new Date().toISOString());
}

/** Sends to every device. Subscriptions the push service says are gone get removed. */
export async function sendToAll(db: Db, send: PushSender, payload: PushPayload): Promise<number> {
  const rows = db.prepare('SELECT endpoint, keys FROM push_subscriptions').all() as {
    endpoint: string;
    keys: string;
  }[];
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    rows.map(async ({ endpoint, keys }) => {
      try {
        await send({ endpoint, keys: JSON.parse(keys) }, body);
      } catch (err) {
        if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
          db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
        }
        throw err;
      }
    }),
  );
  return results.filter((r) => r.status === 'fulfilled').length;
}
