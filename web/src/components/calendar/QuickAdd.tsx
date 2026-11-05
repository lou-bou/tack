import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { byPosition, formatDate, type Board } from '@tack/shared';
import { db } from '../../data';
import { createCard } from '../../data/actions';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import fieldStyles from '../Field.module.css';
import styles from './Calendar.module.css';

/** Adds a card due on a tapped day. Board and list start on the current filter's first choice. */
export function QuickAdd({
  date,
  boards,
  onClose,
}: {
  date: string;
  boards: readonly Board[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [boardId, setBoardId] = useState(boards[0]?.id ?? '');
  const [listId, setListId] = useState('');
  const lists = useLiveQuery(
    async () =>
      (await db.lists.where('boardId').equals(boardId).toArray())
        .filter((l) => !l.deletedAt)
        .sort(byPosition),
    [boardId],
  );
  const chosen = lists?.some((l) => l.id === listId) ? listId : (lists?.[0]?.id ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !chosen) return;
    void createCard(boardId, chosen, trimmed, { due: { date, time: null } });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={`Add card, due ${formatDate(date)}`}>
      {boards.length === 0 ? (
        <p>Make a board first, then cards can go on the calendar.</p>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <label className={fieldStyles.field}>
            <span className={fieldStyles.label}>Title</span>
            <input
              className={fieldStyles.input}
              value={title}
              autoFocus
              enterKeyHint="done"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className={fieldStyles.field}>
            <span className={fieldStyles.label}>Board</span>
            <select
              className={fieldStyles.input}
              value={boardId}
              onChange={(event) => setBoardId(event.target.value)}
            >
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldStyles.field}>
            <span className={fieldStyles.label}>List</span>
            <select
              className={fieldStyles.input}
              value={chosen}
              disabled={!lists?.length}
              onChange={(event) => setListId(event.target.value)}
            >
              {lists?.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            {lists?.length === 0 && (
              <span className={fieldStyles.label}>This board has no lists yet.</span>
            )}
          </label>
          <Button type="submit" variant="primary" disabled={!title.trim() || !chosen}>
            Add card
          </Button>
        </form>
      )}
    </Sheet>
  );
}
