import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../theme/app_colors.dart';
import '../../library/library_api.dart';

/// The one-tap way into SOS calm from Home.
///
/// Owner's brief (24 Nov 2026): SOS calm is a one-tap card on Home, and it is
/// there only when the worksheet is approved and visible to this client. That
/// fact lives in the Library listing the app already fetches — so the card
/// renders from that list and not from a copy of the approval rule. If
/// `ws_sos_calm` is not in the list, the card does not render at all: no
/// greyed-out card, no "coming soon", nothing to tap.
///
/// Nothing is written and nothing is typed. The card opens the small screen that
/// hands over to the existing long-out-breath player and then the existing
/// grounding screen.
class SosCalmCard extends ConsumerWidget {
  const SosCalmCard({super.key});

  static const toolId = 'ws_sos_calm';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cards = ref.watch(libraryCardsProvider).asData?.value;
    LibraryCard? card;
    if (cards != null) {
      for (final candidate in cards) {
        if (candidate.toolId == toolId) {
          card = candidate;
          break;
        }
      }
    }

    // Not in the listing (a draft, withdrawn, or no longer available) — the card
    // does not exist.
    if (card == null || !card.available) return const SizedBox.shrink();

    final label = card.label;
    final summary = card.summary;

    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: InkWell(
        key: const Key('home_sos_calm'),
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('/library/sos'),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.oatElevated,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.lavenderTint),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 2),
                child: Icon(LucideIcons.wind, size: 20, color: AppColors.violet),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.charcoalInk,
                      ),
                    ),
                    if (summary != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        summary,
                        style: TextStyle(
                          fontSize: 13,
                          height: 1.4,
                          color: AppColors.charcoalInk.withValues(alpha: 0.62),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                LucideIcons.chevronRight,
                size: 18,
                color: AppColors.inkSoft,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
