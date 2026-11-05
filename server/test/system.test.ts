import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { SubscriptionInput } from '../src/push.js';

const sub = { endpoint: 'https://push.example/a', keys: { p256dh: 'k', auth: 'a' } };

describe('system routes', () => {
  let app: FastifyInstance;
  const sent: { sub: SubscriptionInput; payload: string }[] = [];

  beforeEach(async () => {
    sent.length = 0;
    app = await buildApp(
      { host: '127.0.0.1', port: 0, dbPath: ':memory:', webDist: '/nonexistent', vapid: null },
      {
        pushSender: async (s, payload) => {
          sent.push({ sub: s, payload });
        },
      },
    );
  });

  afterEach(() => app.close());

  it('reports health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toEqual({ ok: true });
  });

  it('sends the login redirect target home', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/refresh' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('rejects a malformed subscription', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('sends a test push to each saved subscription once', async () => {
    await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: sub });
    await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: sub });
    const res = await app.inject({ method: 'POST', url: '/api/push/test' });
    expect(res.json()).toEqual({ sent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.sub.endpoint).toBe(sub.endpoint);
  });
});
