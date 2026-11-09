import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../theme/app_colors.dart';
import '../../library/library_launcher.dart';
import '../providers/today_card_provider.dart';

/// Today card — one thing, and no more.
///
/// Owner's Step 5 rule: the card shows at most one item — the next assigned
/// exercise that is due, with how long it takes — and offers one light exercise
/// when nothing is assigned. It is not a list, and deliberately carries no
/// streak, no counter and no "you missed" state: the card is an offer, and a
/// card that scolds is a card the client stops opening.
///
/// Everything shown here comes from the api (`GET /users/me/today` → `next`),
/// which decides assigned-first and which light exercise to suggest.
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
        if (next == null || next.label.isEmpty) return const SizedBox.shrink();

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
              const SizedBox(height: 12),
              InkWell(
                key: const Key('today_card_item'),
                borderRadius: BorderRadius.circular(12),
                onTap: next.toolId == null
                    ? null
                    : () => openLibraryTool(
                          context,
                          toolId: next.toolId!,
                          loadLevel: next.loadLevel,
                        ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      const Icon(LucideIcons.circle, size: 8, color: AppColors.violet),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          next.label,
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
          ),
        );
      },
    );
  }
}
