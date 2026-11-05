import { expect, test } from '@playwright/test';

test('the first load never reloads the page under you', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    (window as unknown as { marker: boolean }).marker = true;
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBe(true);
});
