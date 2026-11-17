import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Shows and schedules notifications on the phone. The real one is in local_notifier.dart;
/// tests use [FakeNotifier].
abstract class DueNotifier {
  /// Prepares the plugin. [onOpen] is called with a card id when a notification is tapped.
  Future<void> init(void Function(String cardId) onOpen);

  /// The card whose notification started the app, if that is how it was opened.
  Future<String?> launchCard();

  /// Whether the phone lets this app show notifications.
  Future<bool> allowed();

  /// Asks for permission. False when the user said no.
  Future<bool> request();

  Future<void> schedule({
    required int id,
    required int atMs,
    required String title,
    required String body,
    required String cardId,
  });

  Future<void> show({required int id, required String title, required String body, String? cardId});

  Future<void> cancel(int id);
}

class FakeNotifier implements DueNotifier {
  final Map<int, ({int atMs, String title, String body, String cardId})> scheduled = {};
  final List<({String title, String body, String? cardId})> shown = [];
  bool permission = true;
  void Function(String cardId)? onOpen;

  @override
  Future<void> init(void Function(String cardId) onOpen) async => this.onOpen = onOpen;

  @override
  Future<String?> launchCard() async => null;

  @override
  Future<bool> allowed() async => permission;

  @override
  Future<bool> request() async => permission;

  @override
  Future<void> schedule({
    required int id,
    required int atMs,
    required String title,
    required String body,
    required String cardId,
  }) async {
    scheduled[id] = (atMs: atMs, title: title, body: body, cardId: cardId);
  }

  @override
  Future<void> show({required int id, required String title, required String body, String? cardId}) async {
    shown.add((title: title, body: body, cardId: cardId));
  }

  @override
  Future<void> cancel(int id) async => scheduled.remove(id);
}

/// Overridden at startup with the real notifier.
final dueNotifierProvider = Provider<DueNotifier>((_) => FakeNotifier());
