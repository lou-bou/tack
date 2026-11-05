import type { FastifyInstance } from 'fastify';
import { currentSeq, purgeExpired } from './sync.js';

const HOUR_MS = 3_600_000;

/** Background upkeep. Runs at startup too, so a stopped server catches up when it comes back. */
export function startScheduler(app: FastifyInstance): void {
  const purge = () => {
    try {
      if (purgeExpired(app.db, Date.now())) app.hub.publish(currentSeq(app.db));
    } catch (error) {
      app.log.error(error, 'Trash purge failed');
    }
  };
  purge();
  const timer = setInterval(purge, HOUR_MS);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
}
