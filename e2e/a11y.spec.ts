import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { boardRow, cardRow, dayOffset, isPhone, listRow, seed } from './helpers';

const d = (offset: number, time: string | null = null) => ({ date: dayOffset(offset), time });

/** A board showing every state a card can be in, on a tinted background. */
async function seedStates(request: Parameters<typeof seed>[0], color = 'amber') {
  const [boardId, listId] = [randomUUID(), randomUUID()];
  const name = `Axe ${boardId.slice(0, 6)}`;
  const cards = [
    { title: 'Plain', extra: {} },
    { title: 'Overdue', extra: { due: d(-2), priority: 'urgent' } },
    { title: 'Soon', extra: { due: d(0, '23:59'), priority: 'high', description: 'Notes' } },
    { title: 'Span', extra: { start: d(-1), due: d(5), priority: 'medium' } },
    { title: 'Low', extra: { priority: 'low' } },
    { title: 'Done', extra: { completed: true, due: d(-1) } },
  ];
  const ids = cards.map(() => randomUUID());
  await seed(request, [
    boardRow(boardId, name, { color, showCompleted: true, emoji: null }),
    listRow(listId, boardId, 'Things'),
    ...cards.map(({ title, extra }, i) =>
      cardRow(ids[i]!, boardId, listId, title, { position: `a${i}`, ...extra }),
    ),
  ]);
  return { boardId, name, cardId: ids[2]! };
}

async function audit(page: Page, label: string, scope?: string) {
  // Let the theme and any entrance animation settle, so contrast is read at the final colours.
  await page.waitForTimeout(400);
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  const { violations } = await (scope ? builder.include(scope) : builder).analyze();
  const summary = violations.flatMap((v) =>
    v.nodes.slice(0, 4).map((n) => `${v.id}: ${n.target.join(' ')} — ${n.any[0]?.message ?? ''}`),
  );
  expect(summary, label).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test('every screen passes axe', async ({ page, request }) => {
      test.slow();
      const { boardId, cardId } = await seedStates(request);
      for (const [label, path] of [
        ['boards', '/'],
        ['board', `/board/${boardId}`],
        ['today', '/today'],
        ['calendar', '/calendar'],
        ['settings', '/settings'],
        ['card panel', `/board/${boardId}?card=${cardId}`],
      ] as const) {
        await page.goto(path);
        await expect(page.locator('h1').filter({ visible: true })).not.toHaveText('');
        await audit(page, label);
      }
    });

    test('sheets and menus pass axe', async ({ page, request }) => {
      const { boardId, name, cardId } = await seedStates(request);
      await page.goto('/');
      await page.getByRole('button', { name: 'New board' }).click();
      await audit(page, 'new board sheet');
      await page.keyboard.press('Escape');

      await page.goto(`/board/${boardId}?card=${cardId}`);
      await page.getByRole('complementary').getByRole('button', { name: /^Due/ }).click();
      await audit(page, 'date picker');
      await page.keyboard.press('Escape');

      await page.goto(`/board/${boardId}`);
      await page.getByRole('button', { name: `Menu for ${name}` }).click();
      await audit(page, 'board menu');
    });

    test('every board colour keeps its cards and text readable', async ({ page, request }) => {
      test.slow();
      for (const color of ['slate', 'blue', 'teal', 'green', 'olive', 'coral', 'rose', 'violet']) {
        const { boardId } = await seedStates(request, color);
        await page.goto(`/board/${boardId}`);
        await expect(page.locator('li[data-card-id]').first()).toBeVisible();
        await audit(page, color);
      }
    });
  });
}

test('touch controls are at least 44px', async ({ page, request }) => {
  test.skip(!isPhone(page), 'Phone only');
  test.slow();
  const { boardId, cardId } = await seedStates(request);
  const tooSmall = async (scope: Locator) =>
    scope.evaluateAll((controls) =>
      controls
        .filter((el) => {
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') return false;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          // Radios hide over their label, and hit areas can extend past the visible circle.
          if (el.matches('input[type="radio"]')) return false;
          const before = getComputedStyle(el, '::before');
          const after = getComputedStyle(el, '::after');
          const extended = before.content !== 'none' || after.content !== 'none';
          return !extended && Math.min(rect.height, rect.width) < 44;
        })
        .map(
          (el) =>
            `${el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`,
        ),
    );
  for (const path of [
    '/',
    `/board/${boardId}`,
    '/today',
    '/calendar',
    '/settings',
    `/board/${boardId}?card=${cardId}`,
  ]) {
    await page.goto(path);
    await expect(page.locator('h1').filter({ visible: true })).toBeAttached();
    await page.waitForTimeout(300);
    expect(
      await tooSmall(page.locator('button, a, input:not([type="hidden"]), select')),
      path,
    ).toEqual([]);
  }
});

test('a card can be made and managed with only the keyboard', async ({ page, request }) => {
  test.skip(isPhone(page), 'Keyboard run');
  const [boardId, listId] = [randomUUID(), randomUUID()];
  const name = `Keys ${boardId.slice(0, 6)}`;
  await seed(request, [boardRow(boardId, name), listRow(listId, boardId, 'Inbox')]);
  await page.goto(`/board/${boardId}`);

  const addCard = page
    .getByRole('region', { name: 'Inbox' })
    .getByRole('button', { name: 'Add card' });
  await addCard.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('First');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  const title = page.getByRole('button', { name: 'Second', exact: true });
  await title.focus();
  await expect(title).toHaveCSS('outline-style', 'none'); // Its ring is drawn around the whole card.
  await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: 'Card' });
  await expect(panel).toBeFocused();

  // Tab reaches the panel's controls, and the alternative to dragging works from the keyboard.
  const titleField = panel.getByRole('textbox', { name: 'Card title' });
  await expect(async () => {
    await page.keyboard.press('Tab');
    await expect(titleField).toBeFocused({ timeout: 100 });
  }).toPass({ timeout: 3000 });
  const moveUp = panel.getByRole('button', { name: 'Move up' });
  await moveUp.focus();
  await page.keyboard.press('Enter');
  const order = () => page.locator('li[data-card-id] button:not([role])').allInnerTexts();
  await expect.poll(order).toEqual(['Second', 'First']);

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(title).toBeFocused();

  // Space ticks, and focus rings show on what's focused.
  const tick = page.getByRole('checkbox', { name: 'Complete First' });
  await tick.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(tick).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Space');
  await expect(tick).toHaveCount(0);
});

test('reduced motion: ticking takes no time and nothing animates', async ({ page, request }) => {
  test.skip(isPhone(page), 'One size is enough');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const [boardId, listId] = [randomUUID(), randomUUID()];
  const name = `Still ${boardId.slice(0, 6)}`;
  await seed(request, [
    boardRow(boardId, name),
    listRow(listId, boardId, 'L'),
    cardRow(randomUUID(), boardId, listId, 'Tick me', {}),
  ]);
  await page.goto(`/board/${boardId}`);
  await page.getByRole('checkbox', { name: 'Complete Tick me' }).click();
  await expect(page.getByRole('button', { name: 'Tick me', exact: true })).toHaveCount(0, {
    timeout: 100,
  });
});

test('density changes the card size', async ({ page, request }) => {
  await page.route('**/api/sync/push', (route) =>
    route.fulfill({ json: { seq: 1, serverTime: Date.now(), rejected: [] } }),
  );
  const [boardId, listId] = [randomUUID(), randomUUID()];
  const name = `Dense ${boardId.slice(0, 6)}`;
  await seed(request, [
    boardRow(boardId, name),
    listRow(listId, boardId, 'L'),
    cardRow(randomUUID(), boardId, listId, 'Measure', {}),
  ]);
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Roomy' }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.density))
    .toBe('roomy');
  await page.goto(`/board/${boardId}`);
  const card = page.locator('li[data-card-id] article');
  await expect(card).toHaveCSS('padding', '12px 14px');
});

test.describe('splash', () => {
  const splash = (page: Page) => page.locator('[data-splash]');

  test('plays once per launch, ends by 1.6s and never blocks a tap', async ({ page }) => {
    await page.goto('/settings');
    await expect(splash(page)).toBeAttached();
    // The page underneath already takes taps.
    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(splash(page)).toHaveCount(0, { timeout: 1600 });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(splash(page)).toHaveCount(0);
  });

  test('with reduced motion the logo just shows, then goes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(splash(page)).toHaveCount(0, { timeout: 800 });
  });
});

test('ticking animates, but an already completed card does not on load', async ({
  page,
  request,
}) => {
  test.skip(isPhone(page), 'One size is enough');
  const [boardId, listId] = [randomUUID(), randomUUID()];
  const name = `Tick ${boardId.slice(0, 6)}`;
  await seed(request, [
    boardRow(boardId, name, { showCompleted: true }),
    listRow(listId, boardId, 'L'),
    cardRow(randomUUID(), boardId, listId, 'Was done', { completed: true, position: 'a0' }),
    cardRow(randomUUID(), boardId, listId, 'Tick now', { position: 'a1' }),
  ]);
  await page.goto(`/board/${boardId}`);
  const animating = (title: string) =>
    page
      .locator('li[data-card-id]')
      .filter({ hasText: title })
      .evaluate((el) =>
        el.getAnimations({ subtree: true }).map((a) => (a as CSSAnimation).animationName),
      );
  await expect(page.getByRole('checkbox', { name: 'Complete Tick now' })).toBeVisible();
  expect(await animating('Was done')).toEqual([]);
  await page.getByRole('checkbox', { name: 'Complete Tick now' }).click();
  await expect
    .poll(async () => (await animating('Tick now')).length, { intervals: [10] })
    .toBeGreaterThan(0);
});
