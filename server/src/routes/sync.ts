import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PROTOCOL_VERSION, pushRequestSchema } from '@tack/shared';
import { applyChanges, pullChanges } from '../sync.js';

const pullQuery = z.object({
  since: z.coerce.number().int().min(0),
  protocol: z.coerce.number().int(),
});

/** Far above any real batch, but a long Markdown description can be large. */
const PUSH_BODY_LIMIT = 16 * 1024 * 1024;

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.post('/sync/push', { bodyLimit: PUSH_BODY_LIMIT }, async (req, reply) => {
    const parsed = pushRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid push' });
    if (parsed.data.protocol !== PROTOCOL_VERSION) {
      return reply.code(426).send({ protocol: PROTOCOL_VERSION });
    }
    const { changed, ...response } = applyChanges(app.db, parsed.data.changes, Date.now());
    if (changed) app.hub.publish(response.seq);
    return response;
  });

  app.get('/sync/pull', async (req, reply) => {
    const parsed = pullQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid pull' });
    if (parsed.data.protocol !== PROTOCOL_VERSION) {
      return reply.code(426).send({ protocol: PROTOCOL_VERSION });
    }
    return pullChanges(app.db, parsed.data.since, Date.now());
  });
}
