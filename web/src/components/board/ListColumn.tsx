import { memo, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card, List } from '@tack/shared';
import { restoreList, trashList, updateList } from '../../data/actions';
import { Menu } from '../Menu';
import { useToast } from '../Toast';
import { CardFace, CardSlot } from './CardFace';
import { Composer } from './Composer';
import styles from './ListColumn.module.css';

type OnToggle = (card: { id: string; completed: boolean }, willHide: boolean) => void;

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
  // Selecting text in the field mustn't start dragging the list.
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return (
    <input
      className={styles.nameInput}
      aria-label="List name"
      defaultValue={list.name}
      autoFocus
      enterKeyHint="done"
      onMouseDown={stop}
      onTouchStart={stop}
      onFocus={(event) => event.target.select()}
      onBlur={(event) => save(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') save(event.currentTarget.value);
        if (event.key === 'Escape') setEditing(false);
      }}
    />
  );
}

function SortableCard({
  card,
  listId,
  now,
  leaving,
  showCompleted,
  onToggle,
}: {
  card: Card;
  listId: string;
  now: number;
  leaving: boolean;
  showCompleted: boolean;
  onToggle: OnToggle;
}) {
  const data = useMemo(() => ({ type: 'card' as const, listId }), [listId]);
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    data,
    disabled: leaving,
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={isDragging ? styles.placeholder : undefined}
      data-card-id={card.id}
      {...listeners}
    >
      <CardSlot leaving={leaving}>
        <CardFace card={card} now={now} showCompleted={showCompleted} onToggle={onToggle} />
      </CardSlot>
    </li>
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
  /** The cards on screen, in order. */
  cards: readonly Card[];
  boardId: string;
  showCompleted: boolean;
  lingering: ReadonlySet<string>;
  now: number;
  onToggle: OnToggle;
}) {
  const [composing, setComposing] = useState(false);
  const body = useRef<HTMLUListElement>(null);
  const toast = useToast();
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: list.id,
    data: LIST_DATA,
  });
  const ids = useMemo(() => cards.map((card) => card.id), [cards]);
  // A card on its way out no longer counts.
  const count = cards.filter((card) => !lingering.has(card.id)).length;

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${styles.column} ${isDragging ? styles.placeholder : ''}`}
      aria-label={list.name}
      data-list-column
    >
      <header className={styles.header} {...listeners}>
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
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              listId={list.id}
              now={now}
              leaving={lingering.has(card.id)}
              showCompleted={showCompleted}
              onToggle={onToggle}
            />
          ))}
        </SortableContext>
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

const LIST_DATA = { type: 'list' as const };
const noop = () => {};

/** What follows the finger when a whole list is being dragged. */
export function ListPreview({
  list,
  cards,
  now,
}: {
  list: List;
  cards: readonly Card[];
  now: number;
}) {
  return (
    <section className={`${styles.column} ${styles.lifted}`}>
      <header className={styles.header}>
        <span className={styles.name}>{list.name}</span>
        <span className={styles.count}>{cards.length}</span>
      </header>
      <div className={styles.cards}>
        {cards.map((card) => (
          <CardSlot key={card.id}>
            <CardFace card={card} now={now} showCompleted onToggle={noop} />
          </CardSlot>
        ))}
      </div>
    </section>
  );
}
