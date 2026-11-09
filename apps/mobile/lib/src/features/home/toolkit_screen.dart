import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/providers.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import 'widgets/home_bottom_nav.dart';
import 'widgets/quick_access_tile.dart';

/// The Toolkit tab: everything that is not Chat or Today, in one place.
///
/// Owner's Step 5 rule — the home screen stays simple, so Breathe, Journal, Mood
/// check-in, Library and Treasure Box live together here. Each tile opens a
/// screen that already exists; the only new one is the Treasure Box, which is a
/// placeholder until Step 6A builds it, and says so rather than pretending.
class ToolkitScreen extends ConsumerWidget {
  const ToolkitScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entryCount = ref.watch(journalListProvider).value?.length ?? 0;

    return Scaffold(
      appBar: AppBar(title: const OkuvuAppBarTitle('Toolkit')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: QuickAccessTile(
                  key: const Key('toolkit_breathe'),
                  icon: '\u{1F32B}',
                  label: 'Breathe',
                  subtitle: '4 min',
                  onTap: () => context.push('/library/breathing'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: QuickAccessTile(
                  key: const Key('toolkit_journal'),
                  icon: '\u{1F4D4}',
                  label: 'Journal',
                  subtitle: entryCount == 1 ? '1 entry' : '$entryCount entries',
                  onTap: () => context.go('/journal'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: QuickAccessTile(
                  key: const Key('toolkit_mood'),
                  icon: '\u{1F642}',
                  label: 'Mood check-in',
                  subtitle: 'A moment to notice',
                  onTap: () => context.push('/library/mood'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: QuickAccessTile(
                  key: const Key('toolkit_treasure'),
                  icon: '\u{1F381}',
                  label: 'Treasure Box',
                  subtitle: 'Things worth keeping',
                  onTap: () => context.push('/treasure'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          QuickAccessTile(
            key: const Key('toolkit_library'),
            icon: '\u{1F4DA}',
            label: 'Library',
            subtitle: 'Exercises & worksheets',
            onTap: () => context.go('/library'),
          ),
          const SizedBox(height: 20),
          Center(
            child: TextButton.icon(
              key: const Key('toolkit_crisis'),
              onPressed: () => ref.read(crisisOverlayProvider.notifier).show(),
              icon: const Icon(LucideIcons.lifeBuoy, size: 16),
              label: Text(
                'Crisis Support',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: const HomeBottomNav(currentIndex: 2),
    );
  }
}
