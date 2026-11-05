import type { FastifyInstance } from 'fastify';
import { createDueNotifications, pruneNotifications } from './notifications.js';
import { sendToAll } from './push.js';
import { currentSeq, purgeExpired } from './sync.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** Sends what's due. The row is saved first, so at worst a failed push still shows in the bell. */
export async function sendDueNotifications(app: FastifyInstance, now: number): Promise<number> {
  const created = createDueNotifications(app.db, now);
  if (created.length === 0) return 0;
  app.hub.publish(currentSeq(app.db));
  if (!app.pushSender) return created.length;
  for (const { cardId, boardId, title, body } of created) {
    await sendToAll(app.db, app.pushSender, {
      title,
      body,
      url: `/board/${boardId}?card=${cardId}`,
    });
  }
  return created.length;
}

/** Background upkeep. Runs at startup too, so a stopped server catches up when it comes back. */
export function startScheduler(app: FastifyInstance): void {
  const guarded = (name: string, task: () => void | Promise<unknown>) => async () => {
    try {
      await task();
    } catch (error) {
      app.log.error(error, `${name} failed`);
    }
  };
  const notify = guarded('Notifications', () => sendDueNotifications(app, Date.now()));
  const upkeep = guarded('Trash purge', () => {
    const now = Date.now();
    const purged = purgeExpired(app.db, now);
    const pruned = pruneNotifications(app.db, now);
    if (purged || pruned) app.hub.publish(currentSeq(app.db));
  });

  void upkeep();
  void notify();
  const timers = [
    setInterval(() => void notify(), app.config.schedulerTickMs ?? MINUTE_MS),
    setInterval(() => void upkeep(), HOUR_MS),
  ];
  for (const timer of timers) timer.unref();
  app.addHook('onClose', async () => timers.forEach(clearInterval));
}
