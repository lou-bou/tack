import { expect, test, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { boardRow, cardRow, isPhone, listRow, openBoard, seed } from './helpers';

async function seedLists(
  request: Parameters<typeof seed>[0],
  lists: Record<string, (string | { title: string; completed: true })[]>,
  extra: Record<string, unknown> = {},
) {
  const boardId = randomUUID();
  const name = `Drag ${boardId.slice(0, 8)}`;
  const rows = [boardRow(boardId, name, extra)];
  Object.entries(lists).forEach(([listName, cards], l) => {
    const listId = randomUUID();
    rows.push(listRow(listId, boardId, listName, `a${l}`));
    cards.forEach((card, c) => {
      const fields =
        typeof card === 'string'
          ? { title: card, completed: false }
          : { title: card.title, completed: true };
      rows.push(
        cardRow(randomUUID(), boardId, listId, fields.title, { ...fields, position: `a${c}` }),
      );
    });
  });
  await seed(request, rows);
  return { boardId, name };
}

const column = (page: Page, name: string) => page.getByRole('region', { name });
const titles = (page: Page, name: string) =>
  column(page, name).locator('li[data-card-id] button:not([role="checkbox"])').allInnerTexts();
const card = (page: Page, title: string) =>
  page.locator('li[data-card-id]').filter({ hasText: title });

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Not on screen');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function mouseDrag(page: Page, from: Locator, to: { x: number; y: number }) {
  const start = await center(from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  // Let the collision pass settle on where the pointer ended up.
  await page.mouse.move(to.x, to.y + 1);
  await page.waitForTimeout(120);
  await page.mouse.up();
}

test.describe('desktop', () => {
  test.beforeEach(({ page }) => test.skip(isPhone(page), 'Mouse only'));

  test('reorders a card within a list and keeps the order after reload', async ({
    page,
    request,
  }) => {
    const { boardId, name } = await seedLists(request, { A: ['one', 'two', 'three'] });
    await openBoard(page, boardId, name);
    await mouseDrag(page, card(page, 'one'), await center(card(page, 'three')));
    await expect.poll(() => titles(page, 'A')).toEqual(['two', 'three', 'one']);
    await page.reload();
    await expect.poll(() => titles(page, 'A')).toEqual(['two', 'three', 'one']);
  });

  test('moves a card to another list, including an empty one', async ({ page, request }) => {
    const { boardId, name } = await seedLists(request, { A: ['one', 'two'], B: ['three'], C: [] });
    await openBoard(page, boardId, name);

    const beforeThree = await center(card(page, 'three'));
    await mouseDrag(page, card(page, 'one'), { x: beforeThree.x, y: beforeThree.y - 8 });
    await expect.poll(() => titles(page, 'A')).toEqual(['two']);
    await expect.poll(async () => (await titles(page, 'B')).sort()).toEqual(['one', 'three']);

    await mouseDrag(page, card(page, 'two'), await center(column(page, 'C')));
    await expect.poll(() => titles(page, 'C')).toEqual(['two']);
    await expect.poll(() => titles(page, 'A')).toEqual([]);

    await page.reload();
    await expect.poll(() => titles(page, 'C')).toEqual(['two']);
    await expect(column(page, 'C').locator('header span').last()).toHaveText('1');
  });

  test('announces the move to screen readers', async ({ page, request }) => {
    const { boardId, name } = await seedLists(request, { A: ['one'], B: [] });
    await openBoard(page, boardId, name);
    await mouseDrag(page, card(page, 'one'), await center(column(page, 'B')));
    await expect(page.getByRole('status').filter({ hasText: 'Moved to B' })).toBeAttached();
  });

  test('hidden completed cards keep their place around a drop', async ({ page, request }) => {
    const { boardId, name } = await seedLists(request, {
      A: ['one', { title: 'hidden', completed: true }, 'two', 'three'],
    });
    await openBoard(page, boardId, name);
    await mouseDrag(page, card(page, 'three'), await center(card(page, 'two')));
    await expect.poll(() => titles(page, 'A')).toEqual(['one', 'three', 'two']);

    await page.getByRole('button', { name: /Show completed/ }).click();
    await expect.poll(() => titles(page, 'A')).toEqual(['one', 'hidden', 'three', 'two']);
  });

  test('a card can only be dropped on this board, and Escape cancels', async ({
    page,
    request,
  }) => {
    const { boardId, name } = await seedLists(request, { A: ['one', 'two'] });
    await openBoard(page, boardId, name);
    const start = await center(card(page, 'one'));
    const end = await center(card(page, 'two'));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect.poll(() => titles(page, 'A')).toEqual(['one', 'two']);
  });

  test('a click without moving still ticks and does not start a drag', async ({
    page,
    request,
  }) => {
    const { boardId, name } = await seedLists(request, { A: ['one', 'two'] });
    await openBoard(page, boardId, name);
    await page.getByRole('checkbox', { name: 'Complete one' }).click();
    await expect.poll(() => titles(page, 'A')).toEqual(['two']);
  });

  test('reorders lists', async ({ page, request }) => {
    const { boardId, name } = await seedLists(request, { A: ['one'], B: [], C: [] });
    await openBoard(page, boardId, name);
    const order = () =>
      page
        .locator('section[data-list-column]')
        .evaluateAll((all) => all.map((s) => s.getAttribute('aria-label')));
    await expect.poll(order).toEqual(['A', 'B', 'C']);
    await mouseDrag(
      page,
      column(page, 'A').locator('header span').last(),
      await center(column(page, 'C').locator('header')),
    );
    await expect.poll(order).toEqual(['B', 'C', 'A']);
    await page.reload();
    await expect.poll(order).toEqual(['B', 'C', 'A']);
    await expect(column(page, 'A').getByText('one')).toBeVisible();
  });

  test('reorders boards in the sidebar and on the Boards screen', async ({ page, request }) => {
    const prefix = randomUUID().slice(0, 6);
    const names = ['P', 'Q', 'R'].map((n) => `${prefix} ${n}`);
    await seed(
      request,
      names.map((n, i) => boardRow(randomUUID(), n, { position: `Zz${i}` })),
    );
    await page.goto('/');
    const tiles = page.getByRole('main').getByRole('listitem');
    const order = async () =>
      (await tiles.allInnerTexts())
        .map((text) => names.find((n) => text.includes(n)))
        .filter(Boolean);
    await expect.poll(order).toEqual(names);
    await mouseDrag(
      page,
      tiles.filter({ hasText: names[0]! }).getByText('open'),
      await center(tiles.filter({ hasText: names[2]! })),
    );
    await expect.poll(order).toEqual([names[1], names[2], names[0]]);

    const side = page.getByRole('list', { name: 'Boards' }).getByRole('listitem');
    const sideOrder = async () =>
      (await side.allInnerTexts())
        .map((text) => names.find((n) => text.includes(n)))
        .filter(Boolean);
    await expect.poll(sideOrder).toEqual([names[1], names[2], names[0]]);
    await mouseDrag(
      page,
      side.filter({ hasText: names[0]! }),
      await center(side.filter({ hasText: names[1]! })),
    );
    await expect.poll(sideOrder).toEqual([names[0], names[1], names[2]]);
    // The drag must not have followed the link.
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('phone', () => {
  test.beforeEach(({ page }) => test.skip(!isPhone(page), 'Touch only'));

  /** Real touch events through the browser, with long-press timing under the test's control. */
  async function touch(page: Page) {
    const cdp = await page.context().newCDPSession(page);
    const send = (type: string, points: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points } as never);
    return {
      start: (p: { x: number; y: number }) => send('touchStart', [p]),
      move: async (from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) => {
        for (let i = 1; i <= steps; i += 1) {
          await send('touchMove', [
            {
              x: from.x + ((to.x - from.x) * i) / steps,
              y: from.y + ((to.y - from.y) * i) / steps,
            },
          ]);
          await page.waitForTimeout(16);
        }
      },
      end: () => send('touchEnd', []),
    };
  }

  test('long press lifts a card, and dropping on the strip sends it to the end of that list', async ({
    page,
    request,
  }) => {
    const { boardId, name } = await seedLists(request, { A: ['one', 'two'], B: ['three'] });
    await openBoard(page, boardId, name);
    const t = await touch(page);
    const from = await center(card(page, 'one'));
    const target = await center(
      page.getByRole('navigation', { name: 'Lists' }).getByRole('button', { name: 'B' }),
    );
    await t.start(from);
    await page.waitForTimeout(350);
    await t.move(from, target);
    await page.waitForTimeout(120);
    await t.end();
    await expect.poll(() => titles(page, 'B')).toEqual(['three', 'one']);
    await expect.poll(() => titles(page, 'A')).toEqual(['two']);
  });

  test('a quick swipe scrolls instead of lifting a card', async ({ page, request }) => {
    const { boardId, name } = await seedLists(request, { A: ['one', 'two'], B: ['three'] });
    await openBoard(page, boardId, name);
    const t = await touch(page);
    const from = await center(card(page, 'one'));
    await t.start(from);
    await t.move(from, { x: from.x - 250, y: from.y }, 6);
    await t.end();
    await expect(column(page, 'B')).toBeInViewport({ ratio: 0.8 });
    await expect.poll(() => titles(page, 'A')).toEqual(['one', 'two']);
  });

  test('holding a card at the screen edge pages to the next list', async ({ page, request }) => {
    const { boardId, name } = await seedLists(request, { A: ['one', 'two'], B: ['three'] });
    await openBoard(page, boardId, name);
    const t = await touch(page);
    const from = await center(card(page, 'one'));
    const width = page.viewportSize()!.width;
    const edge = { x: width - 10, y: from.y };
    await t.start(from);
    await page.waitForTimeout(350);
    await t.move(from, edge);
    // dnd-kit only reports movement, so keep nudging while held at the edge.
    for (let i = 0; i < 14; i += 1) {
      await t.move(edge, { x: edge.x, y: edge.y + (i % 2) }, 1);
      await page.waitForTimeout(40);
    }
    const strip = page.getByRole('navigation', { name: 'Lists' });
    await expect(strip.getByRole('button', { name: 'B' })).toHaveAttribute('aria-current', 'true');
    const dropAt = await center(card(page, 'three'));
    await t.move(edge, { x: dropAt.x, y: dropAt.y + 8 });
    await page.waitForTimeout(120);
    await t.end();
    await expect.poll(async () => (await titles(page, 'B')).sort()).toEqual(['one', 'three']);
  });
});
