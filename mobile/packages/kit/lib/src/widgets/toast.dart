import 'package:material_ui/material_ui.dart';

/// Give this to MaterialApp.scaffoldMessengerKey so toasts work from anywhere.
final kitMessengerKey = GlobalKey<ScaffoldMessengerState>();

abstract final class Toasts {
  /// [actionLabel] and [onAction] add a button such as "Undo".
  static void show(
    String message, {
    Duration duration = const Duration(seconds: 3),
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    final ScaffoldMessengerState? messenger;
    try {
      messenger = kitMessengerKey.currentState;
    } catch (_) {
      return; // no UI running (background work, tests)
    }
    if (messenger == null) return;
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          duration: duration,
          dismissDirection: DismissDirection.down,
          action: actionLabel == null || onAction == null
              ? null
              : SnackBarAction(label: actionLabel, onPressed: onAction),
        ),
      );
  }
}
