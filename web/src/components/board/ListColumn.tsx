import { memo, useRef, useState } from 'react';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import type { Card, List } from '@tack/shared';
import { restoreList, trashList, updateList } from '../../data/actions';
import { Menu } from '../Menu';
import { useToast } from '../Toast';
import { CardFace } from './CardFace';
import { Composer } from './Composer';
import styles from './ListColumn.module.css';

function ListName({ list }: { list: List }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button type="button" className={styles.name} onClick={() => setEditing(true)}>
        {list.name}
      </button>
    );
  }
  const save = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== list.name) void updateList(list.id, { name: trimmed });
    setEditing(false);
  };
  return (
    <input
      className={styles.nameInput}
      aria-label="List name"
      defaultValue={list.name}
      autoFocus
      enterKeyHint="done"
      onFocus={(event) => event.target.select()}
      onBlur={(event) => save(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') save(event.currentTarget.value);
        if (event.key === 'Escape') setEditing(false);
      }}
    />
  );
}

export const ListColumn = memo(function ListColumn({
  list,
  cards,
  boardId,
  showCompleted,
  lingering,
  now,
  onToggle,
}: {
  list: List;
  cards: readonly Card[];
  boardId: string;
  showCompleted: boolean;
  lingering: ReadonlySet<string>;
  now: number;
  onToggle: (card: { id: string; completed: boolean }, willHide: boolean) => void;
}) {
  const [composing, setComposing] = useState(false);
  const body = useRef<HTMLUListElement>(null);
  const toast = useToast();

  const visible = cards.filter((c) => showCompleted || !c.completed || lingering.has(c.id));
  // A card on its way out no longer counts.
  const count = visible.filter((c) => !lingering.has(c.id)).length;

  return (
    <section className={styles.column} aria-label={list.name} data-list-column>
      <header className={styles.header}>
        <ListName list={list} />
        <span className={styles.count}>{count}</span>
        <Menu
          label={`Menu for ${list.name}`}
          icon={<MoreHorizontal />}
          items={[
            {
              label: 'Delete',
              icon: <Trash2 />,
              danger: true,
              onSelect: () => {
                void trashList(list.id);
                toast.show('List moved to Trash', {
                  label: 'Undo',
                  onAction: () => void restoreList(list.id),
                });
              },
            },
          ]}
        />
      </header>
      <ul ref={body} className={styles.cards}>
        {visible.map((card) => (
          <CardFace
            key={card.id}
            card={card}
            now={now}
            leaving={lingering.has(card.id)}
            showCompleted={showCompleted}
            onToggle={onToggle}
          />
        ))}
      </ul>
      {composing ? (
        <Composer
          boardId={boardId}
          listId={list.id}
          onAdded={() => {
            requestAnimationFrame(() => {
              body.current?.scrollTo({ top: body.current.scrollHeight });
            });
          }}
          onClose={() => setComposing(false)}
        />
      ) : (
        <button type="button" className={styles.add} onClick={() => setComposing(true)}>
          <Plus />
          Add card
        </button>
      )}
    </section>
  );
});
