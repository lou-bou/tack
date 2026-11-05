import { useDraggable } from '@dnd-kit/core';
import type { CalendarEntry } from '@tack/shared';
import { CardFace, CardSlot } from '../board/CardFace';
import styles from './Calendar.module.css';

type OnToggle = (card: { id: string; completed: boolean }, willHide: boolean) => void;

function DraggableRow({
  entry,
  now,
  lingering,
  onToggle,
}: {
  entry: CalendarEntry;
  now: number;
  lingering: ReadonlySet<string>;
  onToggle: OnToggle;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `row:${entry.card.id}`,
    data: { entry },
  });
  return (
    <li
      ref={setNodeRef}
      data-card-id={entry.card.id}
      className={isDragging ? styles.dragging : undefined}
      {...listeners}
    >
      <CardSlot leaving={lingering.has(entry.card.id)}>
        <CardFace
          card={entry.card}
          now={now}
          showCompleted={entry.board.showCompleted}
          onToggle={onToggle}
          listName={entry.listName}
        />
      </CardSlot>
    </li>
  );
}

/** A day's cards as full rows, for the phone's day list and the "+N more" sheet. */
export function DayCards({
  entries,
  now,
  lingering,
  onToggle,
  draggable = true,
}: {
  entries: readonly CalendarEntry[];
  now: number;
  lingering: ReadonlySet<string>;
  onToggle: OnToggle;
  draggable?: boolean;
}) {
  return (
    <ul>
      {entries.map((entry) =>
        draggable ? (
          <DraggableRow
            key={entry.card.id}
            entry={entry}
            now={now}
            lingering={lingering}
            onToggle={onToggle}
          />
        ) : (
          <li key={entry.card.id} data-card-id={entry.card.id}>
            <CardSlot leaving={lingering.has(entry.card.id)}>
              <CardFace
                card={entry.card}
                now={now}
                showCompleted={entry.board.showCompleted}
                onToggle={onToggle}
                listName={entry.listName}
              />
            </CardSlot>
          </li>
        ),
      )}
    </ul>
  );
}
