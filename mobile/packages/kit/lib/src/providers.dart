import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

import 'api/api_client.dart';
import 'api/connection.dart';
import 'api/net_status.dart';
import 'storage/json_store.dart';

/// Overridden at startup by [KitBoot.overrides].
final jsonStoreProvider = Provider<JsonStore>(
  (_) => throw UnimplementedError('jsonStoreProvider is overridden at startup'),
);
final connectionStoreProvider = Provider<ConnectionStore>(
  (_) => throw UnimplementedError('connectionStoreProvider is overridden at startup'),
);
final _initialConnectionProvider = Provider<ServerConnection?>((_) => null);

/// The saved server connection, or null until the user sets one up.
class ConnectionController extends Notifier<ServerConnection?> {
  @override
  ServerConnection? build() => ref.watch(_initialConnectionProvider);

  Future<void> save(ServerConnection connection) async {
    await ref.read(connectionStoreProvider).save(connection);
    state = connection;
  }

  Future<void> clear() async {
    await ref.read(connectionStoreProvider).clear();
    state = null;
  }
}

final connectionProvider = NotifierProvider<ConnectionController, ServerConnection?>(
  ConnectionController.new,
);

/// The HTTP layer. Tests override this with a fake.
final dioProvider = Provider<Dio>((_) => Dio());

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    dio: ref.watch(dioProvider),
    connection: () => ref.read(connectionProvider),
    onOutcome: (failure) => ref.read(netStatusProvider.notifier).report(failure),
  );
});

/// Fires whenever the phone regains a network, as a cue to sync. A hint only: whether the server
/// is actually reachable is decided by real requests (see [netStatusProvider]).
final networkRegainedProvider = Provider<Stream<void>>((ref) {
  return Connectivity().onConnectivityChanged
      .where((results) => results.any((r) => r != ConnectivityResult.none))
      .map((_) {});
});

/// Everything that has to be loaded before the first frame.
class KitBoot {
  KitBoot({required this.store, required this.connectionStore, required this.connection});

  final JsonStore store;
  final ConnectionStore connectionStore;
  final ServerConnection? connection;

  List<Override> get overrides => [
    jsonStoreProvider.overrideWithValue(store),
    connectionStoreProvider.overrideWithValue(connectionStore),
    _initialConnectionProvider.overrideWithValue(connection),
  ];

  static Future<KitBoot> start() async {
    WidgetsFlutterBinding.ensureInitialized();
    final support = await getApplicationSupportDirectory();
    final store = JsonStore(Directory('${support.path}/kit'));
    final connectionStore = SecureConnectionStore();
    return KitBoot(
      store: store,
      connectionStore: connectionStore,
      connection: await connectionStore.load(),
    );
  }

  /// For tests: in-memory secrets and a temp folder.
  static KitBoot memory(Directory dir, {ServerConnection? connection}) => KitBoot(
    store: JsonStore(dir),
    connectionStore: MemoryConnectionStore(connection),
    connection: connection,
  );
}
