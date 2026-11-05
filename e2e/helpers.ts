import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

type Fields = Record<string, unknown>;

/** Writes rows straight to the server, for tests about showing data rather than creating it. */
export async function seed(
  request: APIRequestContext,
  changes: [string, string, Fields][],
  editedAt = Date.now(),
) {
  const clock = `${String(editedAt).padStart(13, '0')}:0000:seed`;
  const response = await request.post('/api/sync/push', {
    data: {
      protocol: 1,
      changes: changes.map(([table, id, fields]) => ({
        table,
        id,
        fields,
        clocks: Object.fromEntries(Object.keys(fields).map((key) => [key, clock])),
      })),
    },
  });
  expect(response.ok()).toBe(true);
}

const stamps = () => {
  const now = new Date().toISOString();
  return { createdAt: now, updatedAt: now, deletedAt: null };
};

export const boardRow = (
  id: string,
  name: string,
  extra: Fields = {},
): [string, string, Fields] => [
  'boards',
  id,
  {
    name,
    emoji: null,
    color: 'neutral',
    showCompleted: false,
    position: 'a0',
    ...stamps(),
    ...extra,
  },
];

export const listRow = (
  id: string,
  boardId: string,
  name: string,
  position = 'a0',
): [string, string, Fields] => ['lists', id, { boardId, name, position, ...stamps() }];

export const cardRow = (
  id: string,
  boardId: string,
  listId: string,
  title: string,
  extra: Fields = {},
): [string, string, Fields] => [
  'cards',
  id,
  {
    boardId,
    listId,
    title,
    position: 'a0',
    description: '',
    start: null,
    due: null,
    priority: 'none',
    completed: false,
    completedAt: null,
    ...stamps(),
    ...extra,
  },
];

/** A board with named lists, ready to open. */
export async function seedBoard(request: APIRequestContext, listNames: string[] = ['To do']) {
  const boardId = randomUUID();
  const name = `Board ${boardId.slice(0, 8)}`;
  const lists = listNames.map((listName, index) => ({ id: randomUUID(), name: listName, index }));
  await seed(request, [
    boardRow(boardId, name),
    ...lists.map((l) => listRow(l.id, boardId, l.name, `a${l.index}`)),
  ]);
  return { boardId, name, lists };
}

export async function openBoard(page: Page, boardId: string, name: string) {
  await page.goto(`/board/${boardId}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 900;

/** A date in the app's time zone, `offset` days from today, as the app itself would compute it. */
export function dayOffset(offset: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}
