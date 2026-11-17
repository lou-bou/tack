import 'dates.dart';
import 'merge.dart';
import 'positions.dart';

export 'merge.dart' show Json;

/// Bumped when the sync wire format changes (shared/src/constants.ts).
const protocolVersion = 1;

const priorities = ['none', 'low', 'medium', 'high', 'urgent'];
const boardColors = ['neutral', 'slate', 'blue', 'teal', 'green', 'olive', 'amber', 'coral', 'rose', 'violet'];
const themes = ['system', 'light', 'dark'];
const densities = ['compact', 'roomy'];
const trashDays = 30;
const notificationKeepDays = 30;

/// Settings is a single synced row, always under this id.
const settingsId = 'settings';

/// Every synced table, in the server's order (shared/src/schema.ts).
const tableNames = ['boards', 'lists', 'cards', 'settings', 'notifications'];

/// Tables whose rows carry `updatedAt`, stamped on every edit.
const tablesWithUpdatedAt = {'boards', 'lists', 'cards', 'settings'};

/// Typed views over synced rows. The row itself stays a JSON map, exactly as it travels, so a
/// field this version doesn't know is kept and sent back untouched.
class Board implements Positioned {
  Board(this.row)
    : id = row['id'] as String,
      name = row['name'] as String? ?? '',
      emoji = (row['emoji'] as String?)?.isEmpty ?? true ? null : row['emoji'] as String,
      color = boardColors.contains(row['color']) ? row['color'] as String : 'neutral',
      showCompleted = row['showCompleted'] == true,
      position = row['position'] as String? ?? '',
      deletedAt = row['deletedAt'] as String?;

  final Json row;
  @override
  final String id;
  final String name;
  final String? emoji;
  final String color;
  final bool showCompleted;
  @override
  final String position;
  final String? deletedAt;

  /// What stands for a board where there's only room for a glyph: its emoji or first letter.
  String get glyph => emoji ?? (name.isEmpty ? '' : String.fromCharCode(name.runes.first).toUpperCase());

  String get title => emoji != null ? '$emoji $name' : name;
}

class BoardList implements Positioned {
  BoardList(this.row)
    : id = row['id'] as String,
      boardId = row['boardId'] as String? ?? '',
      name = row['name'] as String? ?? '',
      position = row['position'] as String? ?? '',
      deletedAt = row['deletedAt'] as String?;

  final Json row;
  @override
  final String id;
  final String boardId;
  final String name;
  @override
  final String position;
  final String? deletedAt;
}

class TaskCard implements Positioned {
  TaskCard(this.row)
    : id = row['id'] as String,
      boardId = row['boardId'] as String? ?? '',
      listId = row['listId'] as String? ?? '',
      position = row['position'] as String? ?? '',
      title = row['title'] as String? ?? '',
      description = row['description'] as String? ?? '',
      start = DateValue.fromJson(row['start']),
      due = DateValue.fromJson(row['due']),
      priority = priorities.contains(row['priority']) ? row['priority'] as String : 'none',
      completed = row['completed'] == true,
      plannedFor = row['plannedFor'] as String?,
      createdAt = row['createdAt'] as String? ?? '',
      updatedAt = row['updatedAt'] as String? ?? '',
      deletedAt = row['deletedAt'] as String?;

  final Json row;
  @override
  final String id;
  final String boardId;
  final String listId;
  @override
  final String position;
  final String title;
  final String description;
  final DateValue? start;
  final DateValue? due;
  final String priority;
  final bool completed;

  /// The day it was put on Today by hand. It stays there until done or taken off.
  final String? plannedFor;
  final String createdAt;
  final String updatedAt;
  final String? deletedAt;

  /// The clock of the last write to `due`, which says when that date was set.
  String? get dueClock => clocksOf(row)['due'];

  /// The same card with other values, for showing something that isn't saved (a held tick).
  TaskCard withFields(Json fields) => TaskCard({...row, ...fields});
}

class Notice {
  Notice(this.row)
    : id = row['id'] as String,
      cardId = row['cardId'] as String? ?? '',
      dueKey = row['dueKey'] as String? ?? '',
      title = row['title'] as String? ?? '',
      body = row['body'] as String? ?? '',
      createdAt = row['createdAt'] as String? ?? '',
      readAt = row['readAt'] as String?;

  final Json row;
  final String id;
  final String cardId;
  final String dueKey;
  final String title;
  final String body;
  final String createdAt;
  final String? readAt;
}
