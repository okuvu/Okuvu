import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import 'appointments_provider.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';

const Map<String, String> _modeLabels = {
  'video': 'Video call',
  'phone': 'Phone call',
  'in_person': 'In person',
};

String _formatFullDateTime(DateTime dt) {
  final local = dt.toLocal();
  const weekdays = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  ];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  final hour = local.hour;
  final minute = local.minute.toString().padLeft(2, '0');
  final period = hour >= 12 ? 'pm' : 'am';
  final displayHour = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
  return '${weekdays[local.weekday - 1]}, ${local.day} ${months[local.month - 1]} · $displayHour:$minute $period';
}

// Decisions doc round, 15 Sep 2026 §10 — the short "Thu 18 Sep, 7:00 pm"
// form used in the cancelled/rescheduled copy, distinct from the headline's
// full-weekday format above.
String _formatShortDateTime(DateTime dt) {
  final local = dt.toLocal();
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  final hour = local.hour;
  final minute = local.minute.toString().padLeft(2, '0');
  final period = hour >= 12 ? 'pm' : 'am';
  final displayHour = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
  return '${weekdays[local.weekday - 1]} ${local.day} ${months[local.month - 1]}, $displayHour:$minute $period';
}

/// Decisions doc round, 15 Sep 2026 §10 — T-24h reminder copy, stored for
/// whenever push infra exists (FCM stays out of scope this round; no
/// delivery mechanism is built). Not sent anywhere yet.
String appointmentCancelledPushCopy(DateTime scheduledAt) {
  return 'Your session ${_formatShortDateTime(scheduledAt)} is off. '
      "You don't need to do anything.";
}

String _icsDateTime(DateTime dt) {
  final utc = dt.toUtc();
  String pad(int n) => n.toString().padLeft(2, '0');
  return '${utc.year}${pad(utc.month)}${pad(utc.day)}T${pad(utc.hour)}${pad(utc.minute)}${pad(utc.second)}Z';
}

/// App wireframes A3 — "Session detail," strictly read-only (I10/I11): no
/// edit/reschedule/cancel controls exist here at all. "Can't make it?" is a
/// contact prompt, not a cancellation action — the app has no
/// therapist-messaging feature to route it through.
class AppointmentDetailScreen extends ConsumerWidget {
  const AppointmentDetailScreen({super.key, required this.appointmentId});

  final String appointmentId;

  Future<void> _addToCalendar(BuildContext context, AppointmentView a) async {
    final end = a.scheduledAt.add(Duration(minutes: a.durationMinutes));
    final summary = 'OKUVU session with ${a.therapistName ?? 'your therapist'}';
    final ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:${a.id}@okuvu.in',
      'DTSTAMP:${_icsDateTime(DateTime.now())}',
      'DTSTART:${_icsDateTime(a.scheduledAt)}',
      'DTEND:${_icsDateTime(end)}',
      'SUMMARY:$summary',
      if (a.location != null && a.location!.isNotEmpty) 'LOCATION:${a.location}',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    final uri = Uri.parse('data:text/calendar;charset=utf8,${Uri.encodeComponent(ics)}');
    final launched = await launchUrl(uri);
    if (!launched && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't open your calendar app.")),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final appointment = ref.watch(appointmentByIdProvider(appointmentId));
    final isLoading = ref.watch(appointmentsProvider).isLoading;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/appointments');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () => context.go('/appointments'),
          ),
          title: const OkuvuAppBarTitle('Session'),
        ),
        body: isLoading
            ? const Center(child: CircularProgressIndicator())
            : appointment == null
                ? Center(
                    child: Text(
                      "Couldn't find that session.",
                      style: theme.textTheme.bodyLarge,
                    ),
                  )
                : SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _formatFullDateTime(appointment.scheduledAt),
                          style: theme.textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${_modeLabels[appointment.mode] ?? appointment.mode} · ${appointment.durationMinutes} minutes',
                          style: theme.textTheme.bodyLarge?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        if (appointment.cancelledAt != null) ...[
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              // Decisions doc round, 15 Sep 2026 §10 — no red/
                              // alarming state, ever. A neutral surface, not
                              // an errorContainer.
                              color: theme.colorScheme.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: AppColors.lavenderTint,
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: const Text(
                                        'Called off',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.royalPurple,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  'Your session on ${_formatShortDateTime(appointment.scheduledAt)} was called off. Nothing you need to do.',
                                  style: theme.textTheme.bodyMedium,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Want another time? Let ${appointment.therapistName ?? 'your therapist'} know and she\'ll sort it.',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        if (appointment.rescheduledFrom != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            'Moved to ${_formatShortDateTime(appointment.scheduledAt)}. Same place.',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                        ],
                        if (appointment.noteToClient != null &&
                            appointment.noteToClient!.isNotEmpty) ...[
                          const SizedBox(height: 24),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'A note from ${appointment.therapistName ?? 'your therapist'}',
                                  style: theme.textTheme.labelMedium?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(appointment.noteToClient!, style: theme.textTheme.bodyMedium),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 24),
                        if (appointment.cancelledAt == null) ...[
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton.icon(
                              onPressed: () => _addToCalendar(context, appointment),
                              icon: const Icon(LucideIcons.calendar),
                              label: const Text('Add to my calendar'),
                            ),
                          ),
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: TextButton(
                              onPressed: () {
                                showDialog<void>(
                                  context: context,
                                  builder: (context) => AlertDialog(
                                    content: Text(
                                      "Let ${appointment.therapistName ?? 'your therapist'} know you can't make it — "
                                      "she'll sort a new time. This won't cancel anything on its own.",
                                    ),
                                    actions: [
                                      TextButton(
                                        onPressed: () => Navigator.of(context).pop(),
                                        child: const Text('OK'),
                                      ),
                                    ],
                                  ),
                                );
                              },
                              child: Text('tell ${appointment.therapistName ?? 'your therapist'} ›'),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
      ),
    );
  }
}
