import type { CSSProperties } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Check, Flag } from 'lucide-react';
import { dueState, type CalendarEntry } from '@tack/shared';
import { useCardPanel } from '../../lib/cardPanel';
import { PriorityIcon } from '../board/CardFace';
import styles from './Calendar.module.css';

/** What a card looks like in a calendar cell, or across cells as a bar. */
export function ChipFace({
  entry,
  now,
  continuesBefore = false,
  continuesAfter = false,
}: {
  entry: CalendarEntry;
  now: number;
  continuesBefore?: boolean;
  continuesAfter?: boolean;
}) {
  const { card, board } = entry;
  const state = dueState(card, now);
  const classes = [
    styles.chip,
    styles[state] ?? '',
    continuesBefore ? styles.fromBefore : '',
    continuesAfter ? styles.intoAfter : '',
  ].join(' ');
  return (
    <span className={classes} style={{ background: `var(--board-${board.color})` }}>
      {state === 'overdue' && <Flag />}
      {state === 'completed' && <Check />}
      <PriorityIcon priority={card.priority} />
      {card.due?.time && entry.from === entry.to && (
        <span className={styles.time}>{card.due.time}</span>
      )}
      <span className={styles.chipTitle}>{card.title}</span>
    </span>
  );
}

export function CalendarChip({
  id,
  entry,
  now,
  style,
  continuesBefore,
  continuesAfter,
}: {
  /** Unique per week, since a bar crossing weeks is drawn once in each. */
  id: string;
  entry: CalendarEntry;
  now: number;
  style?: CSSProperties;
  continuesBefore?: boolean;
  continuesAfter?: boolean;
}) {
  const { open } = useCardPanel();
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id,
    data: { entry },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-card-id={entry.card.id}
      className={`${styles.chipButton} ${isDragging ? styles.dragging : ''}`}
      style={style}
      aria-label={`${entry.card.title}, ${entry.board.name}`}
      onClick={() => open(entry.card.id)}
      {...listeners}
    >
      <ChipFace
        entry={entry}
        now={now}
        continuesBefore={continuesBefore}
        continuesAfter={continuesAfter}
      />
    </button>
  );
}
