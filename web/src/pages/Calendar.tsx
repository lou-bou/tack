import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  addDays,
  byPosition,
  dayOfWeek,
  entriesOnDay,
  formatDate,
  formatMonth,
  monthStart,
  monthWeeks,
  moveDue,
  selectCalendar,
  todayString,
  type CalendarEntry,
  type DateValue,
} from '@tack/shared';
import { Button, IconButton } from '../components/Button';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { ChipFace } from '../components/calendar/CalendarChip';
import { DayCards } from '../components/calendar/DayCards';
import { PhoneMonth } from '../components/calendar/PhoneMonth';
import { QuickAdd } from '../components/calendar/QuickAdd';
import { WeekRow } from '../components/calendar/WeekRow';
import { db } from '../data';
import { updateCard } from '../data/actions';
import { boardGlyph, useNow } from '../lib/boards';
import { useCompletion } from '../lib/completion';
import { useDragSensors } from '../lib/dnd';
import { useIsDesktop } from '../lib/media';
import styles from '../components/calendar/Calendar.module.css';

type View = 'month' | 'week';

const VIEW_KEY = 'tack.calendar.view';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LANES = 3;
const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
];

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'week' ? 'week' : 'month';
  } catch {
    return 'month';
  }
}

const weekOf = (date: string) => {
  const sunday = addDays(date, -dayOfWeek(date));
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
};

/** A droppable day heading in the phone's week list. */
function PhoneWeekDay({
  date,
  today,
  onAdd,
  children,
}: {
  date: string;
  today: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, data: { date } });
  return (
    <section
      ref={setNodeRef}
      className={`${styles.phoneWeekDay} ${isOver ? styles.cellOver : ''}`}
      aria-label={formatDate(date)}
      data-date={date}
    >
      <h2 className={styles.phoneWeekHeading}>
        <span className={today ? styles.todayNumber : undefined}>
          {WEEKDAYS[dayOfWeek(date)]} {formatDate(date)}
        </span>
        <IconButton label={`Add a card due ${formatDate(date)}`} onClick={onAdd}>
          <Plus />
        </IconButton>
      </h2>
      {children}
    </section>
  );
}

export function CalendarPage() {
  const now = useNow();
  const today = todayString(now);
  const isDesktop = useIsDesktop();
  const sensors = useDragSensors();
  const { lingering, toggle } = useCompletion();

  const [view, setView] = useState<View>(readView);
  const [anchor, setAnchor] = useState(today);
  const [selectedDay, setSelectedDay] = useState(today);
  const [filter, setFilter] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [moreDay, setMoreDay] = useState<string | null>(null);
  const [dragged, setDragged] = useState<CalendarEntry | null>(null);

  const data = useLiveQuery(async () => {
    const [boards, lists, cards] = await Promise.all([
      db.boards.toArray(),
      db.lists.toArray(),
      db.cards.toArray(),
    ]);
    return { boards, lists, cards };
  }, []);

  const boards = useMemo(
    () => (data?.boards ?? []).filter((b) => !b.deletedAt).sort(byPosition),
    [data],
  );
  const entries = useMemo(
    () => (data ? selectCalendar(data.boards, data.lists, data.cards, filter) : []),
    [data, filter],
  );
  // A filter's boards come first when adding, since that's probably what you're looking at.
  const addBoards = useMemo(
    () => [...boards].sort((a, b) => Number(filter.has(b.id)) - Number(filter.has(a.id))),
    [boards, filter],
  );

  const changeView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // It just won't be remembered next time.
    }
  };

  const step = (direction: 1 | -1) => {
    const next = view === 'month' ? monthStart(anchor, direction) : addDays(anchor, 7 * direction);
    setAnchor(next);
    if (view === 'month') setSelectedDay(next);
  };

  const goToday = () => {
    setAnchor(today);
    setSelectedDay(today);
  };

  const toggleBoard = (id: string) => {
    setFilter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onDragStart = (event: DragStartEvent) => {
    navigator.vibrate?.(10);
    setDragged((event.active.data.current as { entry: CalendarEntry }).entry);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragged(null);
    const date = (event.over?.data.current as { date?: string } | undefined)?.date;
    const { card } = (event.active.data.current as { entry: CalendarEntry }).entry;
    if (!date || !card.due || card.due.date === date) return;
    // Keeps the time, and the start shifts by the same number of days (SPEC §3.7).
    void updateCard(card.id, moveDue({ start: card.start, due: card.due as DateValue }, date));
  };

  const month = monthStart(anchor);
  const week = weekOf(anchor);
  const label =
    view === 'month'
      ? formatMonth(anchor)
      : `${formatDate(week[0] ?? '')} – ${formatDate(week[6] ?? '')}`;

  const tapPhoneDay = (date: string) => {
    setSelectedDay(date);
    if (entriesOnDay(entries, date).length === 0) setAdding(date);
  };

  return (
    <Screen title="Calendar" flush>
      <div className={styles.toolbar}>
        <div className={styles.period}>
          <IconButton label="Previous" onClick={() => step(-1)}>
            <ChevronLeft />
          </IconButton>
          <IconButton label="Next" onClick={() => step(1)}>
            <ChevronRight />
          </IconButton>
          <Button onClick={goToday}>Today</Button>
          <span className={styles.periodLabel} aria-live="polite">
            {label}
          </span>
        </div>
        <span id="calendar-view" className="sr-only">
          Calendar view
        </span>
        <Segmented
          name="calendar-view"
          labelledBy="calendar-view"
          value={view}
          options={VIEW_OPTIONS}
          onChange={changeView}
        />
      </div>

      {boards.length > 0 && (
        <div className={styles.filter} role="group" aria-label="Filter by board">
          <button
            type="button"
            className={styles.filterChip}
            aria-pressed={filter.size === 0}
            onClick={() => setFilter(new Set())}
          >
            All boards
          </button>
          {boards.map((board) => (
            <button
              key={board.id}
              type="button"
              className={styles.filterChip}
              aria-pressed={filter.has(board.id)}
              onClick={() => toggleBoard(board.id)}
            >
              <span aria-hidden="true">{boardGlyph(board)}</span> {board.name}
            </button>
          ))}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragged(null)}
        accessibility={{
          announcements: {
            onDragStart: () => undefined,
            onDragOver: () => undefined,
            onDragEnd: ({ over }) => {
              const date = (over?.data.current as { date?: string } | undefined)?.date;
              return date ? `Due date moved to ${formatDate(date)}` : undefined;
            },
            onDragCancel: () => 'Move cancelled',
          },
        }}
      >
        <div className={styles.body}>
          {isDesktop ? (
            <div className={view === 'month' ? styles.monthGrid : styles.weekGrid}>
              <div className={styles.weekdays} aria-hidden="true">
                {WEEKDAYS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              {(view === 'month' ? monthWeeks(month) : [week]).map((days) => (
                <WeekRow
                  key={days[0]}
                  week={days}
                  entries={entries}
                  today={today}
                  month={view === 'month' ? month.slice(0, 7) : undefined}
                  now={now}
                  maxLanes={view === 'month' ? MONTH_LANES : undefined}
                  onTapDay={setAdding}
                  onShowMore={setMoreDay}
                />
              ))}
            </div>
          ) : view === 'month' ? (
            <>
              <div className={styles.weekdays} aria-hidden="true">
                {WEEKDAYS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <PhoneMonth
                month={month}
                entries={entries}
                today={today}
                selected={selectedDay}
                onTapDay={tapPhoneDay}
              />
              <section
                className={styles.dayList}
                aria-label={`Cards on ${formatDate(selectedDay)}`}
              >
                <h2 className={styles.phoneWeekHeading}>
                  {formatDate(selectedDay)}
                  <IconButton
                    label={`Add a card due ${formatDate(selectedDay)}`}
                    onClick={() => setAdding(selectedDay)}
                  >
                    <Plus />
                  </IconButton>
                </h2>
                <DayCards
                  entries={entriesOnDay(entries, selectedDay)}
                  now={now}
                  lingering={lingering}
                  onToggle={toggle}
                />
              </section>
            </>
          ) : (
            <div className={styles.phoneWeek}>
              {week.map((date) => (
                <PhoneWeekDay
                  key={date}
                  date={date}
                  today={date === today}
                  onAdd={() => setAdding(date)}
                >
                  <DayCards
                    entries={entriesOnDay(entries, date)}
                    now={now}
                    lingering={lingering}
                    onToggle={toggle}
                  />
                </PhoneWeekDay>
              ))}
            </div>
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragged && (
            <div className={styles.lifted}>
              <ChipFace entry={dragged} now={now} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {adding && <QuickAdd date={adding} boards={addBoards} onClose={() => setAdding(null)} />}
      <Sheet
        open={moreDay !== null}
        onClose={() => setMoreDay(null)}
        title={moreDay ? formatDate(moreDay) : ''}
      >
        {/* The panel opens behind a modal sheet, so opening a card closes this first. */}
        <div
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest('button:not([role])')) setMoreDay(null);
          }}
        >
          <DayCards
            entries={moreDay ? entriesOnDay(entries, moreDay) : []}
            now={now}
            lingering={lingering}
            onToggle={toggle}
            draggable={false}
          />
        </div>
      </Sheet>
    </Screen>
  );
}
