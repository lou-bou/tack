// TEMPORARY: goes with web/src/lib/trace.ts.
import { expect, test, type Page } from '@playwright/test';
import { cardRow, openBoard, seed, seedBoard } from './helpers';
import { randomUUID } from 'node:crypto';

async function turnOn(page: Page) {
  await page.goto('/settings');
  const version = page.getByRole('button', { name: /^Tack \d/ });
  for (let i = 0; i < 5; i += 1) await version.click();
  await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeVisible();
}

const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

test('stays hidden and records nothing until the version is tapped five times', async ({
  page,
}) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Diagnostics' })).toHaveCount(0);
  const version = page.getByRole('button', { name: /^Tack \d/ });
  for (let i = 0; i < 4; i += 1) await version.click();
  await expect(page.getByRole('heading', { name: 'Diagnostics' })).toHaveCount(0);
  expect(await stored(page, 'tack.trace.enabled')).toBeNull();
  await version.click();
  await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeVisible();
});

test('records a card opening, with the time to screen, and survives a reload', async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { boardId, name, lists } = await seedBoard(request);
  await seed(request, [cardRow(randomUUID(), boardId, lists[0]!.id, 'Trace me', {})]);
  await turnOn(page);
  await openBoard(page, boardId, name);
  await page.getByRole('button', { name: 'Trace me', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Card' });
  await expect(panel).toBeVisible();
  await page.waitForTimeout(1300);
  await panel.getByRole('button', { name: 'Close card' }).click();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Copy report' }).click();
  await expect(page.getByText('Report copied')).toBeVisible();
  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain('switches on: none');
  expect(report).toContain('panel added');
  expect(report).toContain('panel frame done');
  expect(report).toMatch(/to screen click \d+ms/);
  expect(report).not.toContain('Trace me'); // No card text.
});

test('switches change the panel', async ({ page, request }) => {
  const { boardId, name, lists } = await seedBoard(request);
  await seed(request, [
    cardRow(randomUUID(), boardId, lists[0]!.id, 'Switch me', { description: 'Notes' }),
  ]);
  await turnOn(page);
  for (const label of [
    "Panel doesn't slide in",
    "Opening a card doesn't move focus",
    'Panel has no description editor',
  ]) {
    await page.getByRole('checkbox', { name: label }).check();
  }
  await page.reload();
  await expect(page.getByRole('checkbox', { name: "Panel doesn't slide in" })).toBeChecked();
  await openBoard(page, boardId, name);
  await page.getByRole('button', { name: 'Switch me', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Card' });
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((el) => el.getAnimations().length)).toBe(0);
  await expect(panel).not.toBeFocused();
  await page.waitForTimeout(300);
  await expect(panel.getByRole('textbox', { name: 'Description' })).toHaveCount(0);
});

test('Turn off removes everything it stored', async ({ page }) => {
  await turnOn(page);
  await page.waitForTimeout(1200);
  expect(await stored(page, 'tack.trace.log')).not.toBeNull();
  await page.getByRole('button', { name: 'Turn off' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Diagnostics' })).toHaveCount(0);
  await page.waitForTimeout(1200);
  for (const key of ['tack.trace.enabled', 'tack.trace.switches', 'tack.trace.log']) {
    expect(await stored(page, key)).toBeNull();
  }
});
