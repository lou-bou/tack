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
];
