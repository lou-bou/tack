import type { Change, Clocks, HlcClock, Row, TableName } from '@tack/shared';
import { outboxKey, type OutboxEntry, type SyncStatus, type TackDb } from './db';
import { OutdatedClientError, SessionExpiredError, type Transport } from './transport';

const PUSH_BATCH = 200;

/**
 * Sends the queue, then fetches what changed. The server is the only place conflicts get decided:
 * what comes back replaces the local row, except for fields this device still has queued. Once the
 * queue is empty, a device holds exactly what the server holds.
 */
export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    private readonly db: TackDb,
    private readonly clock: HlcClock,
    private readonly transport: Transport,
  ) {}

  /** One run at a time. A request during a run causes exactly one more afterwards. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<void> {
    do {
      this.again = false;
      try {
        await this.pushAll();
        await this.pull();
        await this.setStatus('online');
      } catch (err) {
        if (err instanceof SessionExpiredError) await this.setStatus('expired');
        else if (err instanceof OutdatedClientError) await this.setStatus('outdated');
        else await this.setStatus('offline');
        this.again = false;
      }
    } while (this.again);
  }

  private async pushAll(): Promise<void> {
    for (;;) {
      const batch = await this.db.outbox.limit(PUSH_BATCH).toArray();
      if (batch.length === 0) return;
      const changes: Change[] = batch.map(({ key: _key, ...change }) => change);
      const response = await this.transport.push(changes);
      this.clock.syncWall(response.serverTime);
      await this.db.transaction('rw', this.db.tables, async () => {
        for (const entry of batch) await this.acknowledge(entry);
        for (const { table, id, row } of response.rejected) {
          await this.db.outbox.delete(outboxKey(table, id));
          await this.applyServerRow(table, id, row);
        }
      });
    }
  }

  /** Clears what the server received, keeping anything edited again while the request ran. */
  private async acknowledge(sent: OutboxEntry): Promise<void> {
    const current = await this.db.outbox.get(sent.key);
    if (!current) return;
    if (sent.purge) {
      await this.db.outbox.delete(sent.key);
      return;
    }
    const fields = { ...current.fields };
    const clocks = { ...current.clocks };
    for (const [field, clock] of Object.entries(sent.clocks)) {
      if (clocks[field] === clock) {
        delete fields[field];
        delete clocks[field];
      }
    }
    if (Object.keys(clocks).length === 0) await this.db.outbox.delete(sent.key);
    else await this.db.outbox.put({ ...current, fields, clocks });
  }

  private async pull(): Promise<void> {
    const since = await this.db.meta.get('seq');
    const response = await this.transport.pull((since?.value as number | undefined) ?? 0);
    this.clock.syncWall(response.serverTime);
    await this.db.transaction('rw', this.db.tables, async () => {
      for (const [table, rows] of Object.entries(response.rows)) {
        for (const row of rows) {
          for (const clock of Object.values(row.clocks)) this.clock.observe(clock);
          await this.applyServerRow(table as TableName, row.id, row);
        }
      }
      for (const { table, id } of response.tombstones) {
        await this.db.outbox.delete(outboxKey(table, id));
        await this.db.rows(table).delete(id);
      }
      await this.db.meta.put({ key: 'seq', value: response.seq });
    });
  }

  private async applyServerRow(table: TableName, id: string, row: Row | null): Promise<void> {
    const queued = await this.db.outbox.get(outboxKey(table, id));
    if (queued?.purge) return;
    if (!row) {
      if (queued) await this.db.outbox.delete(outboxKey(table, id));
      await this.db.rows(table).delete(id);
      return;
    }
    const clocks: Clocks = { ...row.clocks, ...queued?.clocks };
    await this.db.rows(table).put({ ...row, ...queued?.fields, clocks });
  }

  private async setStatus(value: SyncStatus): Promise<void> {
    const current = await this.db.meta.get('status');
    if (current?.value !== value) await this.db.meta.put({ key: 'status', value });
  }
}
