import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_colors.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../my_space/my_space_providers.dart';
import '../sharing/sharing.dart';

/// The Treasure Box — read-only list for now.
///
/// Owner's Step 5: the entry exists and the full box is built in Step 6A. What
/// this screen does hold is the part Step 6 needs: every note carries its
/// Private / Shared label and its own share switch, and the approved privacy
/// line is on the screen. What it deliberately does not hold is an "Add" button
/// or collections — those arrive with 6A, and promising them here would be a
/// button that does nothing.
class TreasureBoxScreen extends ConsumerWidget {
  const TreasureBoxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final notes = ref.watch(treasureNotesProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/toolkit'),
        ),
        title: const OkuvuAppBarTitle('Treasure Box'),
      ),
      body: notes.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const Center(child: Text('Could not load your Treasure Box.')),
        data: (rows) {
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              Text(
                'Your therapist can\'t read this unless you choose to share it. If OKUVU\'s safety '
                'system notices you may be in danger, it will show you help straight away and let '
                'your therapist know you may need support, without sharing what you wrote.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 16),
              if (rows.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 24),
                  child: Column(
                    children: [
                      const Icon(LucideIcons.gift, size: 40, color: AppColors.violet),
                      const SizedBox(height: 16),
                      Text(
                        'This is your space for things worth keeping: something you learnt, words that help, reminders for hard days. Add your first one whenever you\'re ready.',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyLarge?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                          height: 1.45,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Saving from a worksheet puts a note here. The full box — collections and writing your own — arrives next.',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                )
              else
                for (final note in rows)
                  Container(
                    key: Key('treasure_note_${note.id}'),
                    margin: const EdgeInsets.only(bottom: 10),
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
                          note.title ?? 'Note',
                          style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 6),
                        Text(note.body, style: theme.textTheme.bodyMedium),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            ShareLabel(shared: note.shared),
                            const Spacer(),
                            Switch(
                              key: Key('treasure_share_switch_${note.id}'),
                              value: note.shared,
                              onChanged: (value) => _setShared(context, ref, note, value),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _setShared(
    BuildContext context,
    WidgetRef ref,
    TreasureNoteRow note,
    bool value,
  ) async {
    final notifier = ref.read(sharingProvider.notifier);
    if (value) {
      final firstTime = await notifier.shouldConfirmFirstShare();
      if (firstTime) {
        if (!context.mounted) return;
        final confirmed = await confirmFirstShare(context);
        if (!confirmed) return;
        await notifier.markFirstShareSeen();
      }
    }

    final ok = await notifier.setShared(
      kind: 'treasure_note',
      id: note.id,
      shared: value,
    );
    if (!context.mounted) return;
    if (ok) {
      ref.invalidate(treasureNotesProvider);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't change sharing. Please try again.")),
      );
    }
  }
}
