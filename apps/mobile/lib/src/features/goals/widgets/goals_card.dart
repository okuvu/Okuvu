import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../theme/app_colors.dart';
import '../goals_provider.dart';
import '../goals_screen.dart';

/// The goals card on Home: the one goal the pair is on now, and a way into the
/// full list.
///
/// It renders nothing at all when the client has no goals — a card that says
/// "no goals yet" on the home screen is a reminder of an absence, not
/// information. The full screen keeps the empty state for someone who goes
/// looking.
class GoalsCard extends ConsumerWidget {
  const GoalsCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final data = ref.watch(goalsProvider).asData?.value;
    final focus = data?.focus;

    if (focus == null) return const SizedBox.shrink();

    final others = (data?.activeCount ?? 1) - 1;

    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: InkWell(
        key: const Key('home_goals_card'),
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('/goals'),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.lavenderWash,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.lavenderTint),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.target, size: 14, color: AppColors.violet),
                  const SizedBox(width: 6),
                  Text(
                    GoalsCopy.title,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: AppColors.violet,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Spacer(),
                  const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.violet),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                focus.text,
                key: const Key('home_goals_focus_text'),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontSize: 15,
                  height: 1.35,
                  fontWeight: FontWeight.w600,
                  color: AppColors.charcoalInk,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                others > 0
                    ? '${GoalsCopy.focusLabel} · $others more'
                    : GoalsCopy.focusLabel,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: AppColors.inkSoft,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
