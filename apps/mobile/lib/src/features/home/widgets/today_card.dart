import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../theme/app_colors.dart';
import '../../library/library_launcher.dart';
import '../providers/today_card_provider.dart';

/// Today card — one main item, then two quiet lines.
///
/// Owner's rule (Step 5, corrected in Step 6): the card shows ONE thing — the
/// next assigned item that is due, whether that is a worksheet, an exercise or
/// homework the therapist typed in their own words — and offers one light
/// exercise when nothing is assigned. Under it, smaller, the reminder line and
/// the quote are back, because they are the only way a reminder reaches a
/// client until push exists.
///
/// It still carries no streak, no counter and no "you missed" state: the card
/// is an offer, and a card that scolds is a card the client stops opening.
///
/// Everything shown here comes from the api (`GET /users/me/today` → `next`,
/// `reminders`, `quote`), which decides assigned-first and which light exercise
/// to suggest.
class TodayCard extends ConsumerWidget {
  const TodayCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final todayAsync = ref.watch(todayCardProvider);

    return todayAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (data) {
        final next = data.next;
        final reminders = data.reminders.take(2).toList();
        final quote = data.quote;

        // Nothing to offer and nothing to say: no empty shell.
        if ((next == null || next.label.isEmpty) && reminders.isEmpty && quote == null) {
          return const SizedBox.shrink();
        }

        return Container(
          key: const Key('today_card'),
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.oatElevated,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.lavenderTint),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Today', style: theme.textTheme.titleMedium),
              if (next != null && next.label.isNotEmpty) ...[
                const SizedBox(height: 12),
                InkWell(
                  key: const Key('today_card_item'),
                  borderRadius: BorderRadius.circular(12),
                  onTap: next.isTextHomework
                      // Typed homework has no worksheet body; the assignment
                      // list is where it can be marked done.
                      ? () => context.push('/homework')
                      : next.toolId == null
                          ? null
                          : () => openLibraryTool(
                                context,
                                toolId: next.toolId!,
                                loadLevel: next.loadLevel,
                              ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Padding(
                          padding: EdgeInsets.only(top: 5),
                          child: Icon(
                            LucideIcons.circle,
                            size: 8,
                            color: AppColors.violet,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            next.label,
                            // A therapist's own words can run longer than an
                            // exercise label; three lines keeps the card a
                            // card.
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 15,
                              height: 1.35,
                              color: AppColors.charcoalInk,
                            ),
                          ),
                        ),
                        if (next.estMinutes != null) ...[
                          const SizedBox(width: 8),
                          Text(
                            '${next.estMinutes} min',
                            style: TextStyle(
                              fontSize: 12,
                              color: AppColors.charcoalInk.withValues(alpha: 0.45),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
              for (final reminder in reminders) ...[
                const SizedBox(height: 8),
                Row(
                  key: Key('today_card_reminder_${reminder.id}'),
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Icon(
                        LucideIcons.bell,
                        size: 12,
                        color: AppColors.charcoalInk.withValues(alpha: 0.4),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        reminder.scheduleNote,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.35,
                          color: AppColors.charcoalInk.withValues(alpha: 0.6),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              if (quote != null && quote.trim().isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(
                  quote,
                  key: const Key('today_card_quote'),
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.4,
                    fontStyle: FontStyle.italic,
                    color: AppColors.charcoalInk.withValues(alpha: 0.55),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}
