import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:path_provider/path_provider.dart';

import 'app.dart';
import 'data/dates.dart';
import 'data/db.dart';
import 'data/store.dart';
import 'notify/local_notifier.dart';
import 'notify/notifier.dart';

Future<void> main() async {
  // Loads the saved connection and every board, list and card from SQLite, so the first frame
  // already shows them. The network is only used after that.
  final boot = await KitBoot.start();
  final support = await getApplicationSupportDirectory();
  final db = await LocalDb.open('${support.path}/tack.db');
  final initial = await loadInitial(db);
  zone; // The time zone database, needed for "today".
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  runApp(
    ProviderScope(
      overrides: [
        ...boot.overrides,
        localDbProvider.overrideWithValue(db),
        initialDataProvider.overrideWithValue(initial),
        dueNotifierProvider.overrideWithValue(LocalNotifier()),
      ],
      child: const TackApp(),
    ),
  );
}
