import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:share_plus/share_plus.dart';

import '../../widgets/okuvu_app_bar_title.dart';
import '../journal/journal_provider.dart';
import '../library/treasure_providers.dart';
import '../my_space/my_space_providers.dart';
import '../sharing/sharing.dart';

/// Settings → Your data.
///
/// Owner's Step 6: "Clients can download or delete their own entries and
/// notes."
///
/// Download is one readable document (`GET /me/export/document`) shared out
/// through the phone's share sheet: plain text, a heading per item, oldest
/// first. A phone has no Downloads folder a client can be expected to find from
/// inside an app, so the share sheet is the save path. Delete is per
/// item: journal entries in the journal, worksheet answers and journal posts in
/// Past me, notes here. Every delete is the same api statement, so the item
/// leaves the portal at the same moment it leaves the app.
class MyDataScreen extends ConsumerWidget {
  const MyDataScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final notes = ref.watch(treasureProvider(const TreasureQuery()));

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/settings/privacy'),
        ),
        title: const OkuvuAppBarTitle('Your data'),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 12),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Text(
              'Your entries and notes are yours. You can take a copy, and you can delete any of them.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          ListTile(
            key: const Key('data_export'),
            leading: const Icon(LucideIcons.download),
            title: const Text('Download my entries and notes'),
            subtitle: const Text('One readable document, oldest first'),
            onTap: () => _export(context, ref),
          ),
          ListTile(
            key: const Key('data_delete_journal'),
            leading: const Icon(LucideIcons.book),
            title: const Text('Journal entries'),
            subtitle: const Text('Review and delete'),
            onTap: () => context.go('/journal/history'),
          ),
          ListTile(
            key: const Key('data_delete_worksheets'),
            leading: const Icon(LucideIcons.clipboardList),
            title: const Text('Worksheet answers'),
            subtitle: const Text('Review and delete in Past me'),
            onTap: () => context.push('/past-me'),
          ),
          const Divider(height: 24),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Text(
              'Treasure Box notes',
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
          notes.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (_, __) => const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Could not load your notes.'),
            ),
            data: (box) {
              final rows = box.notes;
              if (rows.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: Text(
                    'No notes yet.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                );
              }
              return Column(
                children: [
                  for (final note in rows)
                    ListTile(
                      key: Key('data_note_${note.id}'),
                      title: Text(note.title ?? 'Note'),
                      subtitle: Text(
                        note.body.length > 80 ? '${note.body.substring(0, 79)}…' : note.body,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      leading: const Icon(LucideIcons.gift),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          ShareLabel(shared: note.shared),
                          IconButton(
                            tooltip: 'Delete note',
                            icon: const Icon(Icons.delete_outline, size: 20),
                            onPressed: () => _deleteNote(context, ref, note.id),
                          ),
                        ],
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  Future<void> _export(BuildContext context, WidgetRef ref) async {
    final text = await ref.read(myDataProvider.notifier).exportText();
    if (!context.mounted) return;
    if (text == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't prepare your copy. Please try again.")),
      );
      return;
    }
    await SharePlus.instance.share(
      ShareParams(text: text, subject: 'My OKUVU entries and notes'),
    );
  }

  Future<void> _deleteNote(BuildContext context, WidgetRef ref, String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this note?'),
        content: const Text('It will be removed from your Treasure Box and from anywhere it was shared.'),
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
          kind: 'treasure_note',
          id: id,
        );
    if (!context.mounted) return;
    if (ok) {
      ref.invalidate(treasureProvider);
      ref.invalidate(journalListProvider);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't delete that. Please try again.")),
      );
    }
  }
}
