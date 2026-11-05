import { useDroppable } from '@dnd-kit/core';
import { formatDate, monthWeeks, type CalendarEntry } from '@tack/shared';
import styles from './Calendar.module.css';

const MAX_DOTS = 3;

function PhoneDay({
  date,
  count,
  outside,
  today,
  selected,
  onTap,
}: {
  date: string;
  count: number;
  outside: boolean;
  today: boolean;
  selected: boolean;
  onTap: (date: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, data: { date } });
  const classes = [
    styles.phoneDay,
    outside ? styles.outside : '',
    selected ? styles.phoneSelected : '',
    isOver ? styles.cellOver : '',
  ];
  const cards = count === 1 ? '1 card' : `${count} cards`;
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={classes.join(' ')}
      aria-label={`${Number(date.slice(8))}, ${formatDate(date)}, ${cards}`}
      aria-pressed={selected}
      data-date={date}
      onClick={() => onTap(date)}
    >
      <span className={today ? styles.todayNumber : undefined}>{Number(date.slice(8))}</span>
      <span className={styles.dots} aria-hidden="true">
        {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, i) => (
          <span key={i} className={styles.dot} />
        ))}
      </span>
    </button>
  );
}

/** Dots per day. Tapping a day lists its cards under the grid (SPEC §3.7). */
export function PhoneMonth({
  month,
  entries,
  today,
  selected,
  onTapDay,
}: {
  month: string;
  entries: readonly CalendarEntry[];
  today: string;
  selected: string;
  onTapDay: (date: string) => void;
}) {
  return (
    <div className={styles.phoneGrid}>
      {monthWeeks(month)
        .flat()
        .map((date) => (
          <PhoneDay
            key={date}
            date={date}
            count={entries.filter((e) => e.from <= date && date <= e.to).length}
            outside={!date.startsWith(month.slice(0, 7))}
            today={date === today}
            selected={date === selected}
            onTap={onTapDay}
          />
        ))}
    </div>
  );
}
