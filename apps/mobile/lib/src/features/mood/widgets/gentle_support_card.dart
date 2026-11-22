import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../mood_vocabulary.dart';

/// The card shown after a save, when the client chose "hopeless" or "numb".
///
/// Deliberately quiet: a card in the page, not an alert, not a red screen, and
/// nothing is sent to the therapist because of those two words. The three
/// buttons are the client's choice — chat, the helplines the app already has, or
/// closing it.
class GentleSupportCard extends StatelessWidget {
  const GentleSupportCard({
    super.key,
    required this.onTalkInChat,
    required this.onSeeSupportLines,
    required this.onNotNow,
  });

  final VoidCallback onTalkInChat;
  final VoidCallback onSeeSupportLines;
  final VoidCallback onNotNow;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('gentle_support_card'),
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
      decoration: BoxDecoration(
        color: AppColors.lavenderWash,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.lilac),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            kGentleCardLine,
            key: Key('gentle_card_line'),
            style: TextStyle(
              fontSize: 15,
              height: 1.45,
              color: AppColors.charcoalInk,
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const Key('gentle_chat'),
              onPressed: onTalkInChat,
              style: FilledButton.styleFrom(backgroundColor: AppColors.violet),
              child: const Text(kGentleChatLabel),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              key: const Key('gentle_support'),
              onPressed: onSeeSupportLines,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.royalPurple,
                side: const BorderSide(color: AppColors.orchidSoft),
              ),
              child: const Text(kGentleSupportLabel),
            ),
          ),
          Align(
            alignment: Alignment.center,
            child: TextButton(
              key: const Key('gentle_not_now'),
              onPressed: onNotNow,
              child: const Text(kGentleNotNowLabel),
            ),
          ),
        ],
      ),
    );
  }
}
