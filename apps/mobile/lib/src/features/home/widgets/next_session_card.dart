import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/today_card_provider.dart';

const Map<String, String> _modeLabels = {
  'video': 'video',
  'phone': 'phone',
  'in_person': 'in person',
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

/// App wireframes A1 — Home's "next session" card. Hidden entirely when
/// nothing is booked (no empty-state placeholder, matching the wireframe's
/// own note); no countdown, just the plain facts. Read-only, like the rest
/// of appointments — tapping it opens the (also read-only) detail screen.
class NextSessionCard extends ConsumerWidget {
  const NextSessionCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final next = ref.watch(todayCardProvider).value?.nextAppointment;

    if (next == null) return const SizedBox.shrink();

    return GestureDetector(
      onTap: () => context.go('/appointments/${next.id}'),
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: theme.colorScheme.primaryContainer,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Your next session',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${_formatDateTime(next.scheduledAt)} · ${next.therapistName ?? 'your therapist'}',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onPrimaryContainer,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    '${_modeLabels[next.mode] ?? next.mode} · ${next.durationMinutes} min',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                ],
              ),
            ),
            Icon(LucideIcons.chevronRight, color: theme.colorScheme.onPrimaryContainer),
          ],
        ),
      ),
    );
  }
}
