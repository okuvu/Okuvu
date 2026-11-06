import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';
import 'notification_settings_notifier.dart';
import 'settings_save_feedback.dart';

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
          title: const OkuvuAppBarTitle('Notification settings'),
        ),
        body: settings.isLoading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                children: [
                  // The switches below were inert until this build: they saved a
                  // preference nothing read. Appointment rows are now gated by
                  // the first one at write time, so say where things land rather
                  // than leaving a client to guess.
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
                    child: Text(
                      'Updates from your therapist appear under Notifications, the bell on your Home screen.',
                    ),
                  ),
                  SwitchListTile(
                    key: const ValueKey('appointment_reminders_toggle'),
                    secondary: const Icon(LucideIcons.calendar),
                    title: const Text('Appointment reminders'),
                    subtitle: const Text(
                      'New, moved and cancelled sessions appear in Notifications',
                    ),
                    value: settings.appointmentRemindersEnabled,
                    onChanged: (v) async {
                      final saved = await ref
                          .read(notificationSettingsProvider.notifier)
                          .setAppointmentReminders(v);
                      if (!saved && context.mounted) {
                        showSettingsSaveFailure(context, 'Appointment reminders');
                      }
                    },
                    activeThumbColor: AppColors.violet,
                    inactiveTrackColor: AppColors.hairline,
                  ),
                  SwitchListTile(
                    key: const ValueKey('chat_nudges_toggle'),
                    secondary: const Icon(LucideIcons.messageCircle),
                    title: const Text('Chat nudges'),
                    subtitle: const Text('Gentle check-in reminders'),
                    value: settings.chatNudgesEnabled,
                    onChanged: (v) async {
                      final saved = await ref
                          .read(notificationSettingsProvider.notifier)
                          .setChatNudges(v);
                      if (!saved && context.mounted) {
                        showSettingsSaveFailure(context, 'Chat nudges');
                      }
                    },
                    activeThumbColor: AppColors.violet,
                    inactiveTrackColor: AppColors.hairline,
                  ),
                ],
              ),
      ),
    );
  }
}
