export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'push subscriptions',
    sql: `
      CREATE TABLE push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        keys TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'synced tables',
    // No foreign keys: rows arrive from devices in any order, and a trashed card can outlive its list.
    sql: `
      CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
      INSERT INTO meta (key, value) VALUES ('seq', 1);

      CREATE TABLE tombstones (
        tableName TEXT NOT NULL,
        id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        PRIMARY KEY (tableName, id)
      );
      CREATE INDEX tombstones_seq ON tombstones (seq);

      CREATE TABLE boards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        emoji TEXT,
        color TEXT NOT NULL,
        showCompleted INTEGER NOT NULL,
        position TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT,
        clocks TEXT NOT NULL,
        seq INTEGER NOT NULL
      );
      CREATE INDEX boards_seq ON boards (seq);

      CREATE TABLE lists (
        id TEXT PRIMARY KEY,
        boardId TEXT NOT NULL,
        name TEXT NOT NULL,
        position TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT,
        clocks TEXT NOT NULL,
        seq INTEGER NOT NULL
      );
      CREATE INDEX lists_seq ON lists (seq);
      CREATE INDEX lists_board ON lists (boardId);

      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        boardId TEXT NOT NULL,
        listId TEXT NOT NULL,
        position TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        start TEXT,
        due TEXT,
        priority TEXT NOT NULL,
        completed INTEGER NOT NULL,
        completedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT,
        clocks TEXT NOT NULL,
        seq INTEGER NOT NULL
      );
      CREATE INDEX cards_seq ON cards (seq);
      CREATE INDEX cards_board ON cards (boardId);
      CREATE INDEX cards_list ON cards (listId);

      CREATE TABLE settings (
        id TEXT PRIMARY KEY,
        theme TEXT NOT NULL,
        density TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        clocks TEXT NOT NULL,
        seq INTEGER NOT NULL
      );
      CREATE INDEX settings_seq ON settings (seq);
      INSERT INTO settings (id, theme, density, updatedAt, clocks, seq)
      VALUES ('settings', 'system', 'compact', '2026-01-01T00:00:00.000Z', '{}', 1);

      CREATE TABLE notifications (
        id TEXT PRIMARY KEY,
        cardId TEXT NOT NULL,
        dueKey TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        readAt TEXT,
        clocks TEXT NOT NULL,
        seq INTEGER NOT NULL
      );
      CREATE INDEX notifications_seq ON notifications (seq);
    `,
  },
];
