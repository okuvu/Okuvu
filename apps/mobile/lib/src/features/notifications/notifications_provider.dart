import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// One row from the client's inbox (`GET /users/me/notifications`).
///
/// The title and body are authored on the server and stored with the row, so
/// they read the same on every device and do not change when the app's wording
/// changes. Nothing clinical is in either string — see
/// `packages/shared-types/notifications.ts` for the rules.
class ClientNotification {
  final String id;
  final String kind;
  final String title;
  final String body;
  final String? homeworkId;
  final String? appointmentId;
  final DateTime? readAt;
  final DateTime createdAt;

  const ClientNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    this.homeworkId,
    this.appointmentId,
    this.readAt,
    required this.createdAt,
  });

  bool get isUnread => readAt == null;

  factory ClientNotification.fromJson(Map<String, dynamic> json) {
    return ClientNotification(
      id: json['id'] as String,
      kind: json['kind'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
      homeworkId: json['homeworkId'] as String?,
      appointmentId: json['appointmentId'] as String?,
      readAt: json['readAt'] != null
          ? DateTime.parse(json['readAt'] as String)
          : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class NotificationsPage {
  final List<ClientNotification> notifications;
  final int unreadCount;

  const NotificationsPage({
    required this.notifications,
    required this.unreadCount,
  });

  factory NotificationsPage.fromJson(Map<String, dynamic> json) {
    final raw = json['notifications'] as List<dynamic>? ?? [];
    return NotificationsPage(
      notifications: raw
          .map((n) => ClientNotification.fromJson(n as Map<String, dynamic>))
          .toList(),
      unreadCount: json['unreadCount'] as int? ?? 0,
    );
  }
}

/// The inbox itself. Pull, not push: this is empty-but-current until a delivery
/// channel exists, which is why the app also has a bell rather than relying on
/// the OS to announce anything.
final notificationsProvider =
    FutureProvider.autoDispose<NotificationsPage>((ref) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get('/users/me/notifications');
  return NotificationsPage.fromJson(response.data as Map<String, dynamic>);
});

/// Badge count on its own, so Home can refresh the number without pulling the
/// list it is not showing.
final unreadNotificationCountProvider =
    FutureProvider.autoDispose<int>((ref) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get('/users/me/notifications/unread-count');
  return (response.data as Map<String, dynamic>)['unreadCount'] as int? ?? 0;
});

class NotificationReadNotifier extends Notifier<void> {
  @override
  void build() {}

  /// Mark one row read. Optimistically refreshes both the list and the badge;
  /// a failure leaves the row unread rather than pretending it was read.
  Future<bool> markRead(String id) async {
    final dio = ref.read(dioClientProvider);
    try {
      await dio.post('/users/me/notifications/$id/read');
      ref.invalidate(notificationsProvider);
      ref.invalidate(unreadNotificationCountProvider);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> markAllRead() async {
    final dio = ref.read(dioClientProvider);
    try {
      await dio.post('/users/me/notifications/read-all');
      ref.invalidate(notificationsProvider);
      ref.invalidate(unreadNotificationCountProvider);
      return true;
    } catch (_) {
      return false;
    }
  }
}

final notificationReadProvider =
    NotifierProvider<NotificationReadNotifier, void>(NotificationReadNotifier.new);
