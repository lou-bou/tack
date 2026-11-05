// A heavy board for checking drag and scroll speed: 10 lists, 200 cards.
// Run: node scripts/seed-perf.mjs [server url]
import { randomUUID } from 'node:crypto';

const server = process.argv[2] ?? `http://127.0.0.1:${process.env.PORT ?? 8097}`;
const now = new Date().toISOString();
const clock = `${String(Date.now()).padStart(13, '0')}:0000:seed`;
const stamps = { createdAt: now, updatedAt: now, deletedAt: null };
const change = (table, id, fields) => ({
  table,
  id,
  fields,
  clocks: Object.fromEntries(Object.keys(fields).map((key) => [key, clock])),
});
const position = (index) => `a${String(index).padStart(3, '0')}`;

const boardId = randomUUID();
const changes = [
  change('boards', boardId, {
    name: 'seed-perf',
    emoji: null,
    color: 'slate',
    showCompleted: false,
    position: 'Zz',
    ...stamps,
  }),
];
for (let l = 0; l < 10; l += 1) {
  const listId = randomUUID();
  changes.push(
    change('lists', listId, { boardId, name: `List ${l + 1}`, position: position(l), ...stamps }),
  );
  for (let c = 0; c < 20; c += 1) {
    changes.push(
      change('cards', randomUUID(), {
        boardId,
        listId,
        position: position(c),
        title: `Card ${l + 1}.${c + 1} with a title long enough to wrap onto a second line sometimes`,
        description: c % 3 === 0 ? 'Notes' : '',
        start: null,
        due: c % 2 === 0 ? { date: '2030-01-15', time: c % 4 === 0 ? '18:00' : null } : null,
        priority: ['none', 'low', 'medium', 'high', 'urgent'][c % 5],
        completed: false,
        completedAt: null,
        ...stamps,
      }),
    );
  }
}

const response = await fetch(`${server}/api/sync/push`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ protocol: 1, changes }),
});
if (!response.ok) throw new Error(`Push failed: ${response.status} ${await response.text()}`);
console.log(`Created board seed-perf: ${server}/board/${boardId}`);
