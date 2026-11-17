import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;

import '../data/dates.dart';
import 'notifier.dart';

/// Notifications shown and scheduled by Android itself (flutter_local_notifications). No push
/// service: the alarms live on the phone and survive restarts (the boot receiver in
/// AndroidManifest.xml puts them back).
class LocalNotifier implements DueNotifier {
  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;

  AndroidFlutterLocalNotificationsPlugin? get _android =>
      _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

  static const _details = NotificationDetails(
    android: AndroidNotificationDetails(
      'due',
      'Due dates',
      channelDescription: 'A card is due tomorrow',
      importance: Importance.high,
      priority: Priority.high,
      icon: 'ic_notification',
      category: AndroidNotificationCategory.reminder,
    ),
    iOS: DarwinNotificationDetails(),
  );

  @override
  Future<void> init(void Function(String cardId) onOpen) async {
    if (_ready) return;
    zone; // Loads the time zone database.
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('ic_notification'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: (r) {
        final card = r.payload;
        if (card != null && card.isNotEmpty) onOpen(card);
      },
    );
    _ready = true;
  }

  @override
  Future<String?> launchCard() async {
    final details = await _plugin.getNotificationAppLaunchDetails();
    if (details == null || !details.didNotificationLaunchApp) return null;
    final card = details.notificationResponse?.payload;
    return card == null || card.isEmpty ? null : card;
  }

  @override
  Future<bool> allowed() async => await _android?.areNotificationsEnabled() ?? false;

  @override
  Future<bool> request() async {
    final android = _android;
    if (android == null) return false;
    final ok = await android.requestNotificationsPermission() ?? false;
    return ok;
  }

  @override
  Future<void> schedule({
    required int id,
    required int atMs,
    required String title,
    required String body,
    required String cardId,
  }) async {
    final exact = await _android?.canScheduleExactNotifications() ?? false;
    await _plugin.zonedSchedule(
      id: id,
      scheduledDate: tz.TZDateTime.fromMillisecondsSinceEpoch(tz.UTC, atMs),
      notificationDetails: _details,
      // Without the exact-alarm permission Android may run it a few minutes late.
      androidScheduleMode: exact ? AndroidScheduleMode.exactAllowWhileIdle : AndroidScheduleMode.inexactAllowWhileIdle,
      title: title,
      body: body,
      payload: cardId,
    );
  }

  @override
  Future<void> show({required int id, required String title, required String body, String? cardId}) =>
      _plugin.show(id: id, title: title, body: body, notificationDetails: _details, payload: cardId);

  @override
  Future<void> cancel(int id) => _plugin.cancel(id: id);
}
