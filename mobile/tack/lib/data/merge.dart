import 'hlc.dart';

/// A row as stored on devices and sent over the wire: its fields, plus `id` and `clocks`
/// (field name to the clock of its last write).
typedef Json = Map<String, Object?>;

Map<String, String> clocksOf(Json row) => {
  for (final e in ((row['clocks'] as Map?) ?? const {}).entries) '${e.key}': '${e.value}',
};

/// Last write wins per field (shared/src/merge.ts): each field keeps the value with the higher
/// clock. Merging the same change twice gives the same result, so a retried batch does no harm.
({Json row, bool changed}) mergeChange(Json? existing, Json change) {
  final clocks = existing == null ? <String, String>{} : clocksOf(existing);
  final row = <String, Object?>{...?existing, 'id': existing?['id'] ?? change['id']};
  var changed = false;
  final incoming = clocksOf(change);
  for (final e in ((change['fields'] as Map?) ?? const {}).entries) {
    final field = '${e.key}';
    final clock = incoming[field];
    if (clock == null) continue;
    if (clock.compareTo(clocks[field] ?? hlcZero) > 0) {
      row[field] = e.value;
      clocks[field] = clock;
      changed = true;
    }
  }
  row['clocks'] = clocks;
  return (row: row, changed: changed);
}
