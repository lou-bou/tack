import { devices, expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { boardRow, cardRow, dayOffset, isPhone, listRow, seed } from './helpers';

const bell = (page: Page) =>
  page.getByRole('button', { name: /^Notifications/ }).filter({ visible: true });

/**
 * A card whose notification is due right now: edited long ago, due later today. The real
 * scheduler picks it up, so this runs the whole path from server to bell.
 */
async function seedDueSoon(request: Parameters<typeof seed>[0]) {
  const [boardId, listId, cardId] = [randomUUID(), randomUUID(), randomUUID()];
  const title = `Report ${boardId.slice(0, 6)}`;
  await seed(
    request,
    [
      boardRow(boardId, `Note ${boardId.slice(0, 6)}`),
      listRow(listId, boardId, 'L'),
      cardRow(cardId, boardId, listId, title, { due: { date: dayOffset(0), time: '23:59' } }),
    ],
    Date.now() - 3 * 86_400_000,
  );
  return { boardId, cardId, title };
}

test('a card coming due reaches the bell; opening the list marks it read', async ({
  page,
  request,
}) => {
  const { title } = await seedDueSoon(request);
  await page.goto('/');
  await expect(bell(page)).toHaveAccessibleName(/unread/, { timeout: 5000 });

  await bell(page).click();
  const sheet = page.getByRole('dialog', { name: 'Notifications' });
  const row = sheet.getByRole('button').filter({ hasText: title });
  await expect(row).toContainText(/Due today at 23:59/);

  await row.click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('complementary', { name: 'Card' }).getByRole('textbox', { name: 'Card title' }),
  ).toHaveValue(title);
});

test('reading on one device clears it on another', async ({ page, request, browser }) => {
  await seedDueSoon(request);
  const other = await (await browser.newContext()).newPage();
  await page.goto('/');
  await other.goto('/');
  await expect(bell(other)).toHaveAccessibleName(/unread/, { timeout: 5000 });
  // Other tests may add more at any moment, so wait for them all to be read at once here.
  await expect(async () => {
    await bell(page).click();
    await page
      .getByRole('dialog', { name: 'Notifications' })
      .getByRole('button', { name: 'Close' })
      .click();
    await expect(bell(other)).toHaveAccessibleName('Notifications', { timeout: 1500 });
  }).toPass({ timeout: 12000 });
  await other.context().close();
});

test('settings offers enabling only on touch devices, and the test button reports back', async ({
  page,
}) => {
  await page.route('**/api/push/test', (route) => route.fulfill({ json: { sent: 2 } }));
  await page.goto('/settings');
  const enable = page.getByText('Enable notifications on this phone');
  if (isPhone(page)) await expect(enable).toBeVisible();
  else await expect(enable).toHaveCount(0);
  await page.getByRole('button', { name: 'Send test' }).click();
  await expect(page.getByText('Sent to 2 devices.')).toBeVisible();
});

test('the test button says when the server has no keys', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Send test' }).click();
  await expect(page.getByText("The server doesn't have its push keys set.")).toBeVisible();
});

test('iPhone in a browser tab is told to install first', async ({ browser }) => {
  const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 14'];
  const context = await browser.newContext(iphone);
  const page = await context.newPage();
  await page.goto('/settings');
  await expect(page.getByText(/add Tack to your Home Screen first/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable' })).toHaveCount(0);
  await context.close();
});

test('nothing overflows a narrow phone, offline with a full top bar', async ({ browser }) => {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 320, height: 640 },
  });
  const page = await context.newPage();
  await page.route('**/api/sync/**', (route) => route.abort());
  for (const path of ['/', '/today', '/calendar', '/settings']) {
    await page.goto(path);
    await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeAttached({
      timeout: 5000,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const title = page.locator('h1:visible');
    expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await context.close();
});
