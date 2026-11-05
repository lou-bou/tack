import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { boardRow, cardRow, listRow, seed } from './helpers';

const ts = () => new Date().toISOString();
const row = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Trash' })
    .getByRole('listitem')
    .filter({ has: page.getByText(name, { exact: true }) });

async function setup(request: Parameters<typeof seed>[0]) {
  const boardId = randomUUID();
  const tag = boardId.slice(0, 6);
  const listA = randomUUID();
  const listB = randomUUID();
  return { boardId, tag, listA, listB, name: `Tr ${tag}`, request };
}

const heading = (page: Page) => page.getByRole('region', { name: 'Trash' });

test('a card comes back to its own list', async ({ page, request }) => {
  const s = await setup(request);
  const title = `card ${s.tag}`;
  await seed(request, [
    boardRow(s.boardId, s.name),
    listRow(s.listA, s.boardId, 'A'),
    cardRow(randomUUID(), s.boardId, s.listA, title, { deletedAt: ts() }),
  ]);
  await page.goto('/settings');
  await expect(row(page, title)).toContainText(`from ${s.name} / A`);
  await expect(row(page, title)).toContainText('30 days left');
  await row(page, title).getByRole('button', { name: 'Restore' }).click();
  await expect(row(page, title)).toHaveCount(0);
  await page.goto(`/board/${s.boardId}`);
  await expect(page.getByRole('region', { name: 'A' }).getByText(title)).toBeVisible();
});

test('a card whose list is in Trash goes to the first live list', async ({ page, request }) => {
  const s = await setup(request);
  const title = `card ${s.tag}`;
  await seed(request, [
    boardRow(s.boardId, s.name),
    listRow(s.listA, s.boardId, 'Second', 'a1'),
    listRow(randomUUID(), s.boardId, 'First', 'a0'),
    [
      'lists',
      s.listB,
      {
        boardId: s.boardId,
        name: 'Binned',
        position: 'Zz',
        createdAt: ts(),
        updatedAt: ts(),
        deletedAt: ts(),
      },
    ],
    cardRow(randomUUID(), s.boardId, s.listB, title, { deletedAt: ts() }),
  ]);
  await page.goto('/settings');
  await row(page, title).getByRole('button', { name: 'Restore' }).click();
  await expect(row(page, title)).toHaveCount(0);
  await page.goto(`/board/${s.boardId}`);
  await expect(page.getByRole('region', { name: 'First' }).getByText(title)).toBeVisible();
});

test('a card in a board with no lists gets a new one called Restored', async ({
  page,
  request,
}) => {
  const s = await setup(request);
  const title = `card ${s.tag}`;
  await seed(request, [
    boardRow(s.boardId, s.name),
    cardRow(randomUUID(), s.boardId, randomUUID(), title, { deletedAt: ts() }),
  ]);
  await page.goto('/settings');
  await expect(row(page, title)).toContainText(`from ${s.name}`);
  await row(page, title).getByRole('button', { name: 'Restore' }).click();
  await expect(row(page, title)).toHaveCount(0);
  await page.goto(`/board/${s.boardId}`);
  await expect(page.getByRole('region', { name: 'Restored' }).getByText(title)).toBeVisible();
});

test('a list brings back exactly the cards it had', async ({ page, request }) => {
  const s = await setup(request);
  const list = `list ${s.tag}`;
  const alone = `alone ${s.tag}`;
  await seed(request, [
    boardRow(s.boardId, s.name),
    [
      'lists',
      s.listA,
      {
        boardId: s.boardId,
        name: list,
        position: 'a0',
        createdAt: ts(),
        updatedAt: ts(),
        deletedAt: ts(),
      },
    ],
    cardRow(randomUUID(), s.boardId, s.listA, 'with it', {}),
    cardRow(randomUUID(), s.boardId, s.listA, alone, { deletedAt: ts() }),
  ]);
  await page.goto('/settings');
  await expect(row(page, list)).toContainText('List, 1 card');
  await row(page, list).getByRole('button', { name: 'Restore' }).click();
  await expect(row(page, list)).toHaveCount(0);
  await expect(row(page, alone)).toBeVisible(); // Trashed on its own, so it stays.
  await page.goto(`/board/${s.boardId}`);
  const column = page.getByRole('region', { name: list });
  await expect(column.getByText('with it')).toBeVisible();
  await expect(column.getByText(alone)).toHaveCount(0);
});

test('items in a trashed board wait for it, then restoring the board frees them', async ({
  page,
  request,
}) => {
  const s = await setup(request);
  const title = `card ${s.tag}`;
  await seed(request, [
    boardRow(s.boardId, s.name, { deletedAt: ts() }),
    listRow(s.listA, s.boardId, 'A'),
    cardRow(randomUUID(), s.boardId, s.listA, title, { deletedAt: ts() }),
  ]);
  await page.goto('/settings');
  await expect(row(page, title)).toContainText('Restore the board first');
  await expect(row(page, title).getByRole('button', { name: 'Restore' })).toHaveCount(0);
  const boardRowItem = heading(page)
    .getByRole('listitem')
    .filter({ hasText: 'Board,' })
    .filter({ hasText: s.name });
  await boardRowItem.getByRole('button', { name: 'Restore' }).click();
  await expect(row(page, title).getByRole('button', { name: 'Restore' })).toBeVisible();
});

test('Delete forever asks first, then syncs away from other devices', async ({
  page,
  request,
  browser,
}) => {
  const s = await setup(request);
  const title = `card ${s.tag}`;
  await seed(request, [
    boardRow(s.boardId, s.name),
    listRow(s.listA, s.boardId, 'A'),
    cardRow(randomUUID(), s.boardId, s.listA, title, { deletedAt: ts() }),
  ]);
  const other = await (await browser.newContext()).newPage();
  await other.goto('/settings');
  await expect(row(other, title)).toBeVisible();

  await page.goto('/settings');
  await row(page, title).getByRole('button', { name: 'Delete forever' }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete forever?' });
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(row(page, title)).toBeVisible();

  await row(page, title).getByRole('button', { name: 'Delete forever' }).click();
  await sheet.getByRole('button', { name: 'Delete forever' }).click();
  await expect(row(page, title)).toHaveCount(0);
  await expect(row(other, title)).toHaveCount(0, { timeout: 3000 });
  await other.context().close();
});

test('deleting through the app lands in Trash, and Empty trash clears it', async ({
  page,
  request,
}) => {
  test.slow();
  const s = await setup(request);
  await seed(request, [boardRow(s.boardId, s.name), listRow(s.listA, s.boardId, 'A')]);
  await page.goto(`/board/${s.boardId}`);
  await page.getByRole('button', { name: `Menu for ${s.name}` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Boards' })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Main' })
    .filter({ visible: true })
    .getByRole('link', { name: 'Settings' })
    .or(page.getByRole('complementary').getByRole('link', { name: 'Settings' }))
    .first()
    .click();
  await expect(row(page, s.name)).toContainText('Board, 0 cards');
  // Other tests share this server, so emptying stays on this device. Delete forever covers sync.
  await page.route('**/api/sync/**', (route) => route.abort());
  await page.getByRole('button', { name: 'Empty trash' }).click();
  await page
    .getByRole('dialog', { name: 'Empty trash?' })
    .getByRole('button', { name: 'Empty trash' })
    .click();
  await expect(heading(page).getByText('Trash is empty.')).toBeVisible();
  await page.reload();
  await expect(heading(page).getByText('Trash is empty.')).toBeVisible();
});
