import { expect, test, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { boardRow, cardRow, dayOffset, isPhone, listRow, seed } from './helpers';

const month = dayOffset(0).slice(0, 7);
const on = (day: number) => `${month}-${String(day).padStart(2, '0')}`;
const dv = (day: number, time: string | null = null) => ({ date: on(day), time });
const shown = (day: number) => {
  const [y, m] = month.split('-');
  return `${String(day).padStart(2, '0')}/${m}/${y}`;
};

async function seedBoard(
  request: Parameters<typeof seed>[0],
  cards: { title: string; [key: string]: unknown }[],
  boardExtra: Record<string, unknown> = {},
) {
  const boardId = randomUUID();
  const listId = randomUUID();
  const name = `Cal ${boardId.slice(0, 8)}`;
  await seed(request, [
    boardRow(boardId, name, boardExtra),
    listRow(listId, boardId, 'Inbox'),
    ...cards.map(({ title, ...extra }, i) =>
      cardRow(randomUUID(), boardId, listId, title, { position: `a${i}`, ...extra }),
    ),
  ]);
  return { boardId, listId, name };
}

/** Other tests share the server, so narrow to this test's board before looking at anything. */
async function openCalendar(page: Page, name: string) {
  await page.goto('/calendar');
  await page.getByRole('group', { name: 'Filter by board' }).getByRole('button', { name }).click();
}

const cell = (page: Page, day: number) => page.locator(`[data-date="${on(day)}"]`);
const chip = (page: Page, title: string) =>
  page.getByRole('button', { name: new RegExp(`^${title}, `) });

async function middle(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Not on screen');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('desktop', () => {
  test.beforeEach(({ page }) => test.skip(isPhone(page), 'Desktop grid only'));

  test('cards sit on their due day, and bars span from start to due', async ({ page, request }) => {
    const { name } = await seedBoard(request, [
      { title: 'single', due: dv(20) },
      { title: 'span', start: dv(14), due: dv(16) },
    ]);
    await openCalendar(page, name);
    await expect(chip(page, 'single')).toBeVisible();

    const single = await chip(page, 'single').boundingBox();
    const dayCell = await cell(page, 20).boundingBox();
    expect(single!.x).toBeGreaterThanOrEqual(dayCell!.x);
    expect(single!.x + single!.width).toBeLessThanOrEqual(dayCell!.x + dayCell!.width + 1);

    // Three days, however the weeks fall: the segments add up to about three cells.
    const segments = chip(page, 'span');
    const widths = await segments.evaluateAll((all) =>
      all.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0),
    );
    expect(widths).toBeGreaterThan(dayCell!.width * 2.5);
    expect(widths).toBeLessThanOrEqual(dayCell!.width * 3 + 1);
  });

  test('dragging to another day keeps the time and shifts the start', async ({ page, request }) => {
    const { name } = await seedBoard(request, [
      { title: 'mover', start: dv(9), due: dv(10, '14:30') },
    ]);
    await openCalendar(page, name);
    const from = await middle(chip(page, 'mover').last());
    const to = await middle(cell(page, 20));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();

    await chip(page, 'mover').last().click();
    const panel = page.getByRole('complementary', { name: 'Card' });
    await expect(panel.getByRole('button', { name: /^Due/ })).toContainText(`${shown(20)} 14:30`);
    await expect(panel.getByRole('button', { name: /^Start/ })).toContainText(shown(19));
  });

  test('a full day shows three cards, then +N more with the rest in a sheet', async ({
    page,
    request,
  }) => {
    const { name } = await seedBoard(
      request,
      ['a', 'b', 'c', 'd', 'e'].map((title) => ({ title: `busy ${title}`, due: dv(12) })),
    );
    await openCalendar(page, name);
    await expect(page.getByRole('button', { name: /^busy /, exact: false })).toHaveCount(3);
    await page.getByRole('button', { name: '+2 more' }).click();
    const sheet = page.getByRole('dialog', { name: shown(12) });
    await expect(sheet.locator('li[data-card-id]')).toHaveCount(5);
    await sheet.getByRole('button', { name: 'busy e', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(
      page
        .getByRole('complementary', { name: 'Card' })
        .getByRole('textbox', { name: 'Card title' }),
    ).toHaveValue('busy e');
  });

  test('tapping a day adds a card due that day', async ({ page, request }) => {
    const { name } = await seedBoard(request, []);
    await openCalendar(page, name);
    await cell(page, 18).click({ position: { x: 10, y: 60 } });
    const sheet = page.getByRole('dialog', { name: `Add card, due ${shown(18)}` });
    await expect(sheet.getByRole('button', { name: 'Add card' })).toBeDisabled();
    await sheet.getByLabel('Title').fill('Quick one');
    await expect(sheet.getByLabel('Board')).toHaveValue(/.+/);
    await expect(sheet.getByLabel('Board').locator('option:checked')).toHaveText(name);
    await sheet.getByRole('button', { name: 'Add card' }).click();
    await expect(sheet).toBeHidden();
    await expect(chip(page, 'Quick one')).toBeVisible();
  });

  test('tapping a card opens the panel', async ({ page, request }) => {
    const { name } = await seedBoard(request, [{ title: 'open me', due: dv(21) }]);
    await openCalendar(page, name);
    await chip(page, 'open me').click();
    await expect(page).toHaveURL(/\/calendar\?card=/);
  });

  test('week view shows seven columns, and the choice is remembered', async ({ page, request }) => {
    const { name } = await seedBoard(request, [
      { title: 'today card', due: { date: dayOffset(0), time: null } },
    ]);
    await openCalendar(page, name);
    await page.getByRole('radio', { name: 'Week' }).click({ force: true });
    await expect(page.getByRole('group', { name: /^Week of/ })).toHaveCount(1);
    await expect(page.locator('[data-date]')).toHaveCount(7);
    await expect(chip(page, 'today card')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Week' })).toBeChecked();

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator(`[data-date="${dayOffset(0)}"]`)).toHaveCount(0);
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page.locator(`[data-date="${dayOffset(0)}"]`)).toHaveCount(1);
  });
});

test('the board filter narrows what shows', async ({ page, request }) => {
  const one = await seedBoard(request, [{ title: 'from one', due: dv(15) }]);
  const two = await seedBoard(request, [{ title: 'from two', due: dv(15) }]);
  const filter = () => page.getByRole('group', { name: 'Filter by board' });
  const seen = async (title: string) => {
    if (isPhone(page)) {
      await cell(page, 15).click();
      return page.locator('li[data-card-id]').filter({ hasText: title });
    }
    return chip(page, title);
  };
  await page.goto('/calendar');
  await filter().getByRole('button', { name: one.name }).click();
  await expect(await seen('from one')).toBeVisible();
  await expect(await seen('from two')).toHaveCount(0);
  await filter().getByRole('button', { name: two.name }).click();
  await expect(await seen('from two')).toBeVisible();
  await filter().getByRole('button', { name: one.name }).click();
  await expect(await seen('from one')).toHaveCount(0);
  await filter().getByRole('button', { name: 'All boards' }).click();
  await expect(filter().getByRole('button', { name: 'All boards' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test("completed cards follow their board's setting", async ({ page, request }) => {
  const hidden = await seedBoard(request, [{ title: 'done hidden', due: dv(17), completed: true }]);
  const visible = await seedBoard(
    request,
    [{ title: 'done shown', due: dv(17), completed: true }],
    {
      showCompleted: true,
    },
  );
  const label = (count: string) => new RegExp(`${shown(17)}, ${count}`);
  await openCalendar(page, hidden.name);
  await expect(cell(page, 17)).toHaveAccessibleName(label('0 cards'));
  await openCalendar(page, visible.name);
  await expect(cell(page, 17)).toHaveAccessibleName(label('1 card'));
});

test.describe('phone', () => {
  test.beforeEach(({ page }) => test.skip(!isPhone(page), 'Phone layout only'));

  test('month shows dots, and tapping a day lists its cards below', async ({ page, request }) => {
    const { name } = await seedBoard(request, [
      { title: 'dot one', due: dv(13) },
      { title: 'dot two', due: dv(13) },
    ]);
    await openCalendar(page, name);
    await expect(cell(page, 13)).toHaveAccessibleName(`13, ${shown(13)}, 2 cards`);
    await cell(page, 13).click();
    const list = page.getByRole('region', { name: `Cards on ${shown(13)}` });
    await expect(list.locator('li[data-card-id]')).toHaveCount(2);
    await expect(list).toContainText('Inbox');

    await list.getByRole('button', { name: 'dot one', exact: true }).click();
    await expect(
      page
        .getByRole('complementary', { name: 'Card' })
        .getByRole('textbox', { name: 'Card title' }),
    ).toHaveValue('dot one');
  });

  test('tapping an empty day opens quick add', async ({ page, request }) => {
    const { name } = await seedBoard(request, []);
    await openCalendar(page, name);
    await cell(page, 22).click();
    const sheet = page.getByRole('dialog', { name: `Add card, due ${shown(22)}` });
    await sheet.getByLabel('Title').fill('On the phone');
    await sheet.getByRole('button', { name: 'Add card' }).click();
    await expect(sheet).toBeHidden();
    await expect(cell(page, 22)).toHaveAccessibleName(`22, ${shown(22)}, 1 card`);
  });

  test('long press on a row and drop on a day moves the due date', async ({ page, request }) => {
    const { name } = await seedBoard(request, [{ title: 'phone mover', due: dv(11, '09:15') }]);
    await openCalendar(page, name);
    await cell(page, 11).click();
    const row = page.locator('li[data-card-id]').filter({ hasText: 'phone mover' });
    await expect(row).toBeVisible();
    const from = await middle(row);
    const to = await middle(cell(page, 24));
    const cdp = await page.context().newCDPSession(page);
    const send = (type: string, touchPoints: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints } as never);
    await send('touchStart', [from]);
    await page.waitForTimeout(350);
    for (let i = 1; i <= 10; i += 1) {
      await send('touchMove', [
        { x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 },
      ]);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(100);
    await send('touchEnd', []);
    await expect(cell(page, 24)).toHaveAccessibleName(`24, ${shown(24)}, 1 card`);
    await expect(cell(page, 11)).toHaveAccessibleName(`11, ${shown(11)}, 0 cards`);
    await cell(page, 24).click();
    await expect(page.locator('li[data-card-id]').filter({ hasText: 'phone mover' })).toContainText(
      `${shown(24)} 09:15`,
    );
  });

  test('week view lists the seven days', async ({ page, request }) => {
    const { name } = await seedBoard(request, [
      { title: 'this week', due: { date: dayOffset(0), time: null } },
    ]);
    await openCalendar(page, name);
    await page.getByRole('radio', { name: 'Week' }).click({ force: true });
    await expect(page.locator('section[data-date]')).toHaveCount(7);
    await expect(page.locator('li[data-card-id]').filter({ hasText: 'this week' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
});
