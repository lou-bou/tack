import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:material_ui/material_ui.dart';

import 'data/api.dart';
import 'data/store.dart';
import 'ui/shell.dart';
import 'ui/theme.dart';
import 'ui/widgets/logo.dart';

class TackApp extends ConsumerWidget {
  const TackApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final connected = ref.watch(connectionProvider.select((c) => c != null));
    // A different server means different boards: never mix one server's data with another's.
    ref.listen(connectionProvider.select((c) => c?.baseUrl), (previous, next) {
      if (previous != null && previous != next) ref.read(storeProvider.notifier).reset();
    });
    return MaterialApp(
      title: 'Tack',
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
      scaffoldMessengerKey: kitMessengerKey,
      theme: tackTheme(Brightness.light),
      darkTheme: tackTheme(Brightness.dark),
      themeMode: ref.watch(tackThemeModeProvider),
      home: connected
          ? const Shell()
          : Builder(
              builder: (context) => AnnotatedRegion<SystemUiOverlayStyle>(
                value: overlayStyle(context.kit, Theme.of(context).brightness),
                child: const ConnectionScreen(
                  appName: 'Tack',
                  healthPath: TackApi.healthPath,
                  isHealthy: TackApi.isHealthy,
                  firstRun: true,
                  header: LogoLockup(),
                ),
              ),
            ),
    );
  }
}
