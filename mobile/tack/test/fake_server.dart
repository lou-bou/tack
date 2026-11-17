import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:kit/kit.dart';
import 'package:kit/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:tack/data/db.dart';
import 'package:tack/data/hlc.dart';
import 'package:tack/data/merge.dart';
import 'package:tack/data/store.dart';
import 'package:tack/notify/notifier.dart';
import 'package:tack/ui/state.dart';

const testConnection = ServerConnection(baseUrl: 'https://tack.test', clientId: 'id.access', clientSecret: 'secret');

/// The fields of each synced table (shared/src/schema.ts).
const tableFields = <String, List<String>>{
  'boards': ['name', 'emoji', 'color', 'showCompleted', 'position', 'createdAt', 'updatedAt', 'deletedAt'],
  'lists': ['boardId', 'name', 'position', 'createdAt', 'updatedAt', 'deletedAt'],
  'cards': [
    'boardId',
    'listId',
    'position',
    'title',
    'description',
    'start',
    'due',
    'priority',
    'completed',
    'completedAt',
    'plannedFor',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ],
  'settings': ['theme', 'density', 'updatedAt'],
  'notifications': ['cardId', 'dueKey', 'title', 'body', 'createdAt', 'readAt'],
};

final _isoTime = RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$');
final _day = RegExp(r'^\d{4}-\d{2}-\d{2}$');
final _time = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');

bool _text(Object? v) => v is String && v.isNotEmpty;
bool _iso(Object? v) => v is String && _isoTime.hasMatch(v);
bool _isoOrNull(Object? v) => v == null || _iso(v);
bool _dateValue(Object? v) {
  if (v == null) return true;
  if (v is! Map) return false;
  final date = v['date'];
  final time = v['time'];
  return date is String &&
      _day.hasMatch(date) &&
      v.containsKey('time') &&
      (time == null || (time is String && _time.hasMatch(time)));
}

/// The Zod schemas of shared/src/schema.ts, as plain checks. A field that may be null must
/// still be there: a row missing one is not a whole row.
bool validRow(String table, Json r) {
  if (!tableFields[table]!.every(r.containsKey)) return false;
  switch (table) {
    case 'boards':
      return _text(r['name']) &&
          (r['emoji'] == null || r['emoji'] is String) &&
          boardColors.contains(r['color']) &&
          r['showCompleted'] is bool &&
          _text(r['position']) &&
          _iso(r['createdAt']) &&
          _iso(r['updatedAt']) &&
          _isoOrNull(r['deletedAt']);
    case 'lists':
      return _text(r['boardId']) &&
          _text(r['name']) &&
          _text(r['position']) &&
          _iso(r['createdAt']) &&
          _iso(r['updatedAt']) &&
          _isoOrNull(r['deletedAt']);
    case 'cards':
      final planned = r['plannedFor'];
      return _text(r['boardId']) &&
          _text(r['listId']) &&
          _text(r['position']) &&
          _text(r['title']) &&
          r['description'] is String &&
          _dateValue(r['start']) &&
          _dateValue(r['due']) &&
          priorities.contains(r['priority']) &&
          r['completed'] is bool &&
          _isoOrNull(r['completedAt']) &&
          (planned == null || (planned is String && _day.hasMatch(planned))) &&
          _iso(r['createdAt']) &&
          _iso(r['updatedAt']) &&
          _isoOrNull(r['deletedAt']);
    case 'settings':
      return themes.contains(r['theme']) && densities.contains(r['density']) && _iso(r['updatedAt']);
    case 'notifications':
      return _text(r['cardId']) &&
          _text(r['dueKey']) &&
          r['title'] is String &&
          r['body'] is String &&
          _iso(r['createdAt']) &&
          _isoOrNull(r['readAt']);
  }
  return false;
}

/// An in-memory Tack server: server/src/sync.ts (applyChanges, pullChanges, purge) in Dart, and
/// checked against the real one by test/fake_server_test.dart. With switches for the failures
/// the app must survive.
class FakeTack {
  FakeTack({int Function()? now}) : now = now ?? (() => DateTime.now().millisecondsSinceEpoch) {
    adapter = FakeAdapter(_handle);
    // A new server already holds the settings row (server/src/db/migrations.ts).
    tables['settings']!['settings'] = {
      'id': 'settings',
      'theme': 'system',
      'density': 'compact',
      'updatedAt': '2026-01-01T00:00:00.000Z',
      'clocks': <String, String>{},
    };
    _rowSeq['settings']!['settings'] = 1;
  }

  late final FakeAdapter adapter;
  int Function() now;

  final Map<String, Map<String, Json>> tables = {for (final t in tableNames) t: {}};
  final Map<String, Map<String, int>> _rowSeq = {for (final t in tableNames) t: {}};
  final List<({String table, String id, int seq})> tombstones = [];
  int seq = 1;
  int epoch = 0;
  int protocol = protocolVersion;

  bool offline = false;
  bool accessDenied = false;

  /// The next push is applied but its answer is lost.
  bool loseNextPush = false;

  /// The next push never reaches the server.
  bool dropNextPush = false;

  int pushes = 0;
  int pulls = 0;

  Json? row(String table, String id) => tables[table]![id];

  bool _tombstoned(String table, String id) => tombstones.any((t) => t.table == table && t.id == id);

  void _write(String table, Json row, int s) {
    final id = row['id'] as String;
    tables[table]![id] = {'id': id, for (final f in tableFields[table]!) f: row[f], 'clocks': clocksOf(row)};
    _rowSeq[table]![id] = s;
  }

  /// A row the server makes itself, like a "due tomorrow" notification.
  void serverWrite(String table, Json row) => _write(table, row, ++seq);

  void _remove(String table, String id, int s) {
    tables[table]!.remove(id);
    _rowSeq[table]!.remove(id);
    tombstones.removeWhere((t) => t.table == table && t.id == id);
    tombstones.add((table: table, id: id, seq: s));
  }

  /// Deletes forever. A list takes the cards that went to Trash with it; a board everything.
  void _purge(String table, String id, int s) {
    if (table == 'lists') {
      final ids = [
        for (final c in tables['cards']!.values)
          if (c['listId'] == id && c['deletedAt'] == null) c['id'] as String,
      ];
      for (final c in ids) {
        _remove('cards', c, s);
      }
    }
    if (table == 'boards') {
      final cards = [
        for (final c in tables['cards']!.values)
          if (c['boardId'] == id) c['id'] as String,
      ];
      for (final c in cards) {
        _remove('cards', c, s);
      }
      final lists = [
        for (final l in tables['lists']!.values)
          if (l['boardId'] == id) l['id'] as String,
      ];
      for (final l in lists) {
        _remove('lists', l, s);
      }
    }
    _remove(table, id, s);
  }

  Json applyChanges(List<Object?> changes, int now) {
    final rejected = <Json>[];
    int? s;
    int nextSeq() => s ??= ++seq;
    for (final c in changes) {
      final change = Map<String, Object?>.from(c as Map);
      final table = change['table'] as String;
      final id = change['id'] as String;
      if (_tombstoned(table, id)) {
        rejected.add({'table': table, 'id': id, 'row': null});
        continue;
      }
      final existing = tables[table]![id];
      if (change['purge'] == true) {
        if (const ['boards', 'lists', 'cards'].contains(table)) {
          _purge(table, id, nextSeq());
        } else {
          rejected.add({'table': table, 'id': id, 'row': existing});
        }
        continue;
      }
      // Devices can only mark notifications read. The server creates them.
      final allowed = table == 'notifications' ? const ['readAt'] : tableFields[table]!;
      final clocks = {
        for (final e in clocksOf(change).entries)
          if (allowed.contains(e.key)) e.key: clampHlc(e.value, now),
      };
      final merged = mergeChange(existing, {...change, 'clocks': clocks});
      if (!merged.changed) continue;
      final row = <String, Object?>{if (table == 'cards') 'plannedFor': null, ...merged.row};
      if (!validRow(table, row)) {
        rejected.add({'table': table, 'id': id, 'row': existing});
        continue;
      }
      _write(table, row, nextSeq());
    }
    return {'seq': s ?? seq, 'serverTime': now, 'rejected': rejected};
  }

  Json pullChanges(int since, int now) {
    final rows = <String, Object?>{};
    for (final t in tableNames) {
      final found = [
        for (final e in tables[t]!.entries)
          if (_rowSeq[t]![e.key]! > since) e.value,
      ];
      if (found.isNotEmpty) rows[t] = found;
    }
    return {
      'epoch': epoch,
      'seq': seq,
      'serverTime': now,
      'rows': rows,
      'tombstones': [
        for (final t in tombstones)
          if (t.seq > since) {'table': t.table, 'id': t.id},
      ],
    };
  }

  /// backup/restore.sh: the data goes back to an older copy and the epoch changes.
  void restoreFrom(FakeTack backup, {required int newEpoch}) {
    for (final t in tableNames) {
      tables[t]!
        ..clear()
        ..addAll({for (final e in backup.tables[t]!.entries) e.key: Map<String, Object?>.from(e.value)});
      _rowSeq[t]!
        ..clear()
        ..addAll(backup._rowSeq[t]!);
    }
    tombstones
      ..clear()
      ..addAll(backup.tombstones);
    seq = backup.seq;
    epoch = newEpoch;
  }

  /// A copy of the data as it is now, to restore from later.
  FakeTack snapshot() => FakeTack()..restoreFrom(this, newEpoch: epoch);

  Future<FakeResponse> _handle(RequestOptions r, Object? body) async {
    if (offline) throw const FakeOffline();
    if (accessDenied) return const FakeResponse(302, '', {'location': 'https://x.cloudflareaccess.com/login'});
    final path = r.uri.path;
    if (path == '/api/health') return const FakeResponse(200, {'ok': true});
    if (path == '/api/sync/push' && r.method == 'POST') {
      if (dropNextPush) {
        dropNextPush = false;
        throw const FakeOffline();
      }
      final b = body as Map;
      if (b['protocol'] != protocol) return FakeResponse(426, {'protocol': protocol});
      pushes++;
      final res = applyChanges(b['changes'] as List, now());
      if (loseNextPush) {
        loseNextPush = false;
        throw const FakeLostResponse();
      }
      return FakeResponse(200, res);
    }
    if (path == '/api/sync/pull') {
      if (int.parse(r.uri.queryParameters['protocol'] ?? '0') != protocol) {
        return FakeResponse(426, {'protocol': protocol});
      }
      pulls++;
      return FakeResponse(200, pullChanges(int.parse(r.uri.queryParameters['since'] ?? '0'), now()));
    }
    return const FakeResponse(404, {'error': 'Not found'});
  }

  Dio dio() => fakeDio(adapter);
}

/// One simulated phone: its own database and providers.
class Client {
  Client._(this.container, this.db, this.notifier);
  final ProviderContainer container;
  final LocalDb db;
  final FakeNotifier notifier;

  static Future<Client> start(
    FakeTack server,
    Directory dir, {
    String name = 'a',
    bool connected = true,
    int Function()? clock,
    List<Override> extra = const [],
    bool splash = false,
  }) async {
    sqfliteFfiInit();
    final db = await LocalDb.open('${dir.path}/$name.db', factory: databaseFactoryFfi);
    final init = await loadInitial(db);
    final boot = KitBoot.memory(
      Directory('${dir.path}/$name-kit')..createSync(recursive: true),
      connection: connected ? testConnection : null,
    );
    final notifier = FakeNotifier();
    final overrides = <Override>[
      ...boot.overrides,
      dioProvider.overrideWithValue(server.dio()),
      localDbProvider.overrideWithValue(db),
      initialDataProvider.overrideWithValue(init),
      networkRegainedProvider.overrideWithValue(const Stream.empty()),
      dueNotifierProvider.overrideWithValue(notifier),
      if (clock != null) wallClockProvider.overrideWithValue(clock),
      splashProvider.overrideWithValue(splash),
      ...extra,
    ];
    return Client._(ProviderContainer(overrides: overrides), db, notifier);
  }

  TackStore get store => container.read(storeProvider.notifier);
  Library get lib => container.read(storeProvider);

  Future<void> dispose() async {
    await store.flushed;
    container.dispose();
    await db.close();
  }
}
