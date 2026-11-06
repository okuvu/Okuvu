import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../theme/app_colors.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import 'notifications_provider.dart';

/// "2h ago", "Yesterday", "6 Nov" — short enough for a trailing label.
///
/// Deliberately based on the device clock and local timezone: the row's
/// createdAt is an instant, and "when did this reach me" is a local question.
String formatNotificationAge(DateTime createdAt, {DateTime? now}) {
  final current = now ?? DateTime.now();
  final local = createdAt.toLocal();
  final diff = current.difference(local);

  if (diff.inMinutes < 1) return 'Just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays == 1) return 'Yesterday';
  if (diff.inDays < 7) return '${diff.inDays}d ago';

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${local.day} ${months[local.month - 1]}';
}

IconData _iconForKind(String kind) {
  switch (kind) {
    case 'homework_assigned':
      return LucideIcons.bookOpen;
    case 'reminder_set':
      return LucideIcons.bellRing;
    case 'appointment_booked':
    case 'appointment_rescheduled':
    case 'appointment_cancelled':
      return LucideIcons.calendar;
    default:
      // An unknown kind from a newer server build is still a real row; show it
      // with a neutral icon rather than dropping it.
      return LucideIcons.bell;
  }
}

/// The client's inbox — what the Home bell opens.
///
/// This is the surface the therapist's homework, reminders and appointments now
/// land in. Every row is a record the server wrote when the therapist acted; the
/// list is a pull, so it is current as of the last time this screen (or Home's
/// badge) refreshed.
class NotificationsInboxScreen extends ConsumerWidget {
  const NotificationsInboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final inbox = ref.watch(notificationsProvider);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/home');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () => context.go('/home'),
          ),
          title: const OkuvuAppBarTitle('Notifications'),
          actions: [
            if ((inbox.asData?.value.unreadCount ?? 0) > 0)
              TextButton(
                onPressed: () =>
                    ref.read(notificationReadProvider.notifier).markAllRead(),
                child: const Text('Mark all read'),
              ),
          ],
        ),
        body: inbox.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(LucideIcons.cloudOff, size: 32),
                  const SizedBox(height: 12),
                  Text(
                    "We couldn't load your notifications.",
                    style: theme.textTheme.bodyMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => ref.invalidate(notificationsProvider),
                    child: const Text('Try again'),
                  ),
                ],
              ),
            ),
          ),
          data: (page) {
            if (page.notifications.isEmpty) {
              return RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(notificationsProvider);
                  await ref.read(notificationsProvider.future).catchError(
                        (_) => const NotificationsPage(
                          notifications: [],
                          unreadCount: 0,
                        ),
                      );
                },
                child: ListView(
                  children: [
                    const SizedBox(height: 80),
                    Icon(
                      LucideIcons.bellOff,
                      size: 32,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(height: 12),
                    Center(
                      child: Text(
                        'Nothing yet',
                        style: theme.textTheme.titleSmall,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 32),
                      child: Text(
                        'When your therapist adds homework, a reminder or an appointment, it appears here.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ],
                ),
              );
            }

            return RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(notificationsProvider);
                await ref.read(notificationsProvider.future).catchError(
                      (_) => const NotificationsPage(
                        notifications: [],
                        unreadCount: 0,
                      ),
                    );
              },
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: page.notifications.length,
                separatorBuilder: (_, __) => const Divider(
                  height: 1,
                  color: AppColors.hairline,
                ),
                itemBuilder: (context, index) {
                  final item = page.notifications[index];
                  return _NotificationTile(notification: item);
                },
              ),
            );
          },
        ),
      ),
    );
  }
}

class _NotificationTile extends ConsumerWidget {
  const _NotificationTile({required this.notification});

  final ClientNotification notification;

  Future<void> _open(BuildContext context, WidgetRef ref) async {
    // Marking read is a courtesy, not a gate: if it fails the client still gets
    // to the thing they tapped.
    if (notification.isUnread) {
      await ref.read(notificationReadProvider.notifier).markRead(notification.id);
    }

    if (!context.mounted) return;

    if (notification.homeworkId != null) {
      context.go('/homework');
    } else if (notification.appointmentId != null) {
      context.go('/appointments/${notification.appointmentId}');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final unread = notification.isUnread;
    final tappable =
        notification.homeworkId != null || notification.appointmentId != null;

    return ListTile(
      key: ValueKey('notification_${notification.id}'),
      onTap: tappable ? () => _open(context, ref) : null,
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: unread ? AppColors.lavenderWash : AppColors.oat,
          shape: BoxShape.circle,
        ),
        child: Icon(
          _iconForKind(notification.kind),
          size: 20,
          color: unread ? AppColors.violet : AppColors.inkSoft,
        ),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              notification.title,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: unread ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ),
          Text(
            formatNotificationAge(notification.createdAt),
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          if (unread) ...[
            const SizedBox(width: 6),
            Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                color: AppColors.violet,
                shape: BoxShape.circle,
              ),
            ),
          ],
        ],
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Text(
          notification.body,
          maxLines: 3,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ),
      trailing: tappable
          ? const Icon(LucideIcons.chevronRight, size: 16)
          : null,
    );
  }
}
