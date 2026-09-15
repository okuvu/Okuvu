import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import 'appointments_provider.dart';
import '../../widgets/okuvu_app_bar_title.dart';

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
                              color: theme.colorScheme.errorContainer,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              'This session was cancelled.',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: theme.colorScheme.onErrorContainer,
                              ),
                            ),
                          ),
                        ],
                        if (appointment.rescheduledFrom != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            'Rescheduled from an earlier time.',
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
                                    title: const Text("Can't make it?"),
                                    content: Text(
                                      'Sessions can only be changed by ${appointment.therapistName ?? 'your therapist'}. '
                                      'Please reach out to them directly to reschedule or cancel.',
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
                              child: const Text("Can't make it?"),
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
