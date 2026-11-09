import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_colors.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../sharing/sharing.dart';
import 'my_space_providers.dart';

/// Past me — the client's own writing, newest first.
///
/// Owner's Step 6: "a timeline of the client's own entries that they can filter
/// by exercise, so they can see how their thinking has changed over time."
///
/// This is deliberately a reading view: nothing is scored, nothing is compared
/// to a target, and no "improvement" is claimed on the client's behalf. The
/// rating pair is shown when they gave one, because seeing "before 8, after 5"
/// is their own evidence, not ours.
class PastMeScreen extends ConsumerStatefulWidget {
  const PastMeScreen({super.key});

  @override
  ConsumerState<PastMeScreen> createState() => _PastMeScreenState();
}

class _PastMeScreenState extends ConsumerState<PastMeScreen> {
  String? _filter;

  Future<void> _delete(PastMeItem item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this?'),
        content: const Text(
          'It will be removed from your timeline and from anywhere it was shared. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final ok = await ref.read(myDataProvider.notifier).deleteItem(
          kind: item.kind,
          id: item.id,
        );
    if (!mounted) return;
    if (ok) {
      ref.invalidate(pastMeProvider(_filter));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't delete that. Please try again.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final timeline = ref.watch(pastMeProvider(_filter));

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/toolkit'),
        ),
        title: const OkuvuAppBarTitle('Past me'),
      ),
      body: timeline.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Could not load your timeline.'),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => ref.invalidate(pastMeProvider(_filter)),
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
        data: (data) {
          if (data.items.isEmpty && data.filters.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  'Nothing here yet. Your journal entries and the worksheets you fill in will appear here, in your own words.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            );
          }

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                height: 48,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  children: [
                    for (final filter in data.filters)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          key: Key('past_me_filter_${filter.toolId ?? 'all'}'),
                          label: Text('${filter.label} (${filter.count})'),
                          selected: _filter == filter.toolId,
                          onSelected: (_) => setState(() => _filter = filter.toolId),
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: data.items.isEmpty
                    ? Center(
                        child: Text(
                          'Nothing written here yet.',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                        itemCount: data.items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (context, index) {
                          final item = data.items[index];
                          return Container(
                            key: Key('past_me_item_${item.id}'),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: AppColors.oatElevated,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: AppColors.hairline),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        item.isJournal
                                            ? 'Journal'
                                            : item.toolLabel ?? 'Worksheet',
                                        style: theme.textTheme.labelMedium?.copyWith(
                                          color: AppColors.charcoalInk.withValues(alpha: 0.6),
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                    ShareLabel(shared: item.shared),
                                    IconButton(
                                      key: Key('past_me_delete_${item.id}'),
                                      visualDensity: VisualDensity.compact,
                                      tooltip: 'Delete',
                                      icon: Icon(
                                        Icons.delete_outline,
                                        size: 18,
                                        color: theme.colorScheme.onSurfaceVariant,
                                      ),
                                      onPressed: () => _delete(item),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  item.excerpt.isEmpty ? '—' : item.excerpt,
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: AppColors.charcoalInk,
                                    height: 1.45,
                                  ),
                                ),
                                if (item.feelingBefore != null || item.feelingAfter != null) ...[
                                  const SizedBox(height: 8),
                                  Text(
                                    [
                                      if (item.feelingBefore != null) 'Before ${item.feelingBefore}/10',
                                      if (item.feelingAfter != null) 'After ${item.feelingAfter}/10',
                                    ].join(' · '),
                                    style: theme.textTheme.labelSmall?.copyWith(
                                      color: AppColors.charcoalInk.withValues(alpha: 0.5),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          );
                        },
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}
