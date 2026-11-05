import { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  formatDate,
  formatMonth,
  monthStart,
  monthWeeks,
  parseTime,
  presetDate,
  todayString,
  type DatePreset,
  type DateValue,
} from '@tack/shared';
import { Button, IconButton } from '../Button';
import { Sheet } from '../Sheet';
import fieldStyles from '../Field.module.css';
import styles from './DatePicker.module.css';

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'nextWeek', label: 'Next week' },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Picks a date and an optional time. Choosing a day saves and closes, so a preset is two taps from
 * the chip. `isValid` keeps start from passing due, including by time on the same day.
 */
export function DatePicker({
  label,
  value,
  defaultTime,
  isValid,
  now,
  onChange,
  onClose,
}: {
  label: string;
  value: DateValue | null;
  defaultTime: string;
  isValid: (candidate: DateValue) => boolean;
  now: number;
  onChange: (value: DateValue | null) => void;
  onClose: () => void;
}) {
  const today = todayString(now);
  const [month, setMonth] = useState(monthStart(value?.date ?? today));
  const [withTime, setWithTime] = useState(!!value?.time);
  const [timeText, setTimeText] = useState(value?.time ?? defaultTime);

  const time = parseTime(timeText);
  const timeForSave = withTime ? time : null;
  const dayAllowed = (date: string) => isValid({ date, time: timeForSave });
  const conflict = !!value && withTime && !!time && !isValid({ date: value.date, time });

  const pick = (date: string) => {
    if (withTime && !time) return;
    onChange({ date, time: timeForSave });
    onClose();
  };

  const toggleTime = (on: boolean) => {
    setWithTime(on);
    // With a date already set, the change applies right away, like every other edit.
    if (!value) return;
    const candidate = { date: value.date, time: on ? time : null };
    if ((!on || time) && isValid(candidate)) onChange(candidate);
  };

  const editTime = (text: string) => {
    setTimeText(text);
    const parsed = parseTime(text);
    if (!value || !parsed) return;
    const candidate = { date: value.date, time: parsed };
    if (isValid(candidate)) onChange(candidate);
  };

  return (
    <Sheet open onClose={onClose} title={label}>
      <div className={styles.picker}>
        <div className={styles.presets}>
          {PRESETS.map(({ key, label: presetLabel }) => {
            const date = presetDate(key, now);
            return (
              <Button key={key} disabled={!dayAllowed(date)} onClick={() => pick(date)}>
                {presetLabel}
              </Button>
            );
          })}
        </div>

        <div className={styles.monthBar}>
          <IconButton label="Previous month" onClick={() => setMonth(monthStart(month, -1))}>
            <ChevronLeft />
          </IconButton>
          <span className={styles.monthName} aria-live="polite">
            {formatMonth(month)}
          </span>
          <IconButton label="Next month" onClick={() => setMonth(monthStart(month, 1))}>
            <ChevronRight />
          </IconButton>
        </div>

        <div className={styles.grid} role="group" aria-label={formatMonth(month)}>
          {WEEKDAYS.map((day) => (
            <span key={day} className={styles.weekday} aria-hidden="true">
              {day}
            </span>
          ))}
          {monthWeeks(month)
            .flat()
            .map((date) => {
              const selected = value?.date === date;
              const classes = [
                styles.day,
                date.slice(0, 7) !== month.slice(0, 7) ? styles.outside : '',
                date === today ? styles.today : '',
                selected ? styles.selected : '',
              ].join(' ');
              return (
                <button
                  key={date}
                  type="button"
                  className={classes}
                  aria-label={formatDate(date)}
                  aria-pressed={selected}
                  disabled={!dayAllowed(date)}
                  onClick={() => pick(date)}
                >
                  {Number(date.slice(8))}
                </button>
              );
            })}
        </div>

        <label className={styles.timeToggle}>
          <input
            type="checkbox"
            checked={withTime}
            onChange={(event) => toggleTime(event.target.checked)}
          />
          Add time
        </label>
        {withTime && (
          <label className={fieldStyles.field}>
            <span className={fieldStyles.label}>Time (24-hour)</span>
            <input
              className={`${fieldStyles.input} ${styles.timeInput}`}
              inputMode="numeric"
              placeholder="HH:MM"
              enterKeyHint="done"
              value={timeText}
              aria-invalid={!time || conflict}
              onChange={(event) => editTime(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && value && time && !conflict) onClose();
              }}
            />
            {!time && <span className={styles.problem}>Enter a time like 18:30.</span>}
            {conflict && <span className={styles.problem}>Start can't be after due.</span>}
          </label>
        )}

        {value && (
          <Button
            variant="danger"
            onClick={() => {
              onChange(null);
              onClose();
            }}
          >
            <X />
            Clear date
          </Button>
        )}
      </div>
    </Sheet>
  );
}
