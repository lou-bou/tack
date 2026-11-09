import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { boardRow, cardRow, dayOffset, isPhone, listRow, openBoard, seed } from './helpers';

async function seedPlanBoard(
  request: Parameters<typeof seed>[0],
  cards: { title: string; list?: 'a' | 'b'; [key: string]: unknown }[],
) {
  const [boardId, listA, listB] = [randomUUID(), randomUUID(), randomUUID()];
  const name = `Plan ${boardId.slice(0, 6)}`;
  await seed(request, [
    boardRow(boardId, name),
    listRow(listA, boardId, 'Inbox', 'a0'),
    listRow(listB, boardId, 'Later', 'a1'),
    ...cards.map(({ title, list = 'a', ...extra }, i) =>
      cardRow(randomUUID(), boardId, list === 'a' ? listA : listB, title, {
        position: `a${i}`,
        ...extra,
      }),
    ),
  ]);
  return { boardId, name };
}

const bar = (page: Page) => page.getByRole('region', { name: 'Selected cards' });
const selectButton = (page: Page) =>
  page
    .getByRole('button', { name: /^Select/ })
    .filter({ visible: true })
    .first();
const todayGroup = (page: Page, name: string) => page.getByRole('region', { name });
const todayTitles = (page: Page, name: string) =>
  todayGroup(page, name).locator('li[data-card-id] button:not([role])').allInnerTexts();

test('select several cards across lists and plan them for today at once', async ({
  page,
  request,
}) => {
  const { boardId, name } = await seedPlanBoard(request, [
    { title: 'Write intro' },
    { title: 'Not this one' },
    { title: 'Call the bank', list: 'b' },
  ]);
  await openBoard(page, boardId, name);
  await selectButton(page).click();
  await expect(bar(page)).toContainText('Tap cards to select them');
  await expect(bar(page).getByRole('button', { name: 'Plan for today' })).toBeDisabled();

  // Tapping a card picks it instead of opening it.
  await page.getByRole('button', { name: 'Write intro', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select Call the bank' }).click();
  await expect(page.getByRole('complementary', { name: 'Card' })).toHaveCount(0);
  await expect(bar(page)).toContainText('2 selected');
  await bar(page).getByRole('button', { name: 'Plan for today' }).click();

  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByText('2 cards planned for today')).toBeVisible();
  const sun = (title: string) =>
    page
      .locator('li[data-card-id]')
      .filter({ hasText: title })
      .getByRole('img', { name: 'Planned for today' });
  await expect(sun('Write intro')).toBeVisible();
  await expect(sun('Call the bank')).toBeAttached();
  await expect(sun('Not this one')).toHaveCount(0);

  await page.goto('/today');
  await expect.poll(() => todayTitles(page, name)).toEqual(['Write intro', 'Call the bank']);
});

test('Undo takes a plan back, and Cancel or Escape changes nothing', async ({ page, request }) => {
  const { boardId, name } = await seedPlanBoard(request, [{ title: 'Maybe' }]);
  await openBoard(page, boardId, name);
  const sun = page.locator('li[data-card-id]').getByRole('img', { name: 'Planned for today' });

  await selectButton(page).click();
  await page.getByRole('checkbox', { name: 'Select Maybe' }).click();
  await bar(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(bar(page)).toHaveCount(0);
  await expect(sun).toHaveCount(0);

  await selectButton(page).click();
  await page.getByRole('checkbox', { name: 'Select Maybe' }).click();
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);

  await selectButton(page).click();
  await page.getByRole('checkbox', { name: 'Select Maybe' }).click();
  await bar(page).getByRole('button', { name: 'Plan for today' }).click();
  await expect(sun).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(sun).toHaveCount(0);
});

test('cards can be dragged again once selecting ends', async ({ page, request }) => {
  test.skip(isPhone(page), 'Mouse drag');
  const { boardId, name } = await seedPlanBoard(request, [
    { title: 'Drag me' },
    { title: 'Other' },
  ]);
  await openBoard(page, boardId, name);
  const card = page.locator('li[data-card-id]').filter({ hasText: 'Drag me' });
  const box = (await card.boundingBox())!;

  await selectButton(page).click();
  await page.mouse.move(box.x + 40, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 10, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await card.boundingBox())!.x).toBeCloseTo(box.x, 0);

  await bar(page).getByRole('button', { name: 'Cancel' }).click();
  const other = (await page
    .locator('li[data-card-id]')
    .filter({ hasText: 'Other' })
    .boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 48, box.y + 18, { steps: 3 });
  await page.mouse.move(other.x + 40, other.y + other.height - 4, { steps: 12 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await expect
    .poll(() => page.locator('li[data-card-id] button:not([role])').allInnerTexts())
    .toEqual(['Other', 'Drag me']);
});

test('Today lists planned cards after dated ones, and only they can be taken off', async ({
  page,
  request,
}) => {
  const { name } = await seedPlanBoard(request, [
    { title: 'Planned today', plannedFor: dayOffset(0) },
    { title: 'Carried over', plannedFor: dayOffset(-3) },
    { title: 'Due today', due: { date: dayOffset(0), time: null } },
  ]);
  await page.goto('/today');
  await expect
    .poll(() => todayTitles(page, name))
    .toEqual(['Due today', 'Carried over', 'Planned today']);
  await expect(
    todayGroup(page, name).locator('li[data-card-id]').filter({ hasText: 'Carried over' }),
  ).toContainText('Planned 3 days ago');

  await selectButton(page).click();
  await expect(
    todayGroup(page, name).getByRole('checkbox', { name: 'Select Due today' }),
  ).toBeDisabled();
  await todayGroup(page, name).getByRole('checkbox', { name: 'Select Carried over' }).click();
  await todayGroup(page, name).getByRole('checkbox', { name: 'Select Planned today' }).click();
  await bar(page).getByRole('button', { name: 'Remove from today' }).click();
  await expect.poll(() => todayTitles(page, name)).toEqual(['Due today']);
  await expect(page.getByText('2 cards taken off Today')).toBeVisible();
});

test('the card panel plans and unplans one card', async ({ page, request }) => {
  const { boardId, name } = await seedPlanBoard(request, [{ title: 'Just one' }]);
  await openBoard(page, boardId, name);
  await page.getByRole('button', { name: 'Just one', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Card' });
  await panel.getByRole('button', { name: 'Plan for today' }).click();
  await expect(panel.getByRole('button', { name: 'Remove from today' })).toBeVisible();
  await page.goto('/today');
  await expect.poll(() => todayTitles(page, name)).toEqual(['Just one']);
  await page.getByRole('button', { name: 'Just one', exact: true }).click();
  await panel.getByRole('button', { name: 'Remove from today' }).click();
  await panel.getByRole('button', { name: 'Close card' }).click();
  await expect(todayGroup(page, name)).toHaveCount(0);
});

test('a plan reaches another device and counts in its badge', async ({
  page,
  request,
  browser,
}) => {
  const { boardId, name } = await seedPlanBoard(request, [{ title: 'Shared plan' }]);
  const other = await (await browser.newContext()).newPage();
  await other.goto('/today');
  await expect(other.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

  await openBoard(page, boardId, name);
  await selectButton(page).click();
  await page.getByRole('checkbox', { name: 'Select Shared plan' }).click();
  await bar(page).getByRole('button', { name: 'Plan for today' }).click();

  await expect.poll(() => todayTitles(other, name), { timeout: 5000 }).toEqual(['Shared plan']);
  await other.context().close();
});

test('the badge counts planned cards', async ({ page }) => {
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
      plannedFor: null,
      ...fields,
    });
  await page.route('**/api/sync/pull**', (route) =>
    route.fulfill({
      json: {
        epoch: 0,
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
            card('planned', { plannedFor: dayOffset(-2) }),
            card('both', { due: { date: today, time: null }, plannedFor: today }),
            card('future', { plannedFor: dayOffset(1) }),
          ],
        },
      },
    }),
  );
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
  await expect(nav.getByRole('link', { name: 'Today' })).toHaveText(/3/);
});
