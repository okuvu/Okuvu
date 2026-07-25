import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'journal_entry.dart';
import 'journal_provider.dart';

class JournalListScreen extends ConsumerWidget {
  const JournalListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final entriesAsync = ref.watch(journalListProvider);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/home');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/home'),
          ),
          title: const Text('Journal'),
        ),
        body: entriesAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => Center(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, size: 48),
                  const SizedBox(height: 12),
                  Text(
                    'Failed to load entries.',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => ref.invalidate(journalListProvider),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
          data: (entries) {
            if (entries.isEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.book_outlined,
                        size: 48,
                        color: theme.colorScheme.onSurfaceVariant.withAlpha(128),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'No entries yet. Your thoughts have a place here.',
                        style: theme.textTheme.bodyLarge?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              );
            }

            return ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: entries.length,
              itemBuilder: (context, index) {
                final entry = entries[index];
                return _JournalEntryCard(entry: entry);
              },
            );
          },
        ),
      ),
    );
  }
}

class _JournalEntryCard extends StatefulWidget {
  const _JournalEntryCard({required this.entry});

  final JournalEntry entry;

  @override
  State<_JournalEntryCard> createState() => _JournalEntryCardState();
}

class _JournalEntryCardState extends State<_JournalEntryCard> {
  bool _expanded = false;

  String _formatDateTime(DateTime dt) {
    final hour = dt.hour;
    final minute = dt.minute.toString().padLeft(2, '0');
    final period = hour >= 12 ? 'PM' : 'AM';
    final displayHour = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${dt.day} ${months[dt.month - 1]} ${dt.year} · $displayHour:$minute $period';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final entry = widget.entry;

    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  _formatDateTime(entry.createdAt),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: emotionColors[entry.emotion] ?? const Color(0xFFF4F6F8),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    journalEmotionLabels[entry.emotion] ?? entry.emotion,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Row(
                  children: List.generate(5, (index) {
                    return Padding(
                      padding: const EdgeInsets.only(right: 3),
                      child: Icon(
                        index < entry.intensity
                            ? Icons.circle
                            : Icons.circle_outlined,
                        size: 10,
                        color: theme.colorScheme.primary,
                      ),
                    );
                  }),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (_expanded)
              Text(
                entry.content,
                style: theme.textTheme.bodyMedium,
              )
            else
              Text(
                entry.content,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
