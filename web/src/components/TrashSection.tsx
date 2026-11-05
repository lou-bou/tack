import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { selectTrash, type TrashRow } from '@tack/shared';
import { db } from '../data';
import { purgeForever, restoreFromTrash } from '../data/actions';
import { useNow } from '../lib/boards';
import { Button } from './Button';
import { Sheet } from './Sheet';
import styles from './TrashSection.module.css';

const KIND_LABEL = { board: 'Board', list: 'List', card: 'Card' };

function describe(row: TrashRow): string {
  const kind = KIND_LABEL[row.kind];
  if (row.kind === 'card') return kind;
  return `${kind}, ${row.cardCount} ${row.cardCount === 1 ? 'card' : 'cards'}`;
}

function daysLeft(days: number): string {
  if (days === 0) return 'Under a day left';
  return days === 1 ? '1 day left' : `${days} days left`;
}

type Confirming = { type: 'one'; row: TrashRow } | { type: 'all' } | null;

/** Every deleted board, list and card (SPEC §3.9). */
export function TrashSection() {
  const now = useNow();
  const rows = useLiveQuery(async () => {
    const [boards, lists, cards] = await Promise.all([
      db.boards.toArray(),
      db.lists.toArray(),
      db.cards.toArray(),
    ]);
    return selectTrash(boards, lists, cards, now);
  }, [now]);
  const [confirming, setConfirming] = useState<Confirming>(null);

  const confirm = () => {
    if (confirming?.type === 'one') void purgeForever(confirming.row.kind, confirming.row.id);
    if (confirming?.type === 'all') {
      for (const row of rows ?? []) void purgeForever(row.kind, row.id);
    }
    setConfirming(null);
  };

  return (
    <section className={styles.section} aria-labelledby="trash">
      <div className={styles.heading}>
        <h2 id="trash" className={styles.title}>
          Trash
        </h2>
        {rows && rows.length > 0 && (
          <Button variant="danger" onClick={() => setConfirming({ type: 'all' })}>
            Empty trash
          </Button>
        )}
      </div>
      {rows?.length === 0 && <p className={styles.empty}>Trash is empty.</p>}
      <ul className={styles.rows}>
        {rows?.map((row) => (
          <li key={row.id} className={styles.row}>
            <div className={styles.info}>
              <span className={styles.name}>{row.name}</span>
              <span className={styles.detail}>
                {describe(row)}
                {row.where && ` · from ${row.where}`}
              </span>
              <span className={styles.days}>{daysLeft(row.daysLeft)}</span>
            </div>
            <div className={styles.actions}>
              {row.needsBoard ? (
                <span className={styles.blocked}>Restore the board first</span>
              ) : (
                <Button onClick={() => void restoreFromTrash(row.kind, row.id)}>Restore</Button>
              )}
              <Button variant="danger" onClick={() => setConfirming({ type: 'one', row })}>
                Delete forever
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Sheet
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming?.type === 'all' ? 'Empty trash?' : 'Delete forever?'}
        footer={
          <>
            <Button onClick={() => setConfirming(null)}>Cancel</Button>
            <Button variant="primary" onClick={confirm}>
              {confirming?.type === 'all' ? 'Empty trash' : 'Delete forever'}
            </Button>
          </>
        }
      >
        <p>
          {confirming?.type === 'one'
            ? `"${confirming.row.name}" will be gone for good. This can't be undone.`
            : `All ${rows?.length ?? 0} items will be gone for good. This can't be undone.`}
        </p>
      </Sheet>
    </section>
  );
}
