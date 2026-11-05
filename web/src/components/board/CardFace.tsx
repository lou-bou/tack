import { memo, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Clock,
  Equal,
  Flag,
  FileText,
} from 'lucide-react';
import { useSearchParams } from 'react-router';
import { dueState, formatChip, type Card, type Priority } from '@tack/shared';
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

function CardFaceInner({
  card,
  now,
  showCompleted,
  onToggle,
}: {
  card: Card;
  now: number;
  showCompleted: boolean;
  onToggle: (card: { id: string; completed: boolean }, willHide: boolean) => void;
}) {
  const [, setParams] = useSearchParams();
  const hasMeta = card.priority !== 'none' || card.start || card.due || card.description;

  return (
    <article className={`${styles.card} ${card.completed ? styles.completed : ''}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={card.completed}
        aria-label={`Complete ${card.title}`}
        className={styles.check}
        onClick={() => onToggle(card, !showCompleted)}
      >
        <span className={styles.box}>{card.completed && <Check />}</span>
      </button>
      <div className={styles.content}>
        <button
          type="button"
          className={styles.title}
          onClick={() => {
            setParams((params) => {
              params.set('card', card.id);
              return params;
            });
          }}
        >
          {card.title}
        </button>
        {hasMeta && (
          <div className={styles.meta}>
            <PriorityIcon priority={card.priority} />
            <DateChip card={card} now={now} />
            {card.description && (
              <span className={styles.described} role="img" aria-label="Has description">
                <FileText />
              </span>
            )}
          </div>
        )}
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
    a.onToggle === b.onToggle &&
    a.card.id === b.card.id &&
    a.card.title === b.card.title &&
    a.card.completed === b.card.completed &&
    a.card.priority === b.card.priority &&
    !a.card.description === !b.card.description &&
    sameDate(a.card.start, b.card.start) &&
    sameDate(a.card.due, b.card.due),
);
