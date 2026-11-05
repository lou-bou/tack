import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { openBoard, seedBoard } from './helpers';

/** Waits until the service worker controls the page, so it can reload with no connection. */
async function ready(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

async function goOffline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('status').filter({ hasText: 'Offline · changes will sync' }),
  ).toBeVisible({
    timeout: 20_000,
  });
}

const column = (page: Page, name: string) => page.getByRole('region', { name });
const marker = (page: Page, title: string) =>
  page
    .locator('li[data-card-id]')
    .filter({ hasText: title })
    .getByRole('img', { name: 'Saved on this device' });

test('edit offline, reload, reconnect, and another device catches up', async ({
  page,
  context,
  browser,
  request,
}) => {
  test.slow();
  const { boardId, name } = await seedBoard(request);
  const other = await (await browser.newContext()).newPage();
  await openBoard(other, boardId, name);

  await openBoard(page, boardId, name);
  await ready(page);
  await goOffline(context, page);

  await column(page, 'To do').getByRole('button', { name: 'Add card' }).click();
  const field = column(page, 'To do').getByRole('textbox', { name: 'Card title' });
  await field.fill('Written offline');
  await field.press('Enter');
  await field.press('Escape');
  await expect(marker(page, 'Written offline')).toBeVisible();

  await page.reload();
  await expect(column(page, 'To do').getByText('Written offline')).toBeVisible();
  await expect(marker(page, 'Written offline')).toBeVisible();

  // The lazy-loaded editor and its edits work offline too.
  await column(page, 'To do').getByRole('button', { name: 'Written offline', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Card' });
  const editor = panel.getByRole('textbox', { name: 'Description' });
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type('Notes from the train');
  await panel.getByRole('radio', { name: 'High' }).click();
  await panel.getByRole('button', { name: 'Close card' }).click();
  await expect(other.getByText('Written offline')).toHaveCount(0);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(marker(page, 'Written offline')).toHaveCount(0);

  const arrived = other.locator('li[data-card-id]').filter({ hasText: 'Written offline' });
  await expect(arrived).toBeVisible({ timeout: 5000 });
  await expect(arrived.getByRole('img', { name: 'High priority' })).toBeVisible();
  await expect(arrived.getByRole('img', { name: 'Has description' })).toBeVisible();
  await other.context().close();
});

test('the emoji picker works offline', async ({ page, context, request }) => {
  test.slow();
  const { boardId, name } = await seedBoard(request);
  await openBoard(page, boardId, name);
  await ready(page);
  await goOffline(context, page);
  await page.reload();
  await page.getByRole('button', { name: `Menu for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Change emoji' }).click();
  await page.locator('emoji-picker button[role="menuitem"]').first().click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('h1:visible')).not.toHaveText(name);
});

test('every screen opens with no connection', async ({ page, context, request }) => {
  test.slow();
  await seedBoard(request);
  await page.goto('/');
  await ready(page);
  await goOffline(context, page);
  for (const [path, title] of [
    ['/', 'Boards'],
    ['/today', 'Today'],
    ['/calendar', 'Calendar'],
    ['/settings', 'Settings'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  }
  const fontLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('14px "Geist Variable"');
  });
  expect(fontLoaded).toBe(true);
});

test('an expired Access session holds the queue, says so, and recovers', async ({
  page,
  request,
}) => {
  test.slow();
  const { boardId, name } = await seedBoard(request);
  await openBoard(page, boardId, name);
  await ready(page);

  await page.route('**/api/sync/**', (route) =>
    route.fulfill({
      status: 302,
      headers: { location: 'https://team.cloudflareaccess.com/login' },
    }),
  );
  await column(page, 'To do').getByRole('button', { name: 'Add card' }).click();
  const field = column(page, 'To do').getByRole('textbox', { name: 'Card title' });
  await field.fill('While expired');
  await field.press('Enter');
  await field.press('Escape');

  const signIn = page
    .getByRole('link', { name: 'Session expired · Sign in' })
    .filter({ visible: true });
  await expect(signIn).toHaveAttribute('href', '/api/auth/refresh', { timeout: 20_000 });
  await expect(marker(page, 'While expired')).toBeVisible();

  await page.unroute('**/api/sync/**');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(signIn).toHaveCount(0, { timeout: 20_000 });
  await expect(marker(page, 'While expired')).toHaveCount(0);
  await page.reload();
  await expect(column(page, 'To do').getByText('While expired')).toBeVisible();
});

test('a client too old for the server holds its queue and offers a reload', async ({
  page,
  request,
}) => {
  test.slow();
  const { boardId, name } = await seedBoard(request);
  await openBoard(page, boardId, name);
  await page.route('**/api/sync/**', (route) =>
    route.fulfill({ status: 426, json: { error: 'Update required' } }),
  );
  await column(page, 'To do').getByRole('button', { name: 'Add card' }).click();
  const field = column(page, 'To do').getByRole('textbox', { name: 'Card title' });
  await field.fill('Kept for later');
  await field.press('Enter');
  await field.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Update needed · Reload' }).filter({ visible: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(marker(page, 'Kept for later')).toBeVisible();
});
