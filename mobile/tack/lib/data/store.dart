import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sqflite/sqflite.dart';

import 'dates.dart';
import 'db.dart';
import 'hlc.dart';
import 'ids.dart';
import 'merge.dart';
import 'model.dart';
import 'positions.dart';
import 'selection.dart';

export 'model.dart';

/// Overridden at startup.
final localDbProvider = Provider<LocalDb>((_) => throw UnimplementedError('localDbProvider'));

/// The time, as epoch ms. Tests and the screenshot tool pin it.
final wallClockProvider = Provider<int Function()>(
  (_) =>
      () => DateTime.now().millisecondsSinceEpoch,
);

/// Everything the phone holds, as one immutable snapshot the UI reads.
class Library {
  const Library({
    this.boards = const {},
    this.lists = const {},
    this.cards = const {},
    this.settings,
    this.notices = const {},
    this.outbox = const {},
    this.seq,
    this.epoch = 0,
  });

  final Map<String, Board> boards;
  final Map<String, BoardList> lists;
  final Map<String, TaskCard> cards;
  final Json? settings;
  final Map<String, Notice> notices;

  /// Changes waiting for the server: one entry per row, keyed `table:id`, oldest first.
  final Map<String, Json> outbox;

  /// The server's sequence number this phone has caught up to. Null until the first pull.
  final int? seq;
  final int epoch;

  /// False until the first pull has finished, so screens don't claim "nothing here" too early.
  bool get synced => seq != null;

  String get theme => themes.contains(settings?['theme']) ? settings!['theme'] as String : 'system';
  String get density => densities.contains(settings?['density']) ? settings!['density'] as String : 'compact';

  Json? row(String table, String id) => switch (table) {
    'boards' => boards[id]?.row,
    'lists' => lists[id]?.row,
    'cards' => cards[id]?.row,
    'settings' => id == settingsId ? settings : null,
    'notifications' => notices[id]?.row,
    _ => null,
  };

  Iterable<Json> rows(String table) => switch (table) {
    'boards' => boards.values.map((b) => b.row),
    'lists' => lists.values.map((l) => l.row),
    'cards' => cards.values.map((c) => c.row),
    'settings' => [?settings],
    'notifications' => notices.values.map((n) => n.row),
    _ => const [],
  };

  Library copyWith({
    Map<String, Board>? boards,
    Map<String, BoardList>? lists,
    Map<String, TaskCard>? cards,
    Json? settings,
    bool clearSettings = false,
    Map<String, Notice>? notices,
    Map<String, Json>? outbox,
    int? seq,
    bool clearSeq = false,
    int? epoch,
  }) => Library(
    boards: boards ?? this.boards,
    lists: lists ?? this.lists,
    cards: cards ?? this.cards,
    settings: clearSettings ? null : (settings ?? this.settings),
    notices: notices ?? this.notices,
    outbox: outbox ?? this.outbox,
    seq: clearSeq ? null : (seq ?? this.seq),
    epoch: epoch ?? this.epoch,
  );
}

/// A [Library] being changed: tables are copied only when first touched.
class _Draft {
  _Draft(this._base);
  final Library _base;
  Map<String, Board>? _boards;
  Map<String, BoardList>? _lists;
  Map<String, TaskCard>? _cards;
  Map<String, Notice>? _notices;
  Map<String, Json>? _outbox;
  Json? _settings;
  bool _settingsSet = false;

  Map<String, Json> get outbox => _outbox ??= Map.of(_base.outbox);
  Json? get settings => _settingsSet ? _settings : _base.settings;

  Json? row(String table, String id) => switch (table) {
    'boards' => (_boards ?? _base.boards)[id]?.row,
    'lists' => (_lists ?? _base.lists)[id]?.row,
    'cards' => (_cards ?? _base.cards)[id]?.row,
    'settings' => id == settingsId ? settings : null,
    'notifications' => (_notices ?? _base.notices)[id]?.row,
    _ => null,
  };

  void put(String table, Json row) {
    final id = row['id'] as String;
    switch (table) {
      case 'boards':
        (_boards ??= Map.of(_base.boards))[id] = Board(row);
      case 'lists':
        (_lists ??= Map.of(_base.lists))[id] = BoardList(row);
      case 'cards':
        (_cards ??= Map.of(_base.cards))[id] = TaskCard(row);
      case 'notifications':
        (_notices ??= Map.of(_base.notices))[id] = Notice(row);
      case 'settings':
        if (id == settingsId) {
          _settings = row;
          _settingsSet = true;
        }
    }
  }

  void remove(String table, String id) {
    switch (table) {
      case 'boards':
        (_boards ??= Map.of(_base.boards)).remove(id);
      case 'lists':
        (_lists ??= Map.of(_base.lists)).remove(id);
      case 'cards':
        (_cards ??= Map.of(_base.cards)).remove(id);
      case 'notifications':
        (_notices ??= Map.of(_base.notices)).remove(id);
      case 'settings':
        if (id == settingsId) {
          _settings = null;
          _settingsSet = true;
        }
    }
  }

  void clearRows() {
    _boards = {};
    _lists = {};
    _cards = {};
    _notices = {};
    _settings = null;
    _settingsSet = true;
  }

  Library build({int? seq, bool clearSeq = false, int? epoch}) => Library(
    boards: _boards ?? _base.boards,
    lists: _lists ?? _base.lists,
    cards: _cards ?? _base.cards,
    settings: settings,
    notices: _notices ?? _base.notices,
    outbox: _outbox ?? _base.outbox,
    seq: clearSeq ? null : (seq ?? _base.seq),
    epoch: epoch ?? _base.epoch,
  );
}

typedef InitialData = ({Library library, String node, int clockMs, int clockCounter});

/// What was on disk at startup (loaded before the first frame).
final initialDataProvider = Provider<InitialData>((_) => throw UnimplementedError('initialDataProvider'));

String outboxKey(String table, String id) => '$table:$id';

/// Loads the working copy from disk: everything the first frame needs.
Future<InitialData> loadInitial(LocalDb db) async {
  final all = await db.loadAll();
  var node = all.kv['node'];
  if (node == null) {
    node = newNodeId();
    await db.db.putKv('node', node);
  }
  final clock = all.kv['hlc'] == null ? null : jsonDecode(all.kv['hlc']!) as Map;
  Map<String, Json> t(String name) => all.rows[name] ?? const {};
  return (
    library: Library(
      boards: {for (final e in t('boards').entries) e.key: Board(e.value)},
      lists: {for (final e in t('lists').entries) e.key: BoardList(e.value)},
      cards: {for (final e in t('cards').entries) e.key: TaskCard(e.value)},
      settings: t('settings')[settingsId],
      notices: {for (final e in t('notifications').entries) e.key: Notice(e.value)},
      outbox: all.outbox,
      seq: int.tryParse(all.kv['seq'] ?? ''),
      epoch: int.tryParse(all.kv['epoch'] ?? '') ?? 0,
    ),
    node: node,
    clockMs: (clock?['ms'] as num?)?.toInt() ?? 0,
    clockCounter: (clock?['counter'] as num?)?.toInt() ?? 0,
  );
}

/// The phone's working copy and every write (web/src/data/store.ts and actions.ts, in Dart).
///
/// Every edit changes the in-memory [Library] at once (the UI never waits), then saves the row
/// and its queued change in one SQLite transaction, so an edit can't be applied and then lost.
/// Writes are serialized, so the disk follows memory in order.
class TackStore extends Notifier<Library> {
  late LocalDb _db;
  late HlcClock _clock;
  late int Function() _now;
  Future<void> _chain = Future.value();
  final _localChanges = StreamController<void>.broadcast();

  /// Fires after every local write (a sync is then scheduled).
  Stream<void> get localChanges => _localChanges.stream;

  @override
  Library build() {
    _db = ref.watch(localDbProvider);
    _now = ref.watch(wallClockProvider);
    final init = ref.watch(initialDataProvider);
    _clock = HlcClock(init.node, wall: _now, ms: init.clockMs, counter: init.clockCounter);
    ref.onDispose(_localChanges.close);
    return init.library;
  }

  /// Wait until every queued write is on disk.
  Future<void> get flushed => _chain;

  Future<void> _persist(Future<void> Function(Transaction tx) fn) {
    final next = _chain
        .catchError((_) {})
        .then(
          (_) => _db.db.transaction((tx) async {
            await fn(tx);
            final c = _clock.snapshot;
            await tx.putKv('hlc', jsonEncode({'ms': c.ms, 'counter': c.counter}));
          }),
        );
    _chain = next;
    return next;
  }

  String _iso() => DateTime.fromMillisecondsSinceEpoch(_now(), isUtc: true).toIso8601String();

  // ---------- the write path ----------

  /// One edit: stamps every field with the same clock, updates the row and queues the change.
  void _write(String table, String id, Json fields) {
    final clock = _clock.now();
    final clocks = {for (final f in fields.keys) f: clock};
    final existing = state.row(table, id);
    final row = <String, Object?>{
      ...?existing,
      ...fields,
      'id': id,
      'clocks': {...?(existing == null ? null : clocksOf(existing)), ...clocks},
    };
    final key = outboxKey(table, id);
    final queued = state.outbox[key];
    final entry = <String, Object?>{
      'table': table,
      'id': id,
      'fields': {...?(queued?['fields'] as Map?), ...fields},
      'clocks': {...?(queued == null ? null : clocksOf(queued)), ...clocks},
    };
    final draft = _Draft(state)..put(table, row);
    draft.outbox[key] = entry;
    state = draft.build();
    _persist((tx) async {
      await tx.putRow(table, row);
      await tx.putOutbox(key, entry);
    });
    if (!_localChanges.isClosed) _localChanges.add(null);
  }

  void insert(String table, String id, Json fields) => _write(table, id, fields);

  void update(String table, String id, Json fields) =>
      _write(table, id, {...fields, if (tablesWithUpdatedAt.contains(table)) 'updatedAt': _iso()});

  /// Deletes forever. Anything queued for the row is replaced, since it no longer matters.
  void purge(String table, String id) {
    final key = outboxKey(table, id);
    final entry = <String, Object?>{'table': table, 'id': id, 'fields': {}, 'clocks': {}, 'purge': true};
    final draft = _Draft(state)..remove(table, id);
    draft.outbox[key] = entry;
    state = draft.build();
    _persist((tx) async {
      await tx.deleteRow(table, id);
      await tx.putOutbox(key, entry);
    });
    if (!_localChanges.isClosed) _localChanges.add(null);
  }

  // ---------- actions (web/src/data/actions.ts) ----------

  Json _timestamps() {
    final now = _iso();
    return {'createdAt': now, 'updatedAt': now, 'deletedAt': null};
  }

  String createBoard({required String name, String? emoji, String color = 'neutral'}) {
    final id = newId(_now());
    final boards = state.boards.values.toList()..sort(byPosition);
    insert('boards', id, {
      'name': name,
      'emoji': emoji,
      'color': color,
      'showCompleted': false,
      'position': positionAtEnd(boards),
      ..._timestamps(),
    });
    return id;
  }

  void updateBoard(String id, Json fields) => update('boards', id, fields);
  void trashBoard(String id) => update('boards', id, {'deletedAt': _iso()});
  void restoreBoard(String id) => update('boards', id, {'deletedAt': null});

  String createList(String boardId, String name) {
    final id = newId(_now());
    final lists = state.lists.values.where((l) => l.boardId == boardId).toList()..sort(byPosition);
    insert('lists', id, {'boardId': boardId, 'name': name, 'position': positionAtEnd(lists), ..._timestamps()});
    return id;
  }

  void updateList(String id, Json fields) => update('lists', id, fields);
  void trashList(String id) => update('lists', id, {'deletedAt': _iso()});
  void restoreList(String id) => update('lists', id, {'deletedAt': null});

  List<TaskCard> _cardsIn(String listId) =>
      state.cards.values.where((c) => c.listId == listId).toList()..sort(byPosition);

  String createCard(String boardId, String listId, String title, {DateValue? due}) {
    final id = newId(_now());
    insert('cards', id, {
      'boardId': boardId,
      'listId': listId,
      'position': positionAtEnd(_cardsIn(listId)),
      'title': title,
      'description': '',
      'start': null,
      'due': due?.toJson(),
      'priority': 'none',
      'completed': false,
      'completedAt': null,
      'plannedFor': null,
      ..._timestamps(),
    });
    return id;
  }

  void updateCard(String id, Json fields) => update('cards', id, fields);

  void setCardCompleted(String id, bool completed) =>
      update('cards', id, {'completed': completed, 'completedAt': completed ? _iso() : null});

  void trashCard(String id) => update('cards', id, {'deletedAt': _iso()});
  void restoreCard(String id) => update('cards', id, {'deletedAt': null});

  /// Moves a card to the end of another list of its board.
  void moveCardToList(String id, String listId) =>
      updateCard(id, {'listId': listId, 'position': positionAtEnd(_cardsIn(listId).where((c) => c.id != id).toList())});

  /// Brings an item back from Trash. Lists and boards bring their cards with them.
  void restoreFromTrash(TrashKind kind, String id) {
    if (kind == TrashKind.board) return restoreBoard(id);
    if (kind == TrashKind.list) return restoreList(id);
    final card = state.cards[id];
    if (card == null) return;
    final plan = cardRestorePlan(card, state.lists.values.where((l) => l.boardId == card.boardId));
    if (plan.inPlace) return restoreCard(id);
    final listId = plan.listId ?? createList(card.boardId, 'Restored');
    update('cards', id, {'listId': listId, 'position': positionAtEnd(_cardsIn(listId)), 'deletedAt': null});
  }

  void purgeForever(TrashKind kind, String id) => purge(trashTable[kind]!, id);

  /// Plans cards for a day, or takes them off with null. Returns what each had before, for
  /// Undo. Cards already planned for an earlier day keep that day, so "Planned 3 days ago"
  /// stays true.
  Map<String, String?> setPlanned(Iterable<String> ids, String? day) {
    final before = <String, String?>{};
    for (final id in ids) {
      final card = state.cards[id];
      if (card == null) continue;
      final current = card.plannedFor;
      before[id] = current;
      final next = day != null && current != null && current.compareTo(day) <= 0 ? current : day;
      if (next != current) update('cards', id, {'plannedFor': next});
    }
    return before;
  }

  /// Puts back what [setPlanned] returned.
  void restorePlanned(Map<String, String?> before) {
    for (final e in before.entries) {
      update('cards', e.key, {'plannedFor': e.value});
    }
  }

  void markNoticesRead(Iterable<String> ids) {
    final readAt = _iso();
    for (final id in ids) {
      update('notifications', id, {'readAt': readAt});
    }
  }

  void setTheme(String theme) => update('settings', settingsId, {'theme': theme});
  void setDensity(String density) => update('settings', settingsId, {'density': density});

  // ---------- sync (web/src/data/engine.ts) ----------

  /// The next changes to send, oldest first.
  List<Json> outboxBatch(int limit) => state.outbox.values.take(limit).toList();

  void syncWall(int serverMs) => _clock.syncWall(serverMs);

  /// What the server holds replaces the local row, except for fields still queued here.
  void _applyServerRow(_Draft d, List<Future<void> Function(Transaction)> writes, String table, String id, Json? row) {
    final key = outboxKey(table, id);
    final queued = d.outbox[key];
    if (queued?['purge'] == true) return;
    if (row == null) {
      if (queued != null) {
        d.outbox.remove(key);
        writes.add((tx) => tx.deleteOutbox(key));
      }
      d.remove(table, id);
      writes.add((tx) => tx.deleteRow(table, id));
      return;
    }
    final merged = <String, Object?>{
      ...row,
      ...?(queued?['fields'] as Map?)?.cast<String, Object?>(),
      'clocks': {...clocksOf(row), ...?(queued == null ? null : clocksOf(queued))},
    };
    d.put(table, merged);
    writes.add((tx) => tx.putRow(table, merged));
  }

  /// After a push: clears what the server received, keeping anything edited again while the
  /// request ran, and takes the server's row for every change it refused.
  Future<void> acknowledge(List<Json> sent, List<Object?> rejected) {
    final d = _Draft(state);
    final writes = <Future<void> Function(Transaction)>[];
    for (final s in sent) {
      final key = outboxKey(s['table'] as String, s['id'] as String);
      final current = d.outbox[key];
      if (current == null) continue;
      if (s['purge'] == true) {
        d.outbox.remove(key);
        writes.add((tx) => tx.deleteOutbox(key));
        continue;
      }
      final fields = Map<String, Object?>.from(current['fields'] as Map? ?? const {});
      final clocks = clocksOf(current);
      for (final e in clocksOf(s).entries) {
        if (clocks[e.key] == e.value) {
          fields.remove(e.key);
          clocks.remove(e.key);
        }
      }
      if (clocks.isEmpty) {
        d.outbox.remove(key);
        writes.add((tx) => tx.deleteOutbox(key));
      } else {
        final entry = <String, Object?>{...current, 'fields': fields, 'clocks': clocks};
        d.outbox[key] = entry;
        writes.add((tx) => tx.putOutbox(key, entry));
      }
    }
    for (final r in rejected) {
      final m = r as Map;
      final table = m['table'] as String;
      final id = m['id'] as String;
      final key = outboxKey(table, id);
      if (d.outbox.remove(key) != null) writes.add((tx) => tx.deleteOutbox(key));
      final row = m['row'];
      _applyServerRow(d, writes, table, id, row == null ? null : Map<String, Object?>.from(row as Map));
    }
    state = d.build();
    return _persist((tx) async {
      for (final w in writes) {
        await w(tx);
      }
    });
  }

  /// Applies one pull, with its cursor, in a single transaction: either all of it is on disk
  /// with the new cursor, or none of it and the next pull asks again.
  Future<void> applyPull(Json res) {
    final d = _Draft(state);
    final writes = <Future<void> Function(Transaction)>[];
    final rows = res['rows'] as Map? ?? const {};
    for (final table in tableNames) {
      for (final r in rows[table] as List? ?? const []) {
        final row = Map<String, Object?>.from(r as Map);
        for (final clock in clocksOf(row).values) {
          _clock.observe(clock);
        }
        _applyServerRow(d, writes, table, row['id'] as String, row);
      }
    }
    for (final t in res['tombstones'] as List? ?? const []) {
      final table = (t as Map)['table'] as String;
      final id = t['id'] as String;
      final key = outboxKey(table, id);
      if (d.outbox.remove(key) != null) writes.add((tx) => tx.deleteOutbox(key));
      d.remove(table, id);
      writes.add((tx) => tx.deleteRow(table, id));
    }
    final seq = (res['seq'] as num).toInt();
    final epoch = (res['epoch'] as num?)?.toInt() ?? 0;
    state = d.build(seq: seq, epoch: epoch);
    return _persist((tx) async {
      for (final w in writes) {
        await w(tx);
      }
      await tx.putKv('seq', '$seq');
      await tx.putKv('epoch', '$epoch');
    });
  }

  /// The server went back to a backup, so its data is now the truth and everything newer here
  /// is gone with it. Edits still queued stay queued, and go out on the next run.
  Future<void> forgetSyncedRows() {
    final d = _Draft(state)..clearRows();
    state = d.build();
    return _persist((tx) => tx.delete('rows'));
  }

  /// A different server: nothing from the old one may stay.
  Future<void> reset() {
    state = const Library();
    return _persist((tx) async {
      await tx.delete('rows');
      await tx.delete('outbox');
      await tx.deleteKv('seq');
      await tx.deleteKv('epoch');
      await tx.deleteKv('notify');
    });
  }

  // ---------- small device-only values ----------

  /// A JSON value kept on this phone only (the notification log).
  Future<Object?> readLocal(String key) async {
    await flushed;
    final r = await _db.db.query('kv', where: 'key = ?', whereArgs: [key]);
    return r.isEmpty ? null : jsonDecode(r.first['value'] as String);
  }

  Future<void> writeLocal(String key, Object? value) => _persist((tx) => tx.putKv(key, jsonEncode(value)));
}

final storeProvider = NotifierProvider<TackStore, Library>(TackStore.new);
