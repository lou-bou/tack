import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { boardRow, cardRow, dayOffset, isPhone, listRow, seed } from './helpers';

const d = (offset: number, time: string | null = null) => ({ date: dayOffset(offset), time });

async function seedBoards(request: Parameters<typeof seed>[0]) {
  const tag = randomUUID().slice(0, 6);
  const [b1, b2, l1, l2] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const names = { first: `Tod1 ${tag}`, second: `Tod2 ${tag}` };
  await seed(request, [
    boardRow(b1, names.first, { position: 'a1', emoji: '📘' }),
    boardRow(b2, names.second, { position: 'a2' }),
    listRow(l1, b1, 'Inbox'),
    listRow(l2, b2, 'Later'),
    cardRow(randomUUID(), b1, l1, 'date only urgent', {
      due: d(0),
      priority: 'urgent',
      position: 'a0',
    }),
    cardRow(randomUUID(), b1, l1, 'date only none', { due: d(0), position: 'a1' }),
    cardRow(randomUUID(), b1, l1, 'timed', { due: d(0, '23:59'), position: 'a2' }),
    cardRow(randomUUID(), b1, l1, 'overdue', { due: d(-3), position: 'a3' }),
    cardRow(randomUUID(), b2, l2, 'in progress', { start: d(-1), due: d(2), position: 'a0' }),
    cardRow(randomUUID(), b2, l2, 'not yet', { start: d(1), due: d(2), position: 'a1' }),
    cardRow(randomUUID(), b2, l2, 'future', { due: d(3), position: 'a2' }),
    cardRow(randomUUID(), b2, l2, 'done', { due: d(0), completed: true, position: 'a3' }),
    cardRow(randomUUID(), b2, l2, 'start only', { start: d(-1), position: 'a4' }),
  ]);
  return names;
}

const group = (page: Page, name: string) => page.getByRole('region', { name });
const titles = (page: Page, name: string) =>
  group(page, name).locator('li[data-card-id] button:not([role])').allInnerTexts();

test('groups by board in order, and sorts overdue, timed, then by priority', async ({
  page,
  request,
}) => {
  const { first, second } = await seedBoards(request);
  await page.goto('/today');
  await expect
    .poll(() => titles(page, first))
    .toEqual(['overdue', 'timed', 'date only urgent', 'date only none']);
  await expect.poll(() => titles(page, second)).toEqual(['in progress']);
  await expect(group(page, first)).toContainText('Inbox'); // The list name on each row.

  const sections = await page
    .getByRole('main')
    .getByRole('region')
    .evaluateAll((all) => all.map((s) => s.getAttribute('aria-label')));
  expect(sections.indexOf(first)).toBeLessThan(sections.indexOf(second));
});

test('ticking completes in place with Undo, then collapses out', async ({ page, request }) => {
  const { first } = await seedBoards(request);
  await page.goto('/today');
  const tick = group(page, first).getByRole('checkbox', { name: 'Complete overdue' });
  const title = group(page, first).getByRole('button', { name: 'overdue', exact: true });

  await tick.click();
  await expect(tick).toBeChecked();
  await expect(title).toHaveCSS('text-decoration-line', 'line-through');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(tick).not.toBeChecked();
  await expect(title).toBeVisible();

  await tick.click();
  await expect(title).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(title).toBeVisible();
  await expect(title).toHaveCount(0, { timeout: 4000 });
});

test('tapping a row opens the card panel over Today', async ({ page, request }) => {
  const { first } = await seedBoards(request);
  await page.goto('/today');
  await group(page, first).getByRole('button', { name: 'timed', exact: true }).click();
  await expect(page).toHaveURL(/\/today\?card=/);
  await expect(
    page.getByRole('complementary', { name: 'Card' }).getByRole('textbox', { name: 'Card title' }),
  ).toHaveValue('timed');
});

test('the badge counts overdue and due today, leaving out in progress', async ({ page }) => {
  // Alone, so the count is exact.
  await page.route('**/api/sync/pull**', async (route) => {
    const today = dayOffset(0);
    const row = (id: string, fields: Record<string, unknown>) => ({
      id,
      clocks: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      ...fields,
    });
    const card = (id: string, fields: Record<string, unknown>) =>
      row(id, {
        boardId: 'b',
        listId: 'l',
        position: id,
        title: id,
        description: '',
        start: null,
        due: null,
        priority: 'none',
        completed: false,
        completedAt: null,
        ...fields,
      });
    await route.fulfill({
      json: {
        seq: 1,
        serverTime: Date.now(),
        tombstones: [],
        rows: {
          boards: [
            row('b', {
              name: 'B',
              emoji: null,
              color: 'neutral',
              showCompleted: false,
              position: 'a',
            }),
          ],
          lists: [row('l', { boardId: 'b', name: 'L', position: 'a' })],
          cards: [
            card('due', { due: { date: today, time: null } }),
            card('late', { due: { date: '2020-01-01', time: null } }),
            card('progress', {
              start: { date: '2020-01-01', time: null },
              due: { date: '2099-01-01', time: null },
            }),
          ],
        },
      },
    });
  });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
  await expect(nav.getByRole('link', { name: 'Today' })).toHaveText(/2/);
});

test('says so when nothing is due', async ({ page }) => {
  await page.route('**/api/sync/**', (route) => route.abort());
  await page.goto('/today');
  await expect(page.getByText('Nothing due today.')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
  await expect(nav.getByRole('link', { name: 'Today' })).not.toContainText(/\d/);
  if (isPhone(page)) await expect(nav.getByRole('link', { name: 'Boards' })).toBeVisible();
});
