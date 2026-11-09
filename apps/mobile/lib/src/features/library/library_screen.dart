import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import 'library_api.dart';
import 'library_launcher.dart';
import 'treasure_providers.dart';

/// The Library: one list of cards, in the approved order.
///
/// Everything on this screen is data. The section headings and the top line are
/// the owner's approved app copy; the cards, their one-line descriptions and
/// their availability come from the catalogue over `/library`. Nothing here
/// decides what is visible — the api only ever returns approved rows, so a
/// hidden placeholder or a retired exercise cannot appear even if this screen
/// asked for it.
class LibraryScreen extends ConsumerWidget {
  const LibraryScreen({super.key});

  /// The nine sections, in the order the approved document uses them.
  static const sections = <String, String>{
    'notice_and_name': 'Notice & name',
    'calm_my_body': 'Calm my body',
    'untangle_thoughts': 'Untangle my thoughts',
    'do_what_matters': 'Do what matters',
    'people_boundaries': 'People & boundaries',
    'be_kinder': 'Be kinder to me',
    'energy_life': 'Energy & life',
    'before_after': 'Before & after session',
    'safety': 'Safety',
  };

  /// "Small exercises to try anytime. Some are added by your therapist."
  static const topLine =
      'Small exercises to try anytime. Some are added by your therapist.';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cardsAsync = ref.watch(libraryCardsProvider);

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
          title: const OkuvuAppBarTitle('Library'),
        ),
        body: cardsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(LucideIcons.cloudOff, size: 32),
                  const SizedBox(height: 12),
                  const Text(
                    "Couldn't load the Library. Check your connection and try again.",
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () => ref.invalidate(libraryCardsProvider),
                    child: const Text('Try again'),
                  ),
                ],
              ),
            ),
          ),
          data: (cards) => ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              Text(
                topLine,
                style: TextStyle(
                  fontSize: 14,
                  height: 1.4,
                  color: AppColors.charcoalInk.withValues(alpha: 0.6),
                ),
              ),
              const SizedBox(height: 16),
              for (final entry in sections.entries) ...[
                if (cards.any((card) => card.section == entry.key)) ...[
                  Padding(
                    padding: const EdgeInsets.only(top: 8, bottom: 10),
                    child: Text(
                      entry.value,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: AppColors.charcoalInk,
                      ),
                    ),
                  ),
                  for (final card in cards.where((c) => c.section == entry.key))
                    _LibraryCardTile(card: card),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _LibraryCardTile extends ConsumerWidget {
  const _LibraryCardTile({required this.card});

  final LibraryCard card;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final available = card.available;

    return InkWell(
      key: Key('library_card_${card.toolId}'),
      borderRadius: BorderRadius.circular(16),
      onTap: available ? () => _open(context) : null,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.oatElevated,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.lavenderTint),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    card.label,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: available
                          ? AppColors.charcoalInk
                          : AppColors.charcoalInk.withValues(alpha: 0.45),
                    ),
                  ),
                  if (card.summary != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      card.summary!,
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.35,
                        color: AppColors.charcoalInk.withValues(alpha: 0.62),
                      ),
                    ),
                  ],
                  if (!available) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Your therapist can add this one for you.',
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.charcoalInk.withValues(alpha: 0.5),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (card.estMinutes != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 12, top: 2),
                    child: Text(
                      '${card.estMinutes} min',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.charcoalInk.withValues(alpha: 0.45),
                      ),
                    ),
                  ),
                if (available)
                  IconButton(
                    key: Key('library_keep_${card.toolId}'),
                    visualDensity: VisualDensity.compact,
                    tooltip: 'Keep in Treasure Box',
                    icon: const Icon(
                      LucideIcons.gift,
                      size: 18,
                      color: AppColors.honeyDeep,
                    ),
                    onPressed: () => _keep(context, ref),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Opening is shared with the Today card, so the demanding-worksheet question
  /// is asked from both entries and the four existing screens are reached the
  /// same way from both.
  Future<void> _open(BuildContext context) =>
      openLibraryTool(context, toolId: card.toolId, loadLevel: card.loadLevel);

  /// Keeps the exercise itself — its name and the approved line describing it —
  /// so a hard day has a way back to something the client already knows helps.
  Future<void> _keep(BuildContext context, WidgetRef ref) async {
    final outcome = await ref.read(treasureSaverProvider).saveExercise(
          label: card.label,
          text: card.summary ?? card.label,
          toolId: card.toolId,
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
}
