import type { Clocks, FieldsOf, HlcClock, Row, TableName } from '@tack/shared';
import { outboxKey, type TackDb } from './db';

const HAS_UPDATED_AT: readonly TableName[] = ['boards', 'lists', 'cards', 'settings'];

/**
 * Every edit lands here. One transaction updates the row and queues the change, so an edit can't be
 * applied and then lost. The UI reads the tables and never waits on the network.
 */
export class Store {
  constructor(
    private readonly db: TackDb,
    private readonly clock: HlcClock,
    private readonly onWrite: () => void = () => {},
  ) {}

  async insert<T extends TableName>(table: T, id: string, fields: FieldsOf<T>): Promise<Clocks> {
    return this.write(table, id, fields as Record<string, unknown>);
  }

  async update<T extends TableName>(
    table: T,
    id: string,
    fields: Partial<FieldsOf<T>>,
  ): Promise<Clocks> {
    const stamped: Record<string, unknown> = { ...fields };
    if (HAS_UPDATED_AT.includes(table)) stamped.updatedAt = new Date().toISOString();
    return this.write(table, id, stamped);
  }

  /** Deletes forever. Anything queued for the row is replaced, since it no longer matters. */
  async purge(table: TableName, id: string): Promise<void> {
    await this.db.transaction('rw', this.db.rows(table), this.db.outbox, async () => {
      await this.db.rows(table).delete(id);
      await this.db.outbox.put({
        key: outboxKey(table, id),
        table,
        id,
        fields: {},
        clocks: {},
        purge: true,
      });
    });
    this.onWrite();
  }

  private async write(
    table: TableName,
    id: string,
    fields: Record<string, unknown>,
  ): Promise<Clocks> {
    const clock = this.clock.now();
    const clocks: Clocks = Object.fromEntries(Object.keys(fields).map((field) => [field, clock]));
    await this.db.transaction('rw', this.db.rows(table), this.db.outbox, async () => {
      const existing = await this.db.rows(table).get(id);
      const row: Row = {
        ...existing,
        ...fields,
        id,
        clocks: { ...existing?.clocks, ...clocks },
      };
      await this.db.rows(table).put(row);

      const key = outboxKey(table, id);
      const queued = await this.db.outbox.get(key);
      await this.db.outbox.put({
        key,
        table,
        id,
        fields: { ...queued?.fields, ...fields },
        clocks: { ...queued?.clocks, ...clocks },
      });
    });
    this.onWrite();
    return clocks;
  }
}
