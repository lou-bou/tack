import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { saveSubscription, sendToAll } from '../push.js';

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ ok: true }));

  // After an expired Cloudflare Access session the client navigates here. The service worker
  // never handles /api/, so the request reaches Access, which shows its login and then lands here.
  app.get('/auth/refresh', async (_req, reply) => reply.redirect('/'));

  app.get('/events', (_req, reply) => {
    reply.hijack();
    app.hub.add(reply.raw);
  });

  app.get('/push/key', async () => ({ publicKey: app.config.vapid?.publicKey ?? null }));

  app.post('/push/subscribe', async (req, reply) => {
    const parsed = subscriptionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid subscription' });
    saveSubscription(app.db, parsed.data);
    return { ok: true };
  });

  app.post('/push/test', async (_req, reply) => {
    if (!app.pushSender) return reply.code(503).send({ error: 'VAPID keys are not configured' });
    const sent = await sendToAll(app.db, app.pushSender, {
      title: 'Tack test notification',
      body: 'Push notifications are working.',
      url: '/',
    });
    return { sent };
  });
}
