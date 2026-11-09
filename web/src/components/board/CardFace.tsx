import { memo, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Clock,
  Equal,
  Flag,
  Sun,
  FileText,
} from 'lucide-react';
import { dueState, formatChip, isPlanned, type Card, type Priority } from '@tack/shared';
import { useCardPanel } from '../../lib/cardPanel';
import { useSelectionContext } from '../../lib/selection';
import { UnsentMarker } from '../../lib/unsent';
import styles from './CardFace.module.css';

const PRIORITY_ICONS = {
  urgent: ChevronsUp,
  high: ChevronUp,
  medium: Equal,
  low: ChevronDown,
} as const;

const PRIORITY_LABELS: Record<Priority, string> = {
  none: 'No priority',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function PriorityIcon({ priority }: { priority: Priority }) {
  if (priority === 'none') return null;
  const Icon = PRIORITY_ICONS[priority];
  const label = `${PRIORITY_LABELS[priority]} priority`;
  return (
    <span
      className={styles.priority}
      style={{ color: `var(--priority-${priority})` }}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon />
    </span>
  );
}

export function DateChip({
  card,
  now,
}: {
  card: Pick<Card, 'start' | 'due' | 'completed'>;
  now: number;
}) {
  const text = formatChip(card.start, card.due);
  if (!text) return null;
  const state = dueState(card, now);
  return (
    <span className={`${styles.chip} ${styles[state] ?? ''}`}>
      {state === 'overdue' && <Flag />}
      {state === 'dueSoon' && <Clock />}
      {state === 'completed' && <Check />}
      {text}
      {state === 'overdue' && <span className={styles.chipWord}>Overdue</span>}
    </span>
  );
}

function CardMeta({ card, now, listName }: { card: Card; now: number; listName?: string }) {
  return (
    // Hidden by CSS when nothing in it renders.
    <div className={styles.meta}>
      {isPlanned(card, now) && (
        <span className={styles.planned} role="img" aria-label="Planned for today">
          <Sun />
        </span>
      )}
      <PriorityIcon priority={card.priority} />
      <DateChip card={card} now={now} />
      {card.description && (
        <span className={styles.described} role="img" aria-label="Has description">
          <FileText />
        </span>
      )}
      {listName && <span className={styles.listName}>{listName}</span>}
      <UnsentMarker cardId={card.id} className={styles.described} />
    </div>
  );
}

function CardFaceInner({
  card,
  now,
  showCompleted,
  onToggle,
  listName,
}: {
  card: Card;
  now: number;
  showCompleted: boolean;
  /** Shown where the card is away from its board, like on Today. */
  listName?: string;
  onToggle: (card: { id: string; completed: boolean }, willHide: boolean) => void;
}) {
  const { open } = useCardPanel();
  const selection = useSelectionContext();
  // The pop and the strike-through sweep play for a tick you just made, not on every render.
  const [justTicked, setJustTicked] = useState(false);

  if (selection?.selecting) {
    const isSelected = selection.selected.has(card.id);
    const selectable = selection.canSelect(card);
    const pick = () => {
      if (selectable) selection.toggle(card.id);
    };
    return (
      <article
        className={`${styles.card} ${styles.selecting} ${isSelected ? styles.selected : ''} ${
          selectable ? '' : styles.unselectable
        }`}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={`Select ${card.title}`}
          disabled={!selectable}
          className={styles.check}
          onClick={pick}
        >
          <span className={`${styles.box} ${isSelected ? styles.selectedBox : ''}`}>
            {isSelected && <Check />}
          </span>
        </button>
        <div className={styles.content}>
          {/* Tapping anywhere on the card picks it, while selecting. */}
          <button
            type="button"
            className={styles.title}
            tabIndex={-1}
            disabled={!selectable}
            onClick={pick}
          >
            <span className={styles.titleText}>{card.title}</span>
          </button>
          <CardMeta card={card} now={now} listName={listName} />
        </div>
      </article>
    );
  }

  return (
    <article
      className={`${styles.card} ${card.completed ? styles.completed : ''} ${
        card.completed && justTicked ? styles.justTicked : ''
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={card.completed}
        aria-label={`Complete ${card.title}`}
        className={styles.check}
        onClick={() => {
          setJustTicked(!card.completed);
          onToggle(card, !showCompleted);
        }}
      >
        <span className={styles.box}>{card.completed && <Check />}</span>
      </button>
      <div className={styles.content}>
        <button type="button" className={styles.title} onClick={() => open(card.id)}>
          <span className={styles.titleText}>{card.title}</span>
        </button>
        <CardMeta card={card} now={now} listName={listName} />
      </div>
    </article>
  );
}

/** A card's place in a list, with the collapse used when a ticked card leaves. */
export function CardSlot({
  leaving = false,
  children,
}: {
  leaving?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.slot} ${leaving ? styles.leaving : ''}`}>
      <div className={styles.collapse}>{children}</div>
    </div>
  );
}

const sameDate = (a: Card['due'], b: Card['due']) => a?.date === b?.date && a?.time === b?.time;

// Rows come back as fresh objects after any write, so compare what the face actually shows.
export const CardFace = memo(
  CardFaceInner,
  (a, b) =>
    a.now === b.now &&
    a.showCompleted === b.showCompleted &&
    a.listName === b.listName &&
    a.onToggle === b.onToggle &&
    a.card.id === b.card.id &&
    a.card.title === b.card.title &&
    a.card.completed === b.card.completed &&
    a.card.priority === b.card.priority &&
    a.card.plannedFor === b.card.plannedFor &&
    !a.card.description === !b.card.description &&
    sameDate(a.card.start, b.card.start) &&
    sameDate(a.card.due, b.card.due),
);
