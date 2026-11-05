import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { boardRow, cardRow, isPhone, listRow, openBoard, seed, seedBoard } from './helpers';

const list = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('region', { name });

async function addCards(page: import('@playwright/test').Page, listName: string, titles: string[]) {
  await list(page, listName).getByRole('button', { name: 'Add card' }).click();
  const field = list(page, listName).getByRole('textbox', { name: 'Card title' });
  for (const title of titles) {
    await field.fill(title);
    await field.press('Enter');
    await expect(
      list(page, listName).getByRole('button', { name: title, exact: true }),
    ).toBeVisible();
  }
}

test('create a board with a colour, then manage it from the menu', async ({ page }) => {
  const name = `Made ${randomUUID().slice(0, 8)}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'New board' }).click();
  const sheet = page.getByRole('dialog', { name: 'New board' });
  await expect(sheet.getByRole('button', { name: 'Create board' })).toBeDisabled();
  await sheet.getByLabel('Name').fill(name);
  await sheet.getByRole('radio', { name: 'teal' }).check({ force: true });
  await sheet.getByRole('button', { name: 'Create board' }).click();

  await expect(page).toHaveURL(/\/board\//);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  // Rename from inside the board.
  await page.getByRole('button', { name: `Menu for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const renamed = `${name} two`;
  const rename = page.getByRole('dialog', { name: 'Rename board' });
  await rename.getByLabel('Name').fill(renamed);
  await rename.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();

  // Colour changes apply as soon as a swatch is chosen.
  await page.getByRole('button', { name: `Menu for ${renamed}` }).click();
  await page.getByRole('menuitem', { name: 'Change colour' }).click();
  const colour = page.getByRole('dialog', { name: 'Change colour' });
  await colour.getByRole('radio', { name: 'rose' }).click({ force: true });
  await expect(colour.getByRole('radio', { name: 'rose' })).toBeChecked();
  await colour.getByRole('button', { name: 'Close' }).click();

  // Delete, undo, then delete for good measure from the tile.
  await page.getByRole('button', { name: `Menu for ${renamed}` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Boards' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  const tile = page.getByRole('main').getByRole('listitem').filter({ hasText: renamed });
  await expect(tile).toBeVisible();
  await tile.getByRole('button', { name: `Menu for ${renamed}` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(tile).toHaveCount(0);
});

test('choose an emoji from the self-hosted picker', async ({ page, request }) => {
  const { boardId, name } = await seedBoard(request);
  await openBoard(page, boardId, name);
  await page.getByRole('button', { name: `Menu for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Change emoji' }).click();
  const emoji = page.locator('emoji-picker button[role="menuitem"]').first();
  await emoji.click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('h1:visible')).not.toHaveText(name);
  await expect(page.locator('h1:visible')).toContainText(name);
});

test('tiles count open and overdue cards, leaving out completed and trashed', async ({
  page,
  request,
}) => {
  const boardId = randomUUID();
  const listId = randomUUID();
  const name = `Counts ${boardId.slice(0, 8)}`;
  const late = { date: '2020-01-01', time: null };
  await seed(request, [
    boardRow(boardId, name),
    listRow(listId, boardId, 'L'),
    cardRow(randomUUID(), boardId, listId, 'open', {}),
    cardRow(randomUUID(), boardId, listId, 'late', { due: late }),
    cardRow(randomUUID(), boardId, listId, 'done', { due: late, completed: true }),
    cardRow(randomUUID(), boardId, listId, 'gone', { deletedAt: new Date().toISOString() }),
  ]);
  await page.goto('/');
  const tile = page.getByRole('main').getByRole('listitem').filter({ hasText: name });
  await expect(tile).toContainText('2 open');
  await expect(tile).toContainText('1 overdue');
});

test('composer adds with Enter, ignores empty titles and closes with Escape', async ({
  page,
  request,
}) => {
  const { boardId, name } = await seedBoard(request);
  await openBoard(page, boardId, name);
  await addCards(page, 'To do', ['First', 'Second']);

  const field = list(page, 'To do').getByRole('textbox', { name: 'Card title' });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('');
  await field.fill('   ');
  await field.press('Enter');
  await expect(list(page, 'To do').getByRole('listitem')).toHaveCount(2);
  await field.press('Escape');
  await expect(field).toBeHidden();

  // New cards go at the end, and survive a reload.
  await page.reload();
  const titles = list(page, 'To do').getByRole('listitem');
  await expect(titles.nth(0)).toContainText('First');
  await expect(titles.nth(1)).toContainText('Second');
});

test('tapping outside closes the composer', async ({ page, request }) => {
  const { boardId, name } = await seedBoard(request);
  await openBoard(page, boardId, name);
  await list(page, 'To do').getByRole('button', { name: 'Add card' }).click();
  const field = list(page, 'To do').getByRole('textbox', { name: 'Card title' });
  await expect(field).toBeVisible();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(field).toBeHidden();
});

test('ticking hides a card with Undo, and Show completed keeps it struck through', async ({
  page,
  request,
}) => {
  const { boardId, name } = await seedBoard(request);
  await openBoard(page, boardId, name);
  await addCards(page, 'To do', ['Tick me']);
  await list(page, 'To do').getByRole('textbox', { name: 'Card title' }).press('Escape');
  const column = list(page, 'To do');
  const tick = column.getByRole('checkbox', { name: 'Complete Tick me' });
  const count = column.locator('header span').last();

  await tick.click();
  await expect(tick).toBeHidden();
  await expect(count).toHaveText('0');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(tick).toBeVisible();
  await expect(tick).not.toBeChecked();

  await tick.click();
  await expect(tick).toBeHidden();
  const toggle = page.getByRole('button', { name: /Show completed/ });
  await toggle.click();
  await expect(tick).toBeChecked();
  await expect(count).toHaveText('1');
  await expect(column.getByRole('button', { name: 'Tick me' })).toHaveCSS(
    'text-decoration-line',
    'line-through',
  );

  // Saved on the board, and with it on, unticking raises no toast.
  await page.reload();
  await expect(tick).toBeChecked();
  await tick.click();
  await expect(tick).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
});

test('lists: add, rename inline, delete with Undo', async ({ page, request }) => {
  const { boardId, name } = await seedBoard(request);
  await openBoard(page, boardId, name);

  await page.getByRole('button', { name: 'Add list', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'List name' });
  await input.fill('Doing');
  await input.press('Enter');
  await expect(list(page, 'Doing')).toBeAttached();
  await input.press('Escape');

  await list(page, 'Doing').getByRole('button', { name: 'Doing', exact: true }).click();
  const rename = list(page, 'Doing').getByRole('textbox', { name: 'List name' });
  await rename.fill('Done');
  await rename.press('Enter');
  await expect(list(page, 'Done')).toBeAttached();

  await list(page, 'Done').getByRole('button', { name: 'Menu for Done' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(list(page, 'Done')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(list(page, 'Done')).toBeAttached();
});

test('the card face shows only what is set', async ({ page, request }) => {
  const boardId = randomUUID();
  const listId = randomUUID();
  const name = `Faces ${boardId.slice(0, 8)}`;
  await seed(request, [
    boardRow(boardId, name),
    listRow(listId, boardId, 'L'),
    cardRow(randomUUID(), boardId, listId, 'Plain', { position: 'a0' }),
    cardRow(randomUUID(), boardId, listId, 'Busy', {
      position: 'a1',
      priority: 'urgent',
      description: 'Notes',
      start: { date: '2019-12-30', time: null },
      due: { date: '2020-01-02', time: '14:30' },
    }),
  ]);
  await openBoard(page, boardId, name);
  const plain = page.getByRole('listitem').filter({ hasText: 'Plain' });
  const busy = page.getByRole('listitem').filter({ hasText: 'Busy' });
  await expect(plain.getByRole('img')).toHaveCount(0);
  await expect(plain).not.toContainText('Overdue');
  await expect(busy.getByRole('img', { name: 'Urgent priority' })).toBeVisible();
  await expect(busy.getByRole('img', { name: 'Has description' })).toBeVisible();
  await expect(busy).toContainText('30/12/2019 → 02/01/2020 14:30');
  await expect(busy).toContainText('Overdue');
});

test('edits reach another device live', async ({ page, browser, request }) => {
  const { boardId, name } = await seedBoard(request);
  const other = await (await browser.newContext()).newPage();
  await openBoard(page, boardId, name);
  await openBoard(other, boardId, name);
  await addCards(page, 'To do', ['Across devices']);
  await expect(other.getByRole('button', { name: 'Across devices' })).toBeVisible({
    timeout: 3000,
  });
  await other.context().close();
});

test('phone: one list at a time, with a strip that jumps and tracks', async ({ page, request }) => {
  test.skip(!isPhone(page), 'Phone layout only');
  const { boardId, name } = await seedBoard(request, ['One', 'Two', 'Three']);
  await openBoard(page, boardId, name);

  const first = await list(page, 'One').boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(first!.width / width).toBeGreaterThan(0.8);
  expect(first!.width / width).toBeLessThan(0.92);

  const strip = page.getByRole('navigation', { name: 'Lists' });
  await expect(strip.getByRole('button', { name: 'One' })).toHaveAttribute('aria-current', 'true');
  await strip.getByRole('button', { name: 'Three' }).click();
  await expect(list(page, 'Three')).toBeInViewport({ ratio: 0.9 });
  await expect(strip.getByRole('button', { name: 'Three' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('desktop: lists sit side by side at the design width and the strip is hidden', async ({
  page,
  request,
}) => {
  test.skip(isPhone(page), 'Desktop layout only');
  const { boardId, name } = await seedBoard(request, ['One', 'Two']);
  await openBoard(page, boardId, name);
  const one = await list(page, 'One').boundingBox();
  const two = await list(page, 'Two').boundingBox();
  expect(one!.width).toBe(272);
  expect(two!.x).toBeGreaterThan(one!.x + one!.width);
  expect(two!.y).toBe(one!.y);
  await expect(page.getByRole('navigation', { name: 'Lists' })).toBeHidden();
});
