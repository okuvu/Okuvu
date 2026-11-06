import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../theme/app_colors.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../home/providers/today_card_provider.dart';
import 'homework_provider.dart';

/// "12 Nov" — when the therapist set this, not a relative word (a stored
/// assignment keeps its date; "2 days ago" would be true only today).
String formatAssignedDate(DateTime at) {
  final local = at.toLocal();
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${local.day} ${months[local.month - 1]}';
}

/// Everything the therapist has set for this client: every assignment, then the
/// active reminders.
///
/// This is the screen a "New homework" / "New reminder" notification opens.
/// It exists because Home's Today card shows only the newest active assignment —
/// linking a notification to that card would promise a list and deliver one row.
class HomeworkScreen extends ConsumerWidget {
  const HomeworkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final homeworkAsync = ref.watch(homeworkListProvider);

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
          title: const OkuvuAppBarTitle('Homework'),
        ),
        body: homeworkAsync.when(
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
                    "We couldn't load your homework.",
                    style: theme.textTheme.bodyMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => ref.invalidate(homeworkListProvider),
                    child: const Text('Try again'),
                  ),
                ],
              ),
            ),
          ),
          data: (page) {
            if (page.homework.isEmpty && page.reminders.isEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        LucideIcons.bookOpen,
                        size: 32,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      const SizedBox(height: 12),
                      Text('Nothing here yet', style: theme.textTheme.titleSmall),
                      const SizedBox(height: 6),
                      Text(
                        'Anything your therapist sets for you will show up on this screen.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              );
            }

            final active = page.homework.where((h) => h.isActive).toList();
            final done = page.homework.where((h) => !h.isActive).toList();

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                if (active.isNotEmpty) ...[
                  _SectionLabel(text: 'To do', count: active.length),
                  ...active.map((h) => _HomeworkCard(item: h)),
                ],
                if (page.reminders.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  _SectionLabel(text: 'Reminders', count: page.reminders.length),
                  ...page.reminders.map((r) => _ReminderCard(item: r)),
                ],
                if (done.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  _SectionLabel(text: 'Done', count: done.length),
                  ...done.map((h) => _HomeworkCard(item: h)),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text, required this.count});

  final String text;
  final int count;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 8),
      child: Text(
        '$text ($count)',
        style: theme.textTheme.labelLarge?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _HomeworkCard extends ConsumerWidget {
  const _HomeworkCard({required this.item});

  final HomeworkListItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final done = !item.isActive;

    return Container(
      key: ValueKey('homework_${item.id}'),
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: done ? AppColors.oat : theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  item.description,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    decoration: done ? TextDecoration.lineThrough : null,
                    color: done ? theme.colorScheme.onSurfaceVariant : null,
                  ),
                ),
              ),
              if (!done)
                TextButton(
                  onPressed: () async {
                    final ok = await ref
                        .read(homeworkCompleteProvider.notifier)
                        .markComplete(item.id);
                    if (ok) {
                      // The list and Home's Today card both read this row.
                      ref.invalidate(homeworkListProvider);
                    } else if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text("Couldn't save that. Please try again."),
                        ),
                      );
                    }
                  },
                  child: const Text('Mark done'),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              if (item.toolLabel != null) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.lavenderWash,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    item.toolLabel!,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: AppColors.violet,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Text(
                done ? 'Done' : 'Set ${formatAssignedDate(item.assignedAt)}',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ReminderCard extends StatelessWidget {
  const _ReminderCard({required this.item});

  final HomeworkReminderItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      key: ValueKey('reminder_${item.id}'),
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.hairline),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 2),
            child: Icon(LucideIcons.bellRing, size: 18, color: AppColors.violet),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.scheduleNote, style: theme.textTheme.bodyMedium),
                const SizedBox(height: 4),
                Text(
                  describeReminderSchedule(item.frequency, item.times),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
