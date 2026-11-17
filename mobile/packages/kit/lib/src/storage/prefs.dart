import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';

/// Per-device preferences (theme, last used values). Not secrets: those go in the keystore.
class Prefs extends Notifier<Map<String, Object?>> {
  static const _key = 'prefs';

  @override
  Map<String, Object?> build() {
    final raw = ref.watch(jsonStoreProvider).read(_key);
    return raw is Map ? Map<String, Object?>.from(raw) : <String, Object?>{};
  }

  void set(String key, Object? value) {
    if (state[key] == value) return;
    state = {...state, key: value};
    ref.read(jsonStoreProvider).write(_key, state);
  }
}

final prefsProvider = NotifierProvider<Prefs, Map<String, Object?>>(Prefs.new);

/// A single string preference, e.g. `ref.watch(prefProvider('displayCurrency'))`.
final prefProvider = Provider.family<String?, String>(
  (ref, key) => ref.watch(prefsProvider.select((p) => p[key] as String?)),
);

const themeModePref = 'themeMode';

final themeModeProvider = Provider<ThemeMode>((ref) {
  return switch (ref.watch(prefProvider(themeModePref))) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };
});
