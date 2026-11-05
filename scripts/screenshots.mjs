// Takes the README's screenshots from a throwaway server with sample data.
// Run after `npm run build`. Needs a colour emoji font on this machine, or emoji show as boxes.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const OUT = 'docs/screenshots';
const PORT = '18190';
const base = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tack-shots-'));
const server = spawn('node', ['server/dist/index.js'], {
  env: { ...process.env, PORT, HOST: '127.0.0.1', DB_PATH: path.join(dir, 'tack.db') },
  stdio: 'ignore',
});

try {
  for (let i = 0; i < 50; i += 1) {
    const up = await fetch(`${base}/api/health`).then(
      (r) => r.ok,
      () => false,
    );
    if (up) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const stamp = new Date().toISOString();
  const clock = `${String(Date.now()).padStart(13, '0')}:0000:seed`;
  const common = { createdAt: stamp, updatedAt: stamp, deletedAt: null };
  const change = (table, id, fields) => ({
    table,
    id,
    fields,
    clocks: Object.fromEntries(Object.keys(fields).map((key) => [key, clock])),
  });
  const day = (offset, time = null) => ({
    date: new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10),
    time,
  });
  const board = (id, name, emoji, color, position) =>
    change('boards', id, { name, emoji, color, showCompleted: true, position, ...common });
  const list = (id, boardId, name, position) =>
    change('lists', id, { boardId, name, position, ...common });
  let n = 0;
  const card = (boardId, listId, title, extra = {}) =>
    change('cards', `c${(n += 1)}`, {
      boardId,
      listId,
      title,
      position: `a${String(n).padStart(3, '0')}`,
      description: '',
      start: null,
      due: null,
      priority: 'none',
      completed: false,
      completedAt: null,
      ...common,
      ...extra,
    });

  const changes = [
    board('b1', 'Exam revision', '📚', 'blue', 'a0'),
    board('b2', 'Home', '🏡', 'green', 'a1'),
    board('b3', 'Trip to Oran', '🧳', 'amber', 'a2'),
    board('b4', 'Side project', '🛠️', 'violet', 'a3'),
    list('l1', 'b1', 'To do', 'a0'),
    list('l2', 'b1', 'Doing', 'a1'),
    list('l3', 'b1', 'Done', 'a2'),
    list('l4', 'b2', 'Jobs', 'a0'),
    card('b1', 'l1', 'Summarise the block cipher modes from chapter 4', {
      priority: 'high',
      due: day(3),
    }),
    card('b1', 'l1', 'Past paper 2023', { priority: 'urgent', due: day(-1), description: 'Notes' }),
    card('b1', 'l1', 'Book a slot with the tutor', { due: day(1, '10:30') }),
    card('b1', 'l1', 'Email the group'),
    card('b1', 'l2', 'Network security lab', {
      priority: 'medium',
      start: day(-1),
      due: day(4, '23:59'),
      description: 'Notes',
    }),
    card('b1', 'l2', 'Flash cards', { priority: 'low' }),
    card('b1', 'l3', 'Algebra summary', { completed: true, completedAt: stamp, due: day(-2) }),
    card('b2', 'l4', 'Fix the kitchen tap', { due: day(0, '18:00') }),
  ];
  await fetch(`${base}/api/sync/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ protocol: 1, changes }),
  });

  const browser = await chromium.launch();
  const shots = [
    ['board-desktop', '/board/b1', { viewport: { width: 1280, height: 720 } }, 'light'],
    ['calendar-desktop', '/calendar', { viewport: { width: 1280, height: 720 } }, 'dark'],
    ['card-desktop', '/board/b1?card=c2', { viewport: { width: 1280, height: 720 } }, 'light'],
    ['board-phone', '/board/b1', devices['Pixel 7'], 'dark'],
    ['today-phone', '/today', devices['Pixel 7'], 'light'],
  ];
  for (const [name, route, device, colorScheme] of shots) {
    const context = await browser.newContext({ ...device, colorScheme });
    const page = await context.newPage();
    await page.goto(base + route);
    // Long enough for the first sync and the splash.
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    await context.close();
  }
  await browser.close();
} finally {
  server.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}
