import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { byPosition, newId, positionAtEnd } from '@tack/shared';
import { db, store, syncStatus } from '../data';
import styles from './DeviceTest.module.css';

// Temporary: exercises sync on real devices until the real screens replace it in step 4.
const BOARD_ID = 'device-test-board';
const LIST_ID = 'device-test-list';

async function ensureBoard() {
  const now = new Date().toISOString();
  const common = { position: 'a0', createdAt: now, updatedAt: now, deletedAt: null };
  if (!(await db.boards.get(BOARD_ID))) {
    await store.insert('boards', BOARD_ID, {
      ...common,
      name: 'Device test',
      emoji: null,
      color: 'neutral',
      showCompleted: false,
    });
  }
  if (!(await db.lists.get(LIST_ID))) {
    await store.insert('lists', LIST_ID, { ...common, boardId: BOARD_ID, name: 'Test' });
  }
}

export function SyncCheck() {
  const [title, setTitle] = useState('');
  const status = useLiveQuery(syncStatus, [], 'connecting');
  const queued = useLiveQuery(() => db.outbox.count(), [], 0);
  const cards = useLiveQuery(() => db.cards.where('listId').equals(LIST_ID).toArray(), [], []);
  const sorted = [...cards].sort(byPosition);

  async function add() {
    const text = title.trim();
    if (!text) return;
    setTitle('');
    await ensureBoard();
    const now = new Date().toISOString();
    await store.insert('cards', newId(), {
      boardId: BOARD_ID,
      listId: LIST_ID,
      position: positionAtEnd(sorted),
      title: text,
      description: '',
      start: null,
      due: null,
      priority: 'none',
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  return (
    <section className={styles.list} aria-label="Sync check">
      <div className={styles.row}>
        <dt>Sync status</dt>
        <dd data-testid="status">{status}</dd>
      </div>
      <div className={styles.row}>
        <dt>Waiting to send</dt>
        <dd data-testid="queued">{queued}</dd>
      </div>
      <form
        className={styles.actions}
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          className={styles.secondary}
          aria-label="Test card title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className={styles.primary} type="submit">
          Add test card
        </button>
      </form>
      <ul data-testid="cards">
        {sorted.map((card) => (
          <li key={card.id}>{card.title}</li>
        ))}
      </ul>
    </section>
  );
}
