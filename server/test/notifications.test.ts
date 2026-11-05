import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { zonedMs, type Change, type DateValue } from '@tack/shared';
import { buildApp } from '../src/app.js';
import { pruneNotifications } from '../src/notifications.js';
import { saveSubscription } from '../src/push.js';
import { sendDueNotifications } from '../src/scheduler.js';
import { applyChanges, pullChanges } from '../src/sync.js';

const T = '2026-01-01T00:00:00.000Z';
const DUE: DateValue = { date: '2026-11-10', time: '18:00' };
/** Times around that due date's trigger, 18:00 on the 9th. */
const BEFORE = zonedMs('2026-11-09', '17:00');
const TRIGGER = zonedMs('2026-11-09', '18:00');
const clock = (ms: number) => `${String(ms).padStart(13, '0')}:0000:device`;

function change(table: Change['table'], id: string, fields: Record<string, unknown>, at: number) {
  const stamp = clock(at);
  return {
    table,
    id,
    fields,
    clocks: Object.fromEntries(Object.keys(fields).map((f) => [f, stamp])),
  } as Change;
}

const common = { createdAt: T, updatedAt: T, deletedAt: null, position: 'a0' };

describe('due notifications', () => {
  let app: FastifyInstance;
  const sent: { endpoint: string; payload: Record<string, string> }[] = [];

  beforeEach(async () => {
    sent.length = 0;
    app = await buildApp(
      { host: '127.0.0.1', port: 0, dbPath: ':memory:', webDist: '/nonexistent', vapid: null },
      {
        pushSender: async (sub, payload) => {
          sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
        },
      },
    );
    saveSubscription(app.db, {
      endpoint: 'https://push.example/phone',
      keys: { p256dh: 'k', auth: 'a' },
    });
    applyChanges(
      app.db,
      [
        change(
          'boards',
          'b',
          { ...common, name: 'B', emoji: null, color: 'blue', showCompleted: false },
          BEFORE,
        ),
        change('lists', 'l', { ...common, boardId: 'b', name: 'L' }, BEFORE),
      ],
      BEFORE,
    );
  });

  afterEach(() => app.close());

  const cardFields = (due: DateValue | null, extra: Record<string, unknown> = {}) => ({
    ...common,
    boardId: 'b',
    listId: 'l',
    title: 'Hand in report',
    description: '',
    start: null,
    due,
    priority: 'none',
    completed: false,
    completedAt: null,
    ...extra,
  });

  /** A device saving a card: `editedAt` is when it was edited, `arrivedAt` when it reached us. */
  const save = (
    fields: Record<string, unknown>,
    editedAt = BEFORE - 3_600_000,
    arrivedAt = editedAt,
  ) => applyChanges(app.db, [change('cards', 'c', fields, editedAt)], arrivedAt);

  const rows = () => pullChanges(app.db, 0, TRIGGER).rows.notifications ?? [];

  it('sends once when the trigger passes, with the card and a link to it', async () => {
    save(cardFields(DUE));
    expect(await sendDueNotifications(app, BEFORE)).toBe(0);
    expect(await sendDueNotifications(app, TRIGGER)).toBe(1);
    expect(sent).toEqual([
      {
        endpoint: 'https://push.example/phone',
        payload: {
          title: 'Hand in report',
          body: 'Due tomorrow at 18:00',
          url: '/board/b?card=c',
        },
      },
    ]);
    expect(rows()).toMatchObject([
      { cardId: 'c', dueKey: '2026-11-10T18:00', body: 'Due tomorrow at 18:00', readAt: null },
    ]);

    expect(await sendDueNotifications(app, TRIGGER + 60_000)).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('notifies a date-only card at 09:00 the day before', async () => {
    const dateOnly = { date: '2026-11-10', time: null };
    save(cardFields(dateOnly), zonedMs('2026-11-08', '12:00'));
    expect(await sendDueNotifications(app, zonedMs('2026-11-09', '08:59'))).toBe(0);
    expect(await sendDueNotifications(app, zonedMs('2026-11-09', '09:00'))).toBe(1);
    expect(sent[0]?.payload.body).toBe('Due tomorrow');
  });

  it('never sends for a date set after its trigger had passed', async () => {
    save(cardFields(DUE), TRIGGER + 60_000);
    expect(await sendDueNotifications(app, TRIGGER + 120_000)).toBe(0);
    expect(rows()).toEqual([]);
  });

  it('still sends for an edit made in time that only synced after the trigger', async () => {
    save(cardFields(DUE), BEFORE, TRIGGER + 3_600_000);
    expect(await sendDueNotifications(app, TRIGGER + 3_600_000)).toBe(1);
  });

  it('sends late after downtime with wording from the real day', async () => {
    save(cardFields(DUE));
    expect(await sendDueNotifications(app, zonedMs('2026-11-10', '08:00'))).toBe(1);
    expect(sent[0]?.payload.body).toBe('Due today at 18:00');
  });

  it('stays quiet once the card is already due', async () => {
    save(cardFields(DUE));
    expect(await sendDueNotifications(app, zonedMs('2026-11-10', '18:01'))).toBe(0);
  });

  it('skips completed, trashed, and trashed-list or board cards', async () => {
    const at = BEFORE + 1000; // After the board and list were made, or their deletes would lose.
    save(cardFields(DUE, { completed: true }), at);
    expect(await sendDueNotifications(app, TRIGGER)).toBe(0);

    applyChanges(app.db, [change('cards', 'c', { completed: false }, at + 1)], at + 1);
    applyChanges(app.db, [change('cards', 'c', { deletedAt: T }, at + 2)], at + 2);
    expect(await sendDueNotifications(app, TRIGGER)).toBe(0);

    applyChanges(app.db, [change('cards', 'c', { deletedAt: null }, at + 3)], at + 3);
    applyChanges(app.db, [change('lists', 'l', { deletedAt: T }, at + 4)], at + 4);
    expect(await sendDueNotifications(app, TRIGGER)).toBe(0);

    applyChanges(app.db, [change('lists', 'l', { deletedAt: null }, at + 5)], at + 5);
    applyChanges(app.db, [change('boards', 'b', { deletedAt: T }, at + 6)], at + 6);
    expect(await sendDueNotifications(app, TRIGGER)).toBe(0);
  });

  it('reschedules when the date changes, and at most once per date value', async () => {
    const later: DateValue = { date: '2026-11-20', time: '18:00' };
    save(cardFields(DUE));
    expect(await sendDueNotifications(app, TRIGGER)).toBe(1);

    applyChanges(app.db, [change('cards', 'c', { due: later }, TRIGGER + 1)], TRIGGER + 1);
    expect(await sendDueNotifications(app, TRIGGER + 2)).toBe(0);
    expect(await sendDueNotifications(app, zonedMs('2026-11-19', '18:00'))).toBe(1);

    // Back to the first value before it's due: it already went out, so nothing more.
    applyChanges(app.db, [change('cards', 'c', { due: DUE }, TRIGGER + 2)], TRIGGER + 2);
    expect(await sendDueNotifications(app, TRIGGER + 3)).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it('keeps the row when the push service fails', async () => {
    saveSubscription(app.db, { endpoint: 'bad', keys: { p256dh: 'k', auth: 'a' } });
    const failing = app.pushSender!;
    app.pushSender = async (sub, payload) => {
      if (sub.endpoint === 'bad') throw new Error('Push service down');
      return failing(sub, payload);
    };
    save(cardFields(DUE));
    expect(await sendDueNotifications(app, TRIGGER)).toBe(1);
    expect(sent).toHaveLength(1);
    expect(rows()).toHaveLength(1);
  });

  it('lets a device mark one read, but nothing else', async () => {
    save(cardFields(DUE));
    await sendDueNotifications(app, TRIGGER);
    const id = 'c:2026-11-10T18:00';
    applyChanges(
      app.db,
      [change('notifications', id, { readAt: T, title: 'Hacked' }, TRIGGER + 1)],
      TRIGGER + 1,
    );
    expect(rows()[0]).toMatchObject({ readAt: T, title: 'Hand in report' });
  });

  it('prunes after 30 days without ever notifying again', async () => {
    save(cardFields(DUE));
    await sendDueNotifications(app, TRIGGER);
    expect(pruneNotifications(app.db, TRIGGER + 29 * 86_400_000)).toBe(false);
    expect(pruneNotifications(app.db, TRIGGER + 31 * 86_400_000)).toBe(true);
    expect(rows()).toEqual([]);
    expect(await sendDueNotifications(app, TRIGGER + 60_000)).toBe(0);
  });
});
