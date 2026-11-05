import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Its own server over a copy of the build, because this test publishes "new versions" of it.
// Serial, so one server and one copy serve every test here.
test.describe.configure({ mode: 'serial' });

const PORT = 18100;
const base = `http://127.0.0.1:${PORT}`;
let dir: string;
let dist: string;
let server: ChildProcess;

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tack-update-'));
  dist = path.join(dir, 'dist');
  fs.cpSync('web/dist', dist, { recursive: true });
  server = spawn('node', ['server/dist/index.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DB_PATH: path.join(dir, 'tack.db'),
      WEB_DIST: dist,
    },
    stdio: 'ignore',
  });
  await expect
    .poll(
      () =>
        fetch(`${base}/api/health`).then(
          (r) => r.ok,
          () => false,
        ),
      { timeout: 10_000 },
    )
    .toBe(true);
});

test.afterAll(() => {
  server.kill();
  fs.rmSync(dir, { recursive: true, force: true });
});

let version = 0;

const pill = (page: Page) =>
  page.getByRole('button', { name: 'Update ready · Reload' }).filter({ visible: true });

/** Publishes a new service worker and has the page notice it. */
async function publishUpdate(page: Page) {
  version += 1;
  fs.appendFileSync(path.join(dist, 'sw.js'), `\n// version ${version}\n`);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  });
  await expect(pill(page)).toBeVisible({ timeout: 10_000 });
}

async function open(page: Page) {
  await page.goto(`${base}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.evaluate(() => {
    (window as unknown as { sameDocument: boolean }).sameDocument = true;
  });
}

const sameDocument = (page: Page) =>
  page.evaluate(() => (window as unknown as { sameDocument?: boolean }).sameDocument === true);

test.describe('updates', () => {
  test('a new version waits, leaves the page alone, and applies on request', async ({ page }) => {
    await open(page);
    await publishUpdate(page);

    await page.waitForTimeout(800);
    expect(await sameDocument(page)).toBe(true);

    await pill(page).click();
    await expect.poll(() => sameDocument(page).catch(() => true), { timeout: 10_000 }).toBe(false);
    await expect(page.getByRole('heading', { level: 1, name: 'Boards' })).toBeVisible();
    await expect(pill(page)).toHaveCount(0);
  });

  test('a second new version still never reloads the page by itself', async ({ page }) => {
    await open(page);
    await publishUpdate(page);
    await publishUpdate(page);
    await page.waitForTimeout(800);
    expect(await sameDocument(page)).toBe(true);
  });

  test('leaving the app applies a waiting update', async ({ page }) => {
    await open(page);
    await publishUpdate(page);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => sameDocument(page).catch(() => true), { timeout: 10_000 }).toBe(false);
  });
});
