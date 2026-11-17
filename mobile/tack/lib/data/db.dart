import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import 'merge.dart';

/// The phone's working copy in SQLite: every synced row as JSON with its field clocks, the
/// outbox of changes waiting for the server (one entry per row), and small key/values (clock,
/// cursor, epoch, notification log).
class LocalDb {
  LocalDb(this.db);
  final Database db;

  static const version = 1;

  static Future<LocalDb> open(String path, {DatabaseFactory? factory}) async {
    final f = factory ?? databaseFactory;
    final db = await f.openDatabase(
      path,
      options: OpenDatabaseOptions(
        version: version,
        onConfigure: (db) async {
          await db.rawQuery('PRAGMA journal_mode = WAL');
        },
        onCreate: (db, _) async {
          final b = db.batch();
          b.execute(
            'CREATE TABLE rows (tbl TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, '
            'PRIMARY KEY (tbl, id))',
          );
          b.execute('CREATE TABLE outbox (key TEXT PRIMARY KEY, data TEXT NOT NULL)');
          b.execute('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
          await b.commit(noResult: true);
        },
      ),
    );
    return LocalDb(db);
  }

  Future<void> close() => db.close();

  /// Everything, for the first frame.
  Future<({Map<String, Map<String, Json>> rows, Map<String, Json> outbox, Map<String, String> kv})> loadAll() async {
    final rows = <String, Map<String, Json>>{};
    for (final r in await db.query('rows')) {
      rows.putIfAbsent(r['tbl'] as String, () => {})[r['id'] as String] = Map<String, Object?>.from(
        jsonDecode(r['data'] as String) as Map,
      );
    }
    final outbox = <String, Json>{};
    for (final r in await db.query('outbox', orderBy: 'rowid')) {
      outbox[r['key'] as String] = Map<String, Object?>.from(jsonDecode(r['data'] as String) as Map);
    }
    final kv = {for (final r in await db.query('kv')) r['key'] as String: r['value'] as String};
    return (rows: rows, outbox: outbox, kv: kv);
  }
}

/// Writes inside one transaction.
extension Writes on DatabaseExecutor {
  Future<void> putRow(String table, Json row) => insert('rows', {
    'tbl': table,
    'id': row['id'],
    'data': jsonEncode(row),
  }, conflictAlgorithm: ConflictAlgorithm.replace);

  Future<void> deleteRow(String table, String id) =>
      delete('rows', where: 'tbl = ? AND id = ?', whereArgs: [table, id]);

  /// Keeps the entry's place in the queue when it is edited again.
  Future<void> putOutbox(String key, Json entry) => rawInsert(
    'INSERT INTO outbox (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data',
    [key, jsonEncode(entry)],
  );

  Future<void> deleteOutbox(String key) => delete('outbox', where: 'key = ?', whereArgs: [key]);

  Future<void> putKv(String key, String value) =>
      insert('kv', {'key': key, 'value': value}, conflictAlgorithm: ConflictAlgorithm.replace);

  Future<void> deleteKv(String key) => delete('kv', where: 'key = ?', whereArgs: [key]);
}
