import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'appointments_provider.dart';
import '../../widgets/okuvu_app_bar_title.dart';

const Map<String, String> _modeLabels = {
  'video': 'Video',
  'phone': 'Phone',
  'in_person': 'In person',
};

String _formatDateTime(DateTime dt) {
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
  return '${weekdays[local.weekday - 1]} ${local.day} ${months[local.month - 1]} · $displayHour:$minute $period';
}

/// App wireframes A2 — "Your sessions": Upcoming / Earlier, read-only.
/// The client can't create, reschedule, or cancel from here (I10/I11) —
/// that stays entirely on the therapist portal.
class AppointmentsScreen extends ConsumerWidget {
  const AppointmentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final appointmentsAsync = ref.watch(appointmentsProvider);

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
          title: const OkuvuAppBarTitle('Your sessions'),
        ),
        body: appointmentsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => Center(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(LucideIcons.alertCircle, size: 48),
                  const SizedBox(height: 12),
                  Text('Could not load your sessions.', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => ref.invalidate(appointmentsProvider),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
          data: (data) {
            if (data.upcoming.isEmpty && data.past.isEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(
                    'No sessions scheduled yet.',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            }

            return ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              children: [
                if (data.upcoming.isNotEmpty) ...[
                  Text('Upcoming', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  ...data.upcoming.map((a) => _AppointmentTile(appointment: a)),
                  const SizedBox(height: 20),
                ],
                if (data.past.isNotEmpty) ...[
                  Text('Earlier', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  ...data.past.map((a) => _AppointmentTile(appointment: a)),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _AppointmentTile extends StatelessWidget {
  const _AppointmentTile({required this.appointment});

  final AppointmentView appointment;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isCancelled = appointment.cancelledAt != null;

    return GestureDetector(
      onTap: () => context.go('/appointments/${appointment.id}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _formatDateTime(appointment.scheduledAt),
                    style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${appointment.therapistName ?? 'Your therapist'} · ${_modeLabels[appointment.mode] ?? appointment.mode} · ${appointment.durationMinutes} min'
                    '${isCancelled ? ' · Cancelled' : ''}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: isCancelled
                          ? theme.colorScheme.error
                          : theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(LucideIcons.chevronRight),
          ],
        ),
      ),
    );
  }
}
