import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfWeek,
  dueKey,
  dueState,
  formatChip,
  formatDate,
  isDueSoon,
  isOverdue,
  moveDue,
  notificationBody,
  notifyAt,
  presetDate,
  startAfterDue,
  todayString,
  zonedMs,
} from '../src/index.js';

// Algiers is UTC+1 all year. These tests also run under other TZ values (npm run test:tz), so a
// dependency on the device's zone fails them.
const at = (date: string, time: string) => zonedMs(date, time);

describe('calendar arithmetic', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('knows Sunday is day 0', () => {
    expect(dayOfWeek('2026-11-01')).toBe(0);
    expect(dayOfWeek('2026-11-05')).toBe(4);
  });
});

describe('time zone', () => {
  it('reads wall-clock times in Algiers', () => {
    expect(new Date(at('2026-06-15', '13:00')).toISOString()).toBe('2026-06-15T12:00:00.000Z');
  });

  it('rolls over to the next day at Algiers midnight', () => {
    expect(todayString(Date.UTC(2026, 5, 15, 22, 59))).toBe('2026-06-15');
    expect(todayString(Date.UTC(2026, 5, 15, 23, 0))).toBe('2026-06-16');
  });
});

describe('overdue', () => {
  it('leaves a date-only card not overdue through the whole due day', () => {
    const due = { date: '2026-11-05', time: null };
    expect(isOverdue(due, at('2026-11-05', '23:59'))).toBe(false);
    expect(isOverdue(due, at('2026-11-06', '00:00'))).toBe(true);
  });

  it('flags a timed card once its minute has passed', () => {
    const due = { date: '2026-11-05', time: '14:00' };
    expect(isOverdue(due, at('2026-11-05', '14:00'))).toBe(false);
    expect(isOverdue(due, at('2026-11-05', '14:00') + 1)).toBe(true);
  });
});

describe('due soon', () => {
  it('uses the literal 24 hours for a timed card', () => {
    const due = { date: '2026-11-06', time: '14:00' };
    expect(isDueSoon(due, at('2026-11-05', '14:00'))).toBe(true);
    expect(isDueSoon(due, at('2026-11-05', '13:59'))).toBe(false);
  });

  it('is only the due day for a date-only card', () => {
    const due = { date: '2026-11-06', time: null };
    expect(isDueSoon(due, at('2026-11-05', '23:59'))).toBe(false);
    expect(isDueSoon(due, at('2026-11-06', '00:00'))).toBe(true);
  });
});

describe('due state', () => {
  const now = at('2026-11-05', '12:00');
  const state = (due: { date: string; time: string | null } | null, completed = false) =>
    dueState({ due, completed }, now);

  it('covers each state', () => {
    expect(state(null)).toBe('none');
    expect(state({ date: '2026-11-04', time: null })).toBe('overdue');
    expect(state({ date: '2026-11-05', time: null })).toBe('dueSoon');
    expect(state({ date: '2026-12-01', time: null })).toBe('neutral');
  });

  it('shows completed even when past due', () => {
    expect(state({ date: '2026-11-04', time: null }, true)).toBe('completed');
  });
});

describe('formatting', () => {
  it('uses DD/MM/YYYY and 24-hour time', () => {
    expect(formatDate('2026-03-09')).toBe('09/03/2026');
    expect(formatChip(null, { date: '2026-03-09', time: '18:30' })).toBe('09/03/2026 18:30');
  });

  it('joins start and due with an arrow', () => {
    expect(formatChip({ date: '2026-03-01', time: null }, { date: '2026-03-09', time: null })).toBe(
      '01/03/2026 → 09/03/2026',
    );
  });

  it('shows a start date alone', () => {
    expect(formatChip({ date: '2026-03-01', time: null }, null)).toBe('01/03/2026');
  });
});

describe('presets', () => {
  const thursday = at('2026-11-05', '12:00');
  const sunday = at('2026-11-08', '12:00');

  it('computes today and tomorrow', () => {
    expect(presetDate('today', thursday)).toBe('2026-11-05');
    expect(presetDate('tomorrow', thursday)).toBe('2026-11-06');
  });

  it('makes next week the next Sunday', () => {
    expect(presetDate('nextWeek', thursday)).toBe('2026-11-08');
  });

  it('goes a full week ahead when today is Sunday', () => {
    expect(presetDate('nextWeek', sunday)).toBe('2026-11-15');
  });
});

describe('start after due', () => {
  it('compares dates, then times when both have one', () => {
    const d = (date: string, time: string | null = null) => ({ date, time });
    expect(startAfterDue(d('2026-11-06'), d('2026-11-05'))).toBe(true);
    expect(startAfterDue(d('2026-11-05'), d('2026-11-05'))).toBe(false);
    expect(startAfterDue(d('2026-11-05', '10:00'), d('2026-11-05', '09:00'))).toBe(true);
    expect(startAfterDue(d('2026-11-05', '10:00'), d('2026-11-05'))).toBe(false);
    expect(startAfterDue(null, d('2026-11-05'))).toBe(false);
  });
});

describe('moving a due date', () => {
  it('keeps the time and shifts the start by the same amount', () => {
    const moved = moveDue(
      { start: { date: '2026-11-01', time: '09:00' }, due: { date: '2026-11-05', time: '18:00' } },
      '2026-11-10',
    );
    expect(moved.due).toEqual({ date: '2026-11-10', time: '18:00' });
    expect(moved.start).toEqual({ date: '2026-11-06', time: '09:00' });
  });

  it('moves earlier too, and leaves a missing start missing', () => {
    const moved = moveDue({ start: null, due: { date: '2026-11-05', time: null } }, '2026-11-03');
    expect(moved).toEqual({ start: null, due: { date: '2026-11-03', time: null } });
  });
});

describe('notifications', () => {
  it('fires 24 hours ahead for a timed card', () => {
    expect(notifyAt({ date: '2026-11-06', time: '14:00' })).toBe(at('2026-11-05', '14:00'));
  });

  it('fires at 09:00 the day before for a date-only card', () => {
    expect(notifyAt({ date: '2026-11-06', time: null })).toBe(at('2026-11-05', '09:00'));
  });

  it('words the text from the real day', () => {
    const now = at('2026-11-05', '10:00');
    expect(notificationBody({ date: '2026-11-06', time: '14:00' }, now)).toBe(
      'Due tomorrow at 14:00',
    );
    expect(notificationBody({ date: '2026-11-06', time: null }, now)).toBe('Due tomorrow');
    expect(notificationBody({ date: '2026-11-05', time: '18:00' }, now)).toBe('Due today at 18:00');
  });

  it('gives each due value its own key', () => {
    expect(dueKey({ date: '2026-11-06', time: null })).toBe('2026-11-06');
    expect(dueKey({ date: '2026-11-06', time: '14:00' })).toBe('2026-11-06T14:00');
  });
});
