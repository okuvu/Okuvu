import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_colors.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../library/library_launcher.dart';
import 'my_space_providers.dart';

/// My toolkit — the exercises this client said helped.
///
/// Owner's Step 6: "Add My toolkit, which collects the exercises the client
/// marked as helpful." It is a memory aid, not a scoreboard: no totals, no
/// streak, and nothing is removed if an exercise stops working. The count is
/// shown as "helped twice" at most, because that is useful on a hard day and a
/// leaderboard is not.
class MyToolkitScreen extends ConsumerWidget {
  const MyToolkitScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final toolkit = ref.watch(toolkitProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/toolkit'),
        ),
        title: const OkuvuAppBarTitle('My toolkit'),
      ),
      body: toolkit.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Could not load your toolkit.'),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => ref.invalidate(toolkitProvider),
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
        data: (items) {
          if (items.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      LucideIcons.heartHandshake,
                      size: 40,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Nothing here yet. When an exercise helps, tap “This helped” at the end and it will be kept here.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final item = items[index];
              return InkWell(
                key: Key('toolkit_item_${item.toolId}'),
                borderRadius: BorderRadius.circular(14),
                onTap: () => openLibraryTool(context, toolId: item.toolId),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.oatElevated,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.hairline),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.label,
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: AppColors.charcoalInk,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (item.summary != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          item.summary!,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: AppColors.charcoalInk.withValues(alpha: 0.7),
                          ),
                        ),
                      ],
                      const SizedBox(height: 6),
                      Text(
                        item.timesHelpful == 1
                            ? 'Marked as helpful once'
                            : 'Marked as helpful ${item.timesHelpful} times',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.charcoalInk.withValues(alpha: 0.5),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
