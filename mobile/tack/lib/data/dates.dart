/// Date rules, ported from shared/src/dates.ts. Dates are wall-clock strings, always read in
/// [timeZone], whatever zone the phone is in (SPEC §1).
library;

import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

const timeZone = 'Africa/Algiers';

tz.Location? _zone;

/// The zone every date is read in. Loads the time zone database on first use.
tz.Location get zone {
  final z = _zone;
  if (z != null) return z;
  tzdata.initializeTimeZones();
  return _zone = tz.getLocation(timeZone);
}

/// A date with an optional time. `date` and `time` merge as one unit in sync.
class DateValue {
  const DateValue(this.date, [this.time]);

  /// YYYY-MM-DD
  final String date;

  /// HH:MM, or null for all day
  final String? time;

  static DateValue? fromJson(Object? json) {
    if (json is! Map || json['date'] is! String) return null;
    return DateValue(json['date'] as String, json['time'] as String?);
  }

  Map<String, Object?> toJson() => {'date': date, 'time': time};

  DateValue withDate(String d) => DateValue(d, time);

  @override
  bool operator ==(Object other) => other is DateValue && other.date == date && other.time == time;

  @override
  int get hashCode => Object.hash(date, time);

  @override
  String toString() => time == null ? date : '$date $time';
}

const defaultDueTime = '23:59';
const defaultStartTime = '09:00';

/// A date-only due date notifies at this time on the day before (SPEC §3.8).
const dateOnlyNotifyTime = '09:00';

const dayMs = 86400000;

(int, int, int) _parts(String date) {
  final p = date.split('-');
  return (int.parse(p[0]), p.length > 1 ? int.parse(p[1]) : 1, p.length > 2 ? int.parse(p[2]) : 1);
}

String _pad(int n, [int width = 2]) => n.toString().padLeft(width, '0');

String _ymd(DateTime t) => '${_pad(t.year, 4)}-${_pad(t.month)}-${_pad(t.day)}';

/// Calendar arithmetic through UTC, where every day is exactly 24 hours.
String addDays(String date, int days) {
  final (y, m, d) = _parts(date);
  return _ymd(DateTime.utc(y, m, d + days));
}

/// Whole days from [from] to [to]. Negative when [to] is earlier.
int daysBetween(String from, String to) {
  final (fy, fm, fd) = _parts(from);
  final (ty, tm, td) = _parts(to);
  return ((DateTime.utc(ty, tm, td).millisecondsSinceEpoch - DateTime.utc(fy, fm, fd).millisecondsSinceEpoch) / dayMs)
      .round();
}

/// 0 is Sunday.
int dayOfWeek(String date) {
  final (y, m, d) = _parts(date);
  return DateTime.utc(y, m, d).weekday % 7;
}

/// The current date in [timeZone].
String todayString(int now) => _ymd(tz.TZDateTime.fromMillisecondsSinceEpoch(zone, now));

/// Epoch ms of a wall-clock moment in [timeZone].
int zonedMs(String date, String time) {
  final (y, m, d) = _parts(date);
  final t = time.split(':');
  return tz.TZDateTime(zone, y, m, d, int.parse(t[0]), t.length > 1 ? int.parse(t[1]) : 0).millisecondsSinceEpoch;
}

/// Compares date values in time order. A date-only value counts as the end of its day.
int dueMoment(DateValue value) =>
    value.time != null ? zonedMs(value.date, value.time!) : zonedMs(addDays(value.date, 1), '00:00') - 1;

bool isOverdue(DateValue due, int now) => now > dueMoment(due);

/// A timed card is due soon in its last 24 hours, a date-only card on its due day.
bool isDueSoon(DateValue due, int now) {
  if (isOverdue(due, now)) return false;
  if (due.time == null) return due.date == todayString(now);
  return dueMoment(due) - now <= dayMs;
}

enum DueState { none, neutral, dueSoon, overdue, completed }

DueState dueState({required DateValue? due, required bool completed, required int now}) {
  if (completed) return DueState.completed;
  if (due == null) return DueState.none;
  if (isOverdue(due, now)) return DueState.overdue;
  if (isDueSoon(due, now)) return DueState.dueSoon;
  return DueState.neutral;
}

/// DD/MM/YYYY
String formatDate(String date) {
  final (y, m, d) = _parts(date);
  return '${_pad(d)}/${_pad(m)}/${_pad(y, 4)}';
}

String formatDateValue(DateValue value) =>
    value.time != null ? '${formatDate(value.date)} ${value.time}' : formatDate(value.date);

/// Text of the date chip: `start → due`, or whichever one is set.
String formatChip(DateValue? start, DateValue? due) {
  if (start != null && due != null) return '${formatDateValue(start)} → ${formatDateValue(due)}';
  final only = due ?? start;
  return only != null ? formatDateValue(only) : '';
}

/// DD/MM/YYYY HH:MM for a stored instant, read in [timeZone].
String formatTimestamp(String iso) {
  final t = tz.TZDateTime.fromMillisecondsSinceEpoch(zone, DateTime.parse(iso).millisecondsSinceEpoch);
  return '${_pad(t.day)}/${_pad(t.month)}/${_pad(t.year, 4)} ${_pad(t.hour)}:${_pad(t.minute)}';
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/// "March 2026" for any date in that month.
String formatMonth(String date) {
  final (y, m, _) = _parts(date);
  return '${monthNames[m - 1]} $y';
}

/// The first day of the month [offset] months from [date]'s month.
String monthStart(String date, [int offset = 0]) {
  final (y, m, _) = _parts(date);
  final shifted = DateTime.utc(y, m + offset, 1);
  return '${_pad(shifted.year, 4)}-${_pad(shifted.month)}-01';
}

/// Sunday-first weeks covering a month, each seven dates, spilling into its neighbours.
List<List<String>> monthWeeks(String date) {
  final first = monthStart(date);
  final nextMonth = monthStart(date, 1);
  final weeks = <List<String>>[];
  var day = addDays(first, -dayOfWeek(first));
  while (day.compareTo(nextMonth) < 0) {
    weeks.add([for (var i = 0; i < 7; i++) addDays(day, i)]);
    day = addDays(day, 7);
  }
  return weeks;
}

/// The Sunday-first week holding [date].
List<String> weekOf(String date) {
  final sunday = addDays(date, -dayOfWeek(date));
  return [for (var i = 0; i < 7; i++) addDays(sunday, i)];
}

final _timePattern = RegExp(r'^([01]?\d|2[0-3]):?([0-5]\d)$');

/// Reads what someone typed into a 24-hour time field: "9:05", "09:05" or "0905".
String? parseTime(String text) {
  final match = _timePattern.firstMatch(text.trim());
  return match == null ? null : '${_pad(int.parse(match.group(1)!))}:${match.group(2)}';
}

enum DatePreset { today, tomorrow, nextWeek }

/// "Next week" is the next Sunday. On a Sunday that is 7 days on, never today.
String presetDate(DatePreset preset, int now) {
  final today = todayString(now);
  return switch (preset) {
    DatePreset.today => today,
    DatePreset.tomorrow => addDays(today, 1),
    DatePreset.nextWeek => addDays(today, 7 - dayOfWeek(today)),
  };
}

/// Whether [start] falls after [due]. The UI prevents it; a sync merge can still produce it.
bool startAfterDue(DateValue? start, DateValue? due) {
  if (start == null || due == null) return false;
  if (start.date != due.date) return start.date.compareTo(due.date) > 0;
  return start.time != null && due.time != null && start.time!.compareTo(due.time!) > 0;
}

/// New dates for a card moved to another day on the calendar: the due date moves and keeps its
/// time, and the start date shifts by the same number of days (SPEC §3.7).
({DateValue? start, DateValue due}) moveDue({required DateValue? start, required DateValue due, required String to}) {
  final delta = daysBetween(due.date, to);
  return (due: due.withDate(to), start: start?.withDate(addDays(start.date, delta)));
}

/// When the "due tomorrow" notification fires: 24 hours before, or 09:00 the day before.
int notifyAt(DateValue due) => due.time != null
    ? zonedMs(due.date, due.time!) - dayMs
    : zonedMs(addDays(due.date, -1), dateOnlyNotifyTime);

/// Notification text, based on the real day, since a notification can run late.
String notificationBody(DateValue due, int now) {
  final today = todayString(now);
  final at = due.time != null ? ' at ${due.time}' : '';
  if (due.date == today) return 'Due today$at';
  if (due.date == addDays(today, 1)) return 'Due tomorrow$at';
  return 'Due ${formatDate(due.date)}$at';
}

/// Identifies one due date value, so each is notified at most once.
String dueKey(DateValue due) => due.time != null ? '${due.date}T${due.time}' : due.date;
