import { useDroppable } from '@dnd-kit/core';
import { formatDate, layoutWeek, type CalendarEntry } from '@tack/shared';
import { CalendarChip } from './CalendarChip';
import styles from './Calendar.module.css';

function DayCell({
  date,
  column,
  today,
  outside,
  count,
  onTap,
}: {
  date: string;
  column: number;
  today: boolean;
  outside: boolean;
  count: number;
  onTap: (date: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, data: { date } });
  const classes = [styles.cell, isOver ? styles.cellOver : '', outside ? styles.outside : ''];
  const cards = count === 1 ? '1 card' : `${count} cards`;
  return (
    <>
      <button
        ref={setNodeRef}
        type="button"
        className={classes.join(' ')}
        style={{ left: `${(column * 100) / 7}%` }}
        aria-label={`${formatDate(date)}, ${cards}. Add a card`}
        data-date={date}
        onClick={() => onTap(date)}
      />
      <span
        className={`${styles.dayNumber} ${today ? styles.todayNumber : ''}`}
        style={{ gridColumn: column + 1 }}
        aria-hidden="true"
      >
        {Number(date.slice(8))}
      </span>
    </>
  );
}

/** One week of cells, with cards drawn over them as chips and bars. */
export function WeekRow({
  week,
  entries,
  today,
  month,
  now,
  maxLanes,
  onTapDay,
  onShowMore,
}: {
  week: string[];
  entries: readonly CalendarEntry[];
  today: string;
  /** The month being shown, as YYYY-MM, so days outside it can fade. */
  month?: string;
  now: number;
  maxLanes?: number;
  onTapDay: (date: string) => void;
  onShowMore: (date: string) => void;
}) {
  const { segments, hidden } = layoutWeek(entries, week, maxLanes);
  const counts = week.map((date) =>
    entries.reduce((sum, e) => sum + (e.from <= date && date <= e.to ? 1 : 0), 0),
  );
  return (
    <div className={styles.week} role="group" aria-label={`Week of ${formatDate(week[0] ?? '')}`}>
      {week.map((date, column) => (
        <DayCell
          key={date}
          date={date}
          column={column}
          today={date === today}
          outside={!!month && !date.startsWith(month)}
          count={counts[column] ?? 0}
          onTap={onTapDay}
        />
      ))}
      {segments.map((segment) => (
        <CalendarChip
          key={segment.entry.card.id}
          id={`${segment.entry.card.id}:${week[0]}`}
          entry={segment.entry}
          now={now}
          continuesBefore={segment.continuesBefore}
          continuesAfter={segment.continuesAfter}
          style={{
            gridColumn: `${segment.column + 1} / span ${segment.span}`,
            gridRow: segment.lane + 2,
          }}
        />
      ))}
      {hidden.map((count, column) =>
        count > 0 && maxLanes ? (
          <button
            key={week[column]}
            type="button"
            className={styles.more}
            style={{ gridColumn: column + 1, gridRow: maxLanes + 2 }}
            onClick={() => onShowMore(week[column] ?? '')}
          >
            +{count} more
          </button>
        ) : null,
      )}
    </div>
  );
}
