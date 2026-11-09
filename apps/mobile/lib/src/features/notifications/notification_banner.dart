import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../router/router.dart';
import '../../theme/app_colors.dart';
import 'notification_popup.dart';
import 'notifications_provider.dart';

/// App-wide host for the new-arrival banner.
///
/// Mounted once, in `App`'s `MaterialApp.router` builder, inside the same `Stack`
/// as the crisis and care-ended slots — and *below* both in the stack, so a
/// safety overlay always wins over a homework announcement.
///
/// It owns the lifecycle half of delivery: polling runs while the app is in the
/// foreground and stops when it is not, and a resume reads immediately because
/// "the therapist assigned something while the phone was in my pocket" is the
/// case this exists for. The read/pop decision itself lives in
/// [NotificationPopupNotifier].
class NotificationPopupSlot extends ConsumerStatefulWidget {
  const NotificationPopupSlot({super.key});

  @override
  ConsumerState<NotificationPopupSlot> createState() =>
      _NotificationPopupSlotState();
}

class _NotificationPopupSlotState extends ConsumerState<NotificationPopupSlot>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState lifecycle) {
    final notifier = ref.read(notificationPopupProvider.notifier);
    if (lifecycle == AppLifecycleState.resumed) {
      notifier.start(immediate: true);
    } else {
      notifier.stop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = ref.watch(notificationPopupProvider);
    if (pending == null) return const SizedBox.shrink();

    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          // Keyed by id so a second arrival re-runs the entrance animation
          // instead of silently swapping the text inside a settled widget.
          child: _NotificationBanner(
            key: ValueKey('notification_banner_${pending.id}'),
            notification: pending,
          ),
        ),
      ),
    );
  }
}

class _NotificationBanner extends ConsumerWidget {
  const _NotificationBanner({super.key, required this.notification});

  final ClientNotification notification;

  /// Open what the row points at.
  ///
  /// Navigation goes through [routerProvider] rather than `context.go`: this
  /// widget sits above the Navigator (in `MaterialApp.builder`), where the
  /// router's inherited scope is not an ancestor.
  void _open(BuildContext context, WidgetRef ref) {
    final id = notification.id;
    ref.read(notificationPopupProvider.notifier).dismiss(id: id);
    // Marking read is a courtesy, never a gate: if it fails the client still
    // lands on the thing they tapped.
    unawaited(ref.read(notificationReadProvider.notifier).markRead(id));

    final router = ref.read(routerProvider);
    if (notification.homeworkId != null) {
      router.go('/homework');
    } else if (notification.appointmentId != null) {
      router.go('/appointments/${notification.appointmentId}');
    } else {
      router.go('/notifications');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Semantics(
      liveRegion: true,
      container: true,
      label: '${notification.title}. ${notification.body}',
      child: TweenAnimationBuilder<double>(
        tween: Tween<double>(begin: 0, end: 1),
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeOutCubic,
        builder: (context, value, child) => Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, -16 * (1 - value)),
            child: child,
          ),
        ),
        child: Material(
          color: Colors.transparent,
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.oatElevated,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.lilac),
              boxShadow: [
                BoxShadow(
                  color: AppColors.royalNight.withValues(alpha: 0.14),
                  blurRadius: 18,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: InkWell(
              key: const ValueKey('notification_banner'),
              borderRadius: BorderRadius.circular(16),
              onTap: () => _open(context, ref),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: const BoxDecoration(
                        color: AppColors.lavenderWash,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        LucideIcons.bellRing,
                        size: 18,
                        color: AppColors.violet,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            notification.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            notification.body,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            notification.homeworkId != null
                                ? 'View task'
                                : 'View',
                            style: theme.textTheme.labelMedium?.copyWith(
                              color: AppColors.violet,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Semantics(
                      button: true,
                      label: 'Dismiss notification',
                      child: IconButton(
                        key: const ValueKey('notification_banner_dismiss'),
                        icon: const Icon(LucideIcons.x, size: 16),
                        color: theme.colorScheme.onSurfaceVariant,
                        // No `tooltip:` here on purpose: this slot lives in
                        // `MaterialApp.builder`, above the Navigator, so there
                        // is no Overlay ancestor and a Tooltip throws
                        // "No Overlay widget found" mid-build.
                        onPressed: () => ref
                            .read(notificationPopupProvider.notifier)
                            .dismiss(id: notification.id),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
