import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_colors.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import 'library_api.dart';

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

class _LibraryCardTile extends StatelessWidget {
  const _LibraryCardTile({required this.card});

  final LibraryCard card;

  @override
  Widget build(BuildContext context) {
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
          ],
        ),
      ),
    );
  }

  Future<void> _open(BuildContext context) async {
    switch (card.toolId) {
      case 'breathing':
        context.push('/library/breathing');
        return;
      case 'grounding_5431':
        context.push('/library/grounding');
        return;
      case 'mood_checkin':
        context.push('/library/mood');
        return;
      case 'ws_safety_plan':
        // Co-created in session: the card only exists once the therapist has
        // saved a plan, and it opens the plan itself rather than a form.
        context.push('/safety-plan');
        return;
    }

    // A demanding worksheet asks one question first, and the answer is the
    // "before" rating the api stores. Above 5 out of 10 the api refuses to open
    // it and the client is offered grounding instead — the server enforces that
    // too, so the app cannot open what the rule says should stay shut.
    if (card.loadLevel == 'demanding') {
      final rating = await showModalBottomSheet<int>(
        context: context,
        isScrollControlled: true,
        backgroundColor: AppColors.oatElevated,
        builder: (_) => const _FeelingGateSheet(),
      );
      if (rating == null || !context.mounted) return;
      context.push('/library/worksheet/${card.toolId}?feelingNow=$rating');
      return;
    }

    context.push('/library/worksheet/${card.toolId}');
  }
}

/// The one question asked before a demanding worksheet.
///
/// Copy and scale are the owner's: "How strong is what you're feeling right
/// now?", 0-10. The sheet returns the answer, and the api decides whether that
/// answer opens the worksheet.
class _FeelingGateSheet extends StatefulWidget {
  const _FeelingGateSheet();

  @override
  State<_FeelingGateSheet> createState() => _FeelingGateSheetState();
}

class _FeelingGateSheetState extends State<_FeelingGateSheet> {
  int _value = 5;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'How strong is what you\'re feeling right now?',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: AppColors.charcoalInk,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '0 = barely there, 10 = the strongest I\'ve felt',
              style: TextStyle(
                fontSize: 13,
                color: AppColors.charcoalInk.withValues(alpha: 0.55),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Text('0', style: TextStyle(color: AppColors.charcoalInk)),
                Expanded(
                  child: Slider(
                    key: const Key('demanding_gate_slider'),
                    value: _value.toDouble(),
                    min: 0,
                    max: 10,
                    divisions: 10,
                    label: '$_value',
                    onChanged: (next) => setState(() => _value = next.round()),
                  ),
                ),
                const Text('10', style: TextStyle(color: AppColors.charcoalInk)),
              ],
            ),
            Center(
              child: Text(
                '$_value',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: AppColors.charcoalInk,
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const Key('demanding_gate_continue'),
                onPressed: () => Navigator.of(context).pop(_value),
                child: const Text('Continue'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
