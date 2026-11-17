import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'fake_server.dart';
import 'vectors_test.dart' show text;

/// The fake server the convergence tests run against must answer exactly like the real one.
/// test/vectors.json holds what server/src/sync.ts (applyChanges, pullChanges) answered to 20
/// random runs of pushes and pulls: valid and invalid rows, wrong clocks, purges, tombstones.
void main() {
  final scenarios = (jsonDecode(File('test/vectors.json').readAsStringSync()) as Map)['server'] as List;

  Map<String, Object?> byId(Object? rows) => {for (final r in rows as List? ?? const []) (r as Map)['id'] as String: r};

  for (var i = 0; i < scenarios.length; i++) {
    test('scenario $i: every push and pull answers like the real server', () {
      final server = FakeTack();
      var pushes = 0;
      for (final step in scenarios[i] as List) {
        switch (step['op']) {
          case 'push':
            final res = server.applyChanges(step['changes'] as List, step['now'] as int);
            expect(text(res), text(step['response']), reason: 'push ${pushes++}: ${jsonEncode(step['changes'])}');
          case 'pull':
            final res = server.pullChanges(step['since'] as int, step['now'] as int);
            final want = step['response'] as Map;
            expect(res['seq'], want['seq']);
            expect(res['epoch'], want['epoch']);
            expect(res['serverTime'], want['serverTime']);
            final rows = res['rows'] as Map;
            final wantRows = want['rows'] as Map;
            expect(rows.keys.toSet(), wantRows.keys.toSet());
            for (final table in wantRows.keys) {
              expect(text(byId(rows[table])), text(byId(wantRows[table])), reason: '$table since ${step['since']}');
            }
            expect(
              {for (final t in res['tombstones'] as List) '${t['table']}:${t['id']}'},
              {for (final t in want['tombstones'] as List) '${t['table']}:${t['id']}'},
            );
          case 'serverWrite':
            server.serverWrite(step['table'] as String, Map<String, Object?>.from(step['row'] as Map));
        }
      }
    });
  }
}
