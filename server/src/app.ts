import fs from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.js';
import { openDb, type Db } from './db/index.js';
import { EventHub } from './events.js';
import { vapidSender, type PushSender } from './push.js';
import { syncRoutes } from './routes/sync.js';
import { systemRoutes } from './routes/system.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    config: Config;
    hub: EventHub;
    pushSender: PushSender | null;
  }
}

export async function buildApp(
  config: Config,
  opts: { logger?: boolean; pushSender?: PushSender } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, forceCloseConnections: true });

  const db = openDb(config.dbPath);
  const hub = new EventHub();
  app.decorate('db', db);
  app.decorate('config', config);
  app.decorate('hub', hub);
  app.decorate('pushSender', opts.pushSender ?? (config.vapid ? vapidSender(config.vapid) : null));
  // Streams never finish on their own, and the server can't close while one is open.
  app.addHook('preClose', async () => hub.close());
  app.addHook('onClose', async () => db.close());

  await app.register(systemRoutes, { prefix: '/api' });
  await app.register(syncRoutes, { prefix: '/api' });

  const hasWeb = fs.existsSync(config.webDist);
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      cacheControl: false,
      setHeaders(res, filePath) {
        // Hashed assets never change. Everything else has to revalidate, or the service worker
        // and the shell could never update.
        const hashed = filePath.includes('/assets/');
        res.header('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }

  app.setNotFoundHandler((req, reply) => {
    // SPA fallback: unknown non-API GETs get index.html so client-side routes work on reload.
    // Paths with a file extension (missing assets) get a real 404 instead of HTML.
    const pathname = req.url.split('?')[0] ?? '';
    if (
      hasWeb &&
      req.method === 'GET' &&
      !pathname.startsWith('/api/') &&
      !/\.[a-z0-9]+$/i.test(pathname)
    ) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  return app;
}
