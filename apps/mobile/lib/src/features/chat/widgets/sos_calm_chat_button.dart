import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../theme/app_colors.dart';
import '../../library/library_api.dart';

/// The one-tap way into SOS calm from inside a chat.
///
/// Owner's brief (24 Nov 2026): SOS calm is a one-tap card on Home **and in
/// chat**. Home carries the full card; here it is a single button in the app
/// bar, because the chat screen is already full and a card would compete with
/// the conversation.
///
/// Visibility is read from the same Library listing the Home card and the
/// Library use: the worksheet is there only when it is approved and visible to
/// this client. Not in the listing means no button at all — no greyed-out icon,
/// no "coming soon". The client's own content is never consulted, so a draft
/// cannot leak a hint that it exists.
///
/// Nothing is typed and nothing is written: tapping it opens the same
/// `/library/sos` screen Home opens, which hands over to the existing
/// long-out-breath player and then the existing grounding screen.
class SosCalmChatButton extends ConsumerWidget {
  const SosCalmChatButton({super.key});

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

    // Not in the listing (a draft, withdrawn, or no longer available) — there is
    // nothing to tap and nothing to announce.
    if (card == null || !card.available) return const SizedBox.shrink();

    return IconButton(
      key: const Key('chat_sos_calm'),
      icon: const Icon(LucideIcons.wind),
      tooltip: card.label,
      color: AppColors.lavenderTint,
      onPressed: () => context.push('/library/sos'),
    );
  }
}
