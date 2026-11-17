import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kit/kit.dart';
import 'package:kit/testing.dart';

const conn = ServerConnection(
  baseUrl: 'https://cairn.example.com',
  clientId: 'abc.access',
  clientSecret: 's3cret',
);

Future<ApiException> failure(Future<dynamic> call) async {
  try {
    await call;
  } on ApiException catch (e) {
    return e;
  }
  fail('expected an ApiException');
}

void main() {
  group('ServerConnection', () {
    test('normalizes addresses', () {
      expect(ServerConnection.normalizeUrl(' cairn.example.com/ '), 'https://cairn.example.com');
      expect(ServerConnection.normalizeUrl('http://10.0.0.2:8080//'), 'http://10.0.0.2:8080');
      expect(ServerConnection.validateUrl(''), isNotNull);
      expect(ServerConnection.validateUrl('ftp://x'), isNotNull);
      expect(ServerConnection.validateUrl('cairn.example.com'), isNull);
    });

    test('sends the service token only when both halves are present', () {
      expect(conn.authHeaders, {
        'CF-Access-Client-Id': 'abc.access',
        'CF-Access-Client-Secret': 's3cret',
      });
      expect(const ServerConnection(baseUrl: 'https://x', clientId: 'a').authHeaders, isEmpty);
    });

    test('setup string round-trips, and loose header lines are understood', () {
      final back = ServerConnection.parseSetup(conn.toSetupString())!;
      expect([back.baseUrl, back.clientId, back.clientSecret], [
        conn.baseUrl,
        conn.clientId,
        conn.clientSecret,
      ]);
      final loose = ServerConnection.parseSetup(
        'CF-Access-Client-Id: abc.access\nCF-Access-Client-Secret: s3cret\nhttps://cairn.example.com/',
      )!;
      expect(loose.clientId, 'abc.access');
      expect(loose.clientSecret, 's3cret');
      expect(loose.baseUrl, 'https://cairn.example.com');
      expect(ServerConnection.parseSetup('hello'), isNull);
      expect(ServerConnection.parseSetup('{broken'), isNull);
    });
  });

  group('ApiClient', () {
    late FakeAdapter adapter;
    late List<ApiFailure?> outcomes;
    ApiClient client({ServerConnection? connection = conn}) => ApiClient(
      connection: () => connection,
      dio: fakeDio(adapter),
      onOutcome: outcomes.add,
    );

    setUp(() {
      outcomes = [];
      adapter = FakeAdapter((_, _) => const FakeResponse(200, {'status': 'ok'}));
    });

    test('sends the service token on every request and never follows redirects', () async {
      final json = await client().get('/api/health', query: {'a': 1, 'skip': null, 'empty': ''});
      expect(json, {'status': 'ok'});
      final req = adapter.requests.single;
      expect(req.uri.toString(), 'https://cairn.example.com/api/health?a=1');
      expect(req.headers['CF-Access-Client-Id'], 'abc.access');
      expect(req.headers['CF-Access-Client-Secret'], 's3cret');
      expect(req.followRedirects, isFalse);
      expect(outcomes, [null]);
    });

    test('a redirect to the Access login is "access denied", not "offline"', () async {
      adapter.handler = (_, _) => const FakeResponse(302, '', {
        'location': 'https://team.cloudflareaccess.com/cdn-cgi/access/login/cairn.example.com',
      });
      final e = await failure(client().get('/api/goal'));
      expect(e.kind, ApiFailure.accessDenied);
      expect(adapter.requests, hasLength(1), reason: 'the redirect must not be followed');
      expect(outcomes, [ApiFailure.accessDenied]);
    });

    test('401, 403 and an Access login page are access denied', () async {
      for (final res in const [
        FakeResponse(401, '<html>Forbidden</html>'),
        FakeResponse(403, '<html>Forbidden</html>'),
        FakeResponse(200, '<html><title>Sign in ・ Cloudflare Access</title></html>'),
      ]) {
        adapter.handler = (_, _) => res;
        expect((await failure(client().get('/api/goal'))).kind, ApiFailure.accessDenied);
      }
    });

    test('gateway errors mean the server is down', () async {
      for (final status in [502, 503, 504, 521, 530]) {
        adapter.handler = (_, _) => FakeResponse(status, '<html>error</html>');
        expect((await failure(client().get('/api/goal'))).kind, ApiFailure.serverDown);
      }
    });

    test('no route to the server is a network failure that provably sent nothing', () async {
      adapter.handler = (_, _) => throw const FakeOffline();
      final e = await failure(client().get('/api/goal'));
      expect(e.kind, ApiFailure.network);
      expect(e.isTransient, isTrue);
      expect(e.maybeDelivered, isFalse);
    });

    test('a timeout after sending may have been delivered', () async {
      adapter.handler = (_, _) => throw const FakeLostResponse();
      final e = await failure(client().post('/api/transactions', body: {'x': 1}));
      expect(e.kind, ApiFailure.network);
      expect(e.maybeDelivered, isTrue);
    });

    test('API validation errors carry the message and the fields', () async {
      adapter.handler = (_, _) => const FakeResponse(400, {
        'error': 'Choose a category',
        'fields': {'categoryId': 'Choose a category'},
      });
      final e = await failure(client().post('/api/transactions', body: {'x': 1}));
      expect(e.kind, ApiFailure.http);
      expect(e.status, 400);
      expect(e.message, 'Choose a category');
      expect(e.fields, {'categoryId': 'Choose a category'});
      expect(e.isTransient, isFalse);
      expect(outcomes, [ApiFailure.http]);
    });

    test('a page that is not the API is a bad response', () async {
      adapter.handler = (_, _) => const FakeResponse(200, '<html>Welcome to nginx</html>');
      expect((await failure(client().get('/api/health'))).kind, ApiFailure.badResponse);
      adapter.handler = (_, _) => const FakeResponse(404, '<html>Not found</html>');
      expect((await failure(client().get('/api/health'))).kind, ApiFailure.badResponse);
    });

    test('without a saved connection nothing is sent', () async {
      final e = await failure(client(connection: null).get('/api/goal'));
      expect(e.kind, ApiFailure.notConfigured);
      expect(adapter.requests, isEmpty);
    });

    test('getText returns files as text', () async {
      adapter.handler = (_, _) => const FakeResponse(200, 'id,date\r\n1,2026-01-01\r\n');
      expect(await client().getText('/api/export', query: {'format': 'csv'}), startsWith('id,date'));
    });
  });

  group('NetStatus', () {
    test('tracks reachability from request outcomes', () {
      final c = ProviderContainer();
      addTearDown(c.dispose);
      final net = c.read(netStatusProvider.notifier);
      expect(c.read(netStatusProvider), NetState.unknown);
      net.report(ApiFailure.network);
      expect(c.read(netStatusProvider), NetState.offline);
      net.report(ApiFailure.accessDenied);
      expect(c.read(netStatusProvider), NetState.accessDenied);
      net.report(ApiFailure.http); // the server answered, so it is reachable
      expect(c.read(netStatusProvider), NetState.ok);
      net.report(ApiFailure.serverDown);
      expect(c.read(netStatusProvider), NetState.serverDown);
      net.report(null);
      expect(c.read(netStatusProvider), NetState.ok);
    });
  });

  group('storage', () {
    late Directory dir;
    setUp(() => dir = Directory.systemTemp.createTempSync('kit_test'));
    tearDown(() => dir.deleteSync(recursive: true));

    test('JsonStore keeps the last write and survives a broken file', () async {
      final store = JsonStore(dir);
      expect(store.read('x'), isNull);
      store.write('x', {'n': 1});
      await store.write('x', {'n': 2});
      expect(JsonStore(dir).read('x'), {'n': 2});
      File('${dir.path}/bad.json').writeAsStringSync('{not json');
      expect(store.read('bad'), isNull);
      await store.delete('x');
      expect(store.read('x'), isNull);
    });

    test('prefs persist and drive the theme mode', () async {
      final c = ProviderContainer(overrides: KitBoot.memory(dir).overrides);
      addTearDown(c.dispose);
      expect(c.read(themeModeProvider).name, 'system');
      c.read(prefsProvider.notifier).set(themeModePref, 'dark');
      expect(c.read(themeModeProvider).name, 'dark');
      await c.read(jsonStoreProvider).write('noop', 1); // let the prefs write land
      final again = ProviderContainer(overrides: KitBoot.memory(dir).overrides);
      addTearDown(again.dispose);
      expect(again.read(prefProvider(themeModePref)), 'dark');
    });
  });

  group('Outbox', () {
    late Directory dir;
    late ProviderContainer c;
    setUp(() {
      dir = Directory.systemTemp.createTempSync('kit_outbox');
      c = ProviderContainer(overrides: KitBoot.memory(dir).overrides);
    });
    tearDown(() {
      c.dispose();
      dir.deleteSync(recursive: true);
    });

    OutboxOp op(String id) =>
        OutboxOp(id: id, kind: 'k', payload: {'n': id}, createdAt: DateTime(2026, 1, 1));

    test('sends in order and reports when something landed', () async {
      final sent = <String>[];
      var landed = 0;
      final outbox = c.read(outboxProvider.notifier)
        ..configure(executor: (o) async => sent.add(o.id), onSent: () => landed++);
      outbox
        ..add(op('a'))
        ..add(op('b'))
        ..add(op('c'));
      await outbox.flush();
      expect(sent, ['a', 'b', 'c']);
      expect(c.read(outboxProvider), isEmpty);
      expect(landed, 1);
    });

    test('a transient failure keeps everything queued, in order', () async {
      final sent = <String>[];
      var online = false;
      final outbox = c.read(outboxProvider.notifier)
        ..configure(
          executor: (o) async {
            if (!online) throw const ApiException(ApiFailure.network, 'offline');
            sent.add(o.id);
          },
        );
      outbox
        ..add(op('a'))
        ..add(op('b'));
      await outbox.flush();
      expect(sent, isEmpty);
      expect([for (final o in c.read(outboxProvider)) (o.id, o.attempts)], [('a', 1), ('b', 0)]);

      online = true;
      await outbox.flush();
      expect(sent, ['a', 'b']);
      expect(c.read(outboxProvider), isEmpty);
    });

    test('a send that provably never arrived does not count as an attempt', () async {
      final seen = <int>[];
      var mode = 'no-route';
      final outbox = c.read(outboxProvider.notifier)
        ..configure(
          executor: (o) async {
            seen.add(o.attempts);
            if (mode == 'no-route') {
              throw const ApiException(ApiFailure.network, 'offline', maybeDelivered: false);
            }
            if (mode == 'timeout') throw const ApiException(ApiFailure.network, 'timeout');
          },
        );
      outbox.add(op('a'));
      await outbox.flush();
      expect(c.read(outboxProvider).single.attempts, 0);
      mode = 'timeout';
      await outbox.flush();
      expect(c.read(outboxProvider).single.attempts, 1, reason: 'the server may have it');
      mode = 'ok';
      await outbox.flush();
      expect(seen, [0, 0, 1], reason: 'the last send knows an earlier one may have landed');
      expect(c.read(outboxProvider), isEmpty);
    });

    test('a refusal parks that change and lets the rest through', () async {
      final sent = <String>[];
      final outbox = c.read(outboxProvider.notifier)
        ..configure(
          executor: (o) async {
            if (o.id == 'a') {
              throw const ApiException(ApiFailure.http, 'Unknown category', status: 400);
            }
            sent.add(o.id);
          },
        );
      outbox
        ..add(op('a'))
        ..add(op('b'));
      await outbox.flush();
      expect(sent, ['b']);
      final left = c.read(outboxProvider).single;
      expect(left.id, 'a');
      expect(left.error, 'Unknown category');
      expect(outbox.pendingCount, 0);
    });

    test('a server error is retried, then parked so it cannot block the queue', () async {
      final outbox = c.read(outboxProvider.notifier)
        ..configure(
          executor: (o) async => throw const ApiException(ApiFailure.http, 'boom', status: 500),
        );
      outbox.add(op('a'));
      await outbox.flush();
      await outbox.flush();
      expect(c.read(outboxProvider).single.failed, isFalse);
      await outbox.flush();
      expect(c.read(outboxProvider).single.failed, isTrue);
    });

    test('the queue survives a restart', () async {
      c.read(outboxProvider.notifier)
        ..add(op('a'))
        ..add(op('b'));
      await c.read(jsonStoreProvider).write('noop', 1);
      final again = ProviderContainer(overrides: KitBoot.memory(dir).overrides);
      addTearDown(again.dispose);
      await again.read(jsonStoreProvider).write('noop', 1);
      expect([for (final o in again.read(outboxProvider)) o.id], ['a', 'b']);
      expect(again.read(outboxProvider).first.payload, {'n': 'a'});
    });
  });
}
