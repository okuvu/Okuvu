import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';
import 'notification_settings_notifier.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(notificationSettingsProvider);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/settings');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () => context.go('/settings'),
          ),
          title: const OkuvuAppBarTitle('Notifications'),
        ),
        body: settings.isLoading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                children: [
                  SwitchListTile(
                    key: const ValueKey('appointment_reminders_toggle'),
                    secondary: const Icon(LucideIcons.calendar),
                    title: const Text('Appointment reminders'),
                    subtitle: const Text("We'll let you know before a session"),
                    value: settings.appointmentRemindersEnabled,
                    onChanged: (v) => ref
                        .read(notificationSettingsProvider.notifier)
                        .setAppointmentReminders(v),
                    activeThumbColor: AppColors.violet,
                    inactiveTrackColor: AppColors.hairline,
                  ),
                  SwitchListTile(
                    key: const ValueKey('chat_nudges_toggle'),
                    secondary: const Icon(LucideIcons.messageCircle),
                    title: const Text('Chat nudges'),
                    subtitle: const Text('Gentle check-in reminders'),
                    value: settings.chatNudgesEnabled,
                    onChanged: (v) => ref
                        .read(notificationSettingsProvider.notifier)
                        .setChatNudges(v),
                    activeThumbColor: AppColors.violet,
                    inactiveTrackColor: AppColors.hairline,
                  ),
                ],
              ),
      ),
    );
  }
}
