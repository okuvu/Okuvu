import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'journal_entry.dart';
import '../../core/providers.dart';
import '../library/treasure_providers.dart';
import '../sharing/sharing.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';

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
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () => context.go('/home'),
          ),
          title: const OkuvuAppBarTitle('Journal'),
        ),
        body: entriesAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => Center(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(LucideIcons.alertCircle, size: 48),
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
                        LucideIcons.book,
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

class _JournalEntryCard extends ConsumerStatefulWidget {
  const _JournalEntryCard({required this.entry});

  final JournalEntry entry;

  @override
  ConsumerState<_JournalEntryCard> createState() => _JournalEntryCardState();
}

class _JournalEntryCardState extends ConsumerState<_JournalEntryCard> {
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
            // Mood is optional on an entry, so this row appears only when the
            // client actually recorded one — a blank chip or five empty dots
            // would read as "you rated this zero", which is not what happened.
            if (entry.emotion != null)
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: emotionColors[entry.emotion] ??
                          AppColors.lavenderWash,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      journalEmotionLabels[entry.emotion] ?? entry.emotion!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (entry.intensity != null && entry.intensity! > 0) ...[
                    const SizedBox(width: 10),
                    Row(
                      children: List.generate(5, (index) {
                        final isFilled = index < entry.intensity!;
                        return Padding(
                          padding: const EdgeInsets.only(right: 3),
                          child: Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isFilled ? theme.colorScheme.primary : null,
                              border: isFilled
                                  ? null
                                  : Border.all(
                                      color: theme.colorScheme.primary
                                          .withAlpha(128),
                                      width: 1.5,
                                    ),
                            ),
                          ),
                        );
                      }),
                    ),
                  ],
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
            const SizedBox(height: 10),
            // One label, one switch, this entry only. The switch is the whole
            // consent model: off means the therapist's Shared page cannot see
            // this row, and turning it off takes effect on their next read.
            Row(
              children: [
                ShareLabel(shared: entry.shared),
                const Spacer(),
                Switch(
                  key: Key('journal_share_switch_${entry.id}'),
                  value: entry.shared,
                  onChanged: (value) => _setShared(value),
                ),
                IconButton(
                  key: Key('journal_keep_${entry.id}'),
                  tooltip: 'Keep in Treasure Box',
                  icon: const Icon(
                    LucideIcons.gift,
                    size: 18,
                    color: AppColors.honeyDeep,
                  ),
                  onPressed: () => _keepInTreasureBox(ref, context),
                ),
                IconButton(
                  key: Key('journal_delete_${entry.id}'),
                  tooltip: 'Delete entry',
                  icon: Icon(
                    Icons.delete_outline,
                    size: 20,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  onPressed: _delete,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _setShared(bool value) async {
    final notifier = ref.read(sharingProvider.notifier);
    if (value) {
      final firstTime = await notifier.shouldConfirmFirstShare();
      if (firstTime) {
        if (!mounted) return;
        final confirmed = await confirmFirstShare(context);
        if (!confirmed) return;
        await notifier.markFirstShareSeen();
      }
    }

    final ok = await notifier.setShared(
      kind: 'journal_entry',
      id: widget.entry.id,
      shared: value,
    );
    if (!mounted) return;
    if (ok) {
      ref.invalidate(journalListProvider);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't change sharing. Please try again.")),
      );
    }
  }

  /// Copies this entry's own words into the Treasure Box.
  ///
  /// A copy, not a link: deleting the journal entry afterwards must not empty
  /// the note the client chose to keep. The api screens the copied text again,
  /// the same way it screens a note typed in the box.
  Future<void> _keepInTreasureBox(WidgetRef ref, BuildContext context) async {
    final outcome = await ref.read(treasureSaverProvider).saveFromJournal(
          entryId: widget.entry.id,
          body: widget.entry.content,
        );
    if (!context.mounted) return;
    if (!outcome.ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't keep that. Please try again.")),
      );
      return;
    }
    if (outcome.showHelp) {
      ref.read(crisisOverlayProvider.notifier).show();
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Kept in your Treasure Box.')),
    );
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this entry?'),
        content: const Text(
          'It will be removed from your journal and from anywhere it was shared. This cannot be undone.',
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

    final ok = await ref.read(sharingProvider.notifier).deleteItem(
          kind: 'journal_entry',
          id: widget.entry.id,
        );
    if (!mounted) return;
    if (ok) {
      ref.invalidate(journalListProvider);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't delete that. Please try again.")),
      );
    }
  }
}
