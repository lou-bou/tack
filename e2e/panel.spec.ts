import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { boardRow, cardRow, isPhone, listRow, openBoard, seed } from './helpers';

type Rows = Parameters<typeof seed>[1];

async function seedBoard(
  request: Parameters<typeof seed>[0],
  cards: { title: string; [key: string]: unknown }[] = [{ title: 'Pick me' }],
  listNames = ['To do', 'Doing'],
  boardExtra: Record<string, unknown> = {},
) {
  const boardId = randomUUID();
  const name = `Panel ${boardId.slice(0, 8)}`;
  const listIds = listNames.map(() => randomUUID());
  const cardIds = cards.map(() => randomUUID());
  const rows: Rows = [
    boardRow(boardId, name, boardExtra),
    ...listNames.map((n, i) => listRow(listIds[i]!, boardId, n, `a${i}`)),
    ...cards.map(({ title, ...extra }, i) =>
      cardRow(cardIds[i]!, boardId, listIds[0]!, title, { position: `a${i}`, ...extra }),
    ),
  ];
  await seed(request, rows);
  return { boardId, name, listIds, cardIds };
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Card' });
const faceTitle = (page: Page, title: string) =>
  page.locator('li[data-card-id]').getByRole('button', { name: title, exact: true });

async function openCard(page: Page, boardId: string, name: string, title: string) {
  await openBoard(page, boardId, name);
  await faceTitle(page, title).click();
  await expect(panel(page).getByRole('textbox', { name: 'Card title' })).toHaveValue(title);
}

test('opens through the URL and closes with the button, Escape and Back', async ({
  page,
  request,
}) => {
  const { boardId, name, cardIds } = await seedBoard(request);
  await openCard(page, boardId, name, 'Pick me');
  await expect(page).toHaveURL(new RegExp(`\\?card=${cardIds[0]}`));

  await panel(page).getByRole('button', { name: 'Close card' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page).not.toHaveURL(/card=/);

  await faceTitle(page, 'Pick me').click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();

  await faceTitle(page, 'Pick me').click();
  await expect(panel(page)).toBeVisible();
  await page.goBack();
  await expect(panel(page)).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/board/${boardId}$`));
});

test('a direct link opens the card, and closing stays on the page', async ({ page, request }) => {
  const { boardId, cardIds } = await seedBoard(request);
  await page.goto(`/board/${boardId}?card=${cardIds[0]}`);
  await expect(panel(page).getByRole('textbox', { name: 'Card title' })).toHaveValue('Pick me');
  await panel(page).getByRole('button', { name: 'Close card' }).click();
  await expect(page).toHaveURL(new RegExp(`/board/${boardId}$`));
});

test('a link to a card that is gone says so', async ({ page }) => {
  await page.goto(`/?card=${randomUUID()}`);
  await expect(panel(page)).toContainText("doesn't exist");
});

test('the title saves as you type, and an empty one puts the old title back', async ({
  page,
  request,
}) => {
  const { boardId, name } = await seedBoard(request);
  await openCard(page, boardId, name, 'Pick me');
  const title = panel(page).getByRole('textbox', { name: 'Card title' });
  await title.fill('Renamed');
  await title.press('Enter');
  await expect(title).not.toBeFocused();
  if (isPhone(page)) await page.keyboard.press('Escape');
  await expect(faceTitle(page, 'Renamed')).toBeAttached();

  if (isPhone(page)) await faceTitle(page, 'Renamed').click();
  await title.fill('   ');
  await title.blur();
  await expect(title).toHaveValue('Renamed');
});

test('setting a due date from a preset takes two taps', async ({ page, request }) => {
  const { boardId, name } = await seedBoard(request);
  await openCard(page, boardId, name, 'Pick me');
  await panel(page).getByRole('button', { name: /^Due/ }).click(); // one
  await page
    .getByRole('dialog', { name: 'Due date' })
    .getByRole('button', { name: 'Tomorrow' })
    .click(); // two
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(panel(page).getByRole('button', { name: /^Due/ })).toContainText(
    /\d\d\/\d\d\/\d{4}/,
  );
  await expect(page.locator('li[data-card-id]').filter({ hasText: 'Pick me' })).toContainText(
    /\d\d\/\d\d\/\d{4}/,
  );
});

test('date picker: month calendar, time and clearing', async ({ page, request }) => {
  const { boardId, name } = await seedBoard(request);
  await openCard(page, boardId, name, 'Pick me');
  const due = panel(page).getByRole('button', { name: /^Due/ });
  const sheet = page.getByRole('dialog', { name: 'Due date' });

  await due.click();
  await sheet.getByRole('button', { name: 'Next month' }).click();
  await sheet.getByRole('button', { name: /^15\// }).click();
  await expect(sheet).toBeHidden();
  await expect(due).toContainText(/15\/\d\d\/\d{4}$/);

  // Time defaults to 23:59 for a due date and applies straight away.
  await due.click();
  await sheet.getByLabel('Add time').check();
  await expect(sheet.getByLabel('Time (24-hour)')).toHaveValue('23:59');
  await expect(due).toContainText(/15\/\d\d\/\d{4} 23:59/);
  await sheet.getByLabel('Time (24-hour)').fill('7:30');
  await expect(due).toContainText(/07:30/);
  await sheet.getByLabel('Time (24-hour)').fill('nonsense');
  await expect(sheet.getByText('Enter a time like 18:30.')).toBeVisible();
  await expect(due).toContainText(/07:30/);
  await sheet.getByRole('button', { name: 'Close' }).click();

  await due.click();
  await sheet.getByRole('button', { name: 'Clear date' }).click();
  await expect(due).toContainText('Not set');
});

test('start can never pass due, by date or by time', async ({ page, request }) => {
  const { boardId, name } = await seedBoard(request, [
    { title: 'Pick me', due: { date: '2030-06-15', time: '12:00' } },
  ]);
  await openCard(page, boardId, name, 'Pick me');
  await panel(page)
    .getByRole('button', { name: /^Start/ })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Start date' });

  // Today is before 2030, so step to June 2030.
  const months = (2030 - new Date().getUTCFullYear()) * 12 + (5 - new Date().getUTCMonth());
  for (let i = 0; i < months; i += 1)
    await sheet.getByRole('button', { name: 'Next month' }).click();
  await expect(sheet.getByRole('button', { name: '16/06/2030' })).toBeDisabled();
  await expect(sheet.getByRole('button', { name: '15/06/2030' })).toBeEnabled();

  await sheet.getByRole('button', { name: '15/06/2030' }).click();
  await expect(panel(page).getByRole('button', { name: /^Start/ })).toContainText('15/06/2030');

  await panel(page)
    .getByRole('button', { name: /^Start/ })
    .click();
  await sheet.getByLabel('Add time').check();
  await sheet.getByLabel('Time (24-hour)').fill('13:00');
  await expect(sheet.getByText("Start can't be after due.")).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(panel(page).getByRole('button', { name: /^Start/ })).not.toContainText('13:00');
});

test('priority sets with one tap and shows on the card', async ({ page, request }) => {
  const { boardId, name } = await seedBoard(request);
  await openCard(page, boardId, name, 'Pick me');
  await panel(page).getByRole('radio', { name: 'Urgent' }).click();
  await expect(panel(page).getByRole('radio', { name: 'Urgent' })).toBeChecked();
  await expect(
    page.locator('li[data-card-id]').getByRole('img', { name: 'Urgent priority' }),
  ).toBeAttached();
});

test('the List selector moves the card to the end of another list', async ({ page, request }) => {
  const { boardId, name } = await seedBoard(request);
  await openCard(page, boardId, name, 'Pick me');
  await panel(page).getByRole('combobox', { name: 'List' }).selectOption({ label: 'Doing' });
  await expect(
    page
      .getByRole('region', { name: 'Doing' })
      .getByRole('button', { name: 'Pick me', exact: true }),
  ).toBeAttached();
});

test('Move up and down step past hidden cards, and stop at the ends', async ({ page, request }) => {
  const { boardId, name } = await seedBoard(request, [
    { title: 'One' },
    { title: 'Hidden', completed: true },
    { title: 'Two' },
  ]);
  const order = () =>
    page
      .getByRole('region', { name: 'To do' })
      .locator('li[data-card-id] button:not([role])')
      .allInnerTexts();
  await openCard(page, boardId, name, 'Two');
  await expect(panel(page).getByRole('button', { name: 'Move down' })).toBeDisabled();
  await panel(page).getByRole('button', { name: 'Move up' }).click();
  await expect.poll(order).toEqual(['Two', 'One']);
  await expect(panel(page).getByRole('button', { name: 'Move up' })).toBeDisabled();
  await panel(page).getByRole('button', { name: 'Move down' }).click();
  await expect.poll(order).toEqual(['One', 'Two']);
});

test('Delete closes the panel and can be undone', async ({ page, request }) => {
  const { boardId, name } = await seedBoard(request);
  await openCard(page, boardId, name, 'Pick me');
  await panel(page).getByRole('button', { name: 'Delete' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(faceTitle(page, 'Pick me')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(faceTitle(page, 'Pick me')).toBeVisible();
});

test.describe('description', () => {
  const editor = (page: Page) => panel(page).getByRole('textbox', { name: 'Description' });

  test('keeps plain Markdown and hides markers away from the cursor', async ({ page, request }) => {
    const { boardId, name } = await seedBoard(request);
    await openCard(page, boardId, name, 'Pick me');
    await editor(page).click();
    const text = 'Some **bold** and `code`';
    await page.keyboard.type(text);

    // On the line being edited, the markers are all there.
    await expect(editor(page)).toContainText('**bold**');
    await panel(page).getByRole('textbox', { name: 'Card title' }).focus();

    // Away from it, they're gone from view, and the styling remains.
    await expect(editor(page)).not.toContainText('**');
    await expect(editor(page).locator('span', { hasText: /^bold$/ })).toHaveCSS(
      'font-weight',
      '700',
    );

    await page.reload();
    await expect(editor(page)).toContainText('Some');
    // The stored value is the Markdown, untouched by any of that.
    const stored = await page.evaluate(
      (id) =>
        new Promise<string>((resolve) => {
          const open = indexedDB.open('tack');
          open.onsuccess = () => {
            const read = open.result.transaction('cards').objectStore('cards').get(id);
            read.onsuccess = () => resolve(read.result.description);
          };
        }),
      new URL(page.url()).searchParams.get('card'),
    );
    expect(stored).toBe(text);
    await expect(
      page.locator('li[data-card-id]').getByRole('img', { name: 'Has description' }),
    ).toBeAttached();
  });

  test('headings, lists and quotes render, and the first line break works', async ({
    page,
    request,
  }) => {
    test.skip(
      isPhone(page),
      'Synthetic Enter skips the Android input path; checked on a real phone',
    );
    const { boardId, name } = await seedBoard(request, [
      { title: 'Pick me', description: '# Plan\n- Item\n> Said' },
    ]);
    await openCard(page, boardId, name, 'Pick me');
    await expect(editor(page)).not.toContainText('#');
    await expect(editor(page)).not.toContainText('>');
    await expect(editor(page)).toContainText('•');
    await expect(editor(page).locator('.cm-line').first()).toHaveCSS('font-weight', '700');

    // Enter inside a list continues it.
    await editor(page).getByText('Item').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Next');
    await expect(editor(page).locator('.cm-line').nth(2)).toHaveText('- Next');
  });

  test('task checkboxes toggle the Markdown in place', async ({ page, request }) => {
    const { boardId, name } = await seedBoard(request, [
      { title: 'Pick me', description: '- [ ] Buy milk\n- [x] Call home' },
    ]);
    await openCard(page, boardId, name, 'Pick me');
    const boxes = editor(page).getByRole('checkbox');
    await expect(boxes).toHaveCount(2);
    await expect(boxes.nth(0)).not.toBeChecked();
    await expect(boxes.nth(1)).toBeChecked();
    await boxes.nth(0).click();
    await expect(editor(page).getByRole('checkbox').nth(0)).toBeChecked();
  });

  test('links open from the preview', async ({ page, request, context }) => {
    const { boardId, name } = await seedBoard(request, [
      { title: 'Pick me', description: 'See [the docs](https://example.com/docs) now' },
    ]);
    await openCard(page, boardId, name, 'Pick me');
    await expect(editor(page)).not.toContainText('https://');
    const opened = context.waitForEvent('page');
    await context.route('https://example.com/**', (route) => route.fulfill({ body: 'ok' }));
    await editor(page).getByText('the docs').click();
    expect((await opened).url()).toBe('https://example.com/docs');
  });

  test('a remote edit shows up, but never over text being typed', async ({ page, request }) => {
    const { boardId, name, cardIds } = await seedBoard(request, [
      { title: 'Pick me', description: 'Original' },
    ]);
    await openCard(page, boardId, name, 'Pick me');
    await expect(editor(page)).toContainText('Original');
    await seed(request, [['cards', cardIds[0]!, { description: 'From elsewhere' }]]);
    await expect(editor(page)).toContainText('From elsewhere');

    await editor(page).click();
    await page.keyboard.type(' typing');
    await seed(request, [['cards', cardIds[0]!, { description: 'Second remote' }]]);
    await page.waitForTimeout(400);
    await expect(editor(page)).toContainText('typing');
  });
});

test('desktop: the board stays usable beside the panel', async ({ page, request }) => {
  test.skip(isPhone(page), 'Desktop layout only');
  const { boardId, name } = await seedBoard(request, [{ title: 'Pick me' }, { title: 'Other' }]);
  await openCard(page, boardId, name, 'Pick me');
  await expect.poll(async () => (await panel(page).boundingBox())?.x).toBe(1280 - 448);
  expect((await panel(page).boundingBox())!.width).toBe(448);
  await page.getByRole('checkbox', { name: 'Complete Other' }).click();
  await expect(panel(page)).toBeVisible();
  await expect(faceTitle(page, 'Other')).toHaveCount(0);
  // Another card swaps in without stacking history.
  await page.getByRole('button', { name: 'Undo' }).click();
  await faceTitle(page, 'Other').click();
  await expect(panel(page).getByRole('textbox', { name: 'Card title' })).toHaveValue('Other');
  await page.goBack();
  await expect(panel(page)).toBeHidden();
});

test('phone: full screen, and swiping down closes it', async ({ page, request }) => {
  test.skip(!isPhone(page), 'Phone layout only');
  const { boardId, name } = await seedBoard(request);
  await openCard(page, boardId, name, 'Pick me');
  const size = page.viewportSize()!;
  await expect.poll(async () => (await panel(page).boundingBox())?.y).toBe(0);
  const box = await panel(page).boundingBox();
  expect(box).toMatchObject({ x: 0, width: size.width });
  expect(Math.round(box!.height)).toBe(size.height);
  // The tab bar is hidden behind the sheet.
  const onTop = await page.evaluate(
    ([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('aside'),
    [size.width / 2, size.height - 10],
  );
  expect(onTop).toBe(true);

  const cdp = await page.context().newCDPSession(page);
  const x = size.width / 2;
  const send = (type: string, points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points } as never);
  await send('touchStart', [{ x, y: 20 }]);
  for (let y = 40; y <= 200; y += 40) await send('touchMove', [{ x, y }]);
  await send('touchEnd', []);
  await expect(panel(page)).toBeHidden();
});
