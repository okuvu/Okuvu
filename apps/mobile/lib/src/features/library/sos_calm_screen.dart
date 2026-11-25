import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_colors.dart';

/// SOS calm — one card, two existing exercises, nothing to type.
///
/// The owner's brief (24 Nov 2026): from Home or from chat, one tap opens a
/// breathing exercise with a long out-breath, and then 5-4-3-2-1 grounding.
/// Both of those already exist and are **not** changed here: this screen is a
/// doorway, and it hands over to the same Breathing player and the same
/// Grounding screen the Library uses. Nothing is copied, so a copy edit to
/// either exercise reaches this path too.
///
/// The exercise chosen is `extended_exhale` — the long out-breath is the point
/// of the pairing, and the other three are box breathing, a physiological sigh
/// and humming, none of which is built around a lengthened exhale. The player is
/// passed that technique id rather than opening on its default.
///
/// The intro and closing lines are the owner's, verbatim. The one instruction
/// between them is the worksheet's own instruction; nothing else is written for
/// this path.
class SosCalmScreen extends StatelessWidget {
  const SosCalmScreen({super.key});

  static const breathingToolId = 'extended_exhale';
  static const groundingToolId = 'grounding_5431';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          // Home and the Library both open this screen; going back must return
          // to whichever one did, not always to the Library.
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go('/home');
            }
          },
        ),
        title: const Text('SOS calm'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          Text(
            "You don't have to explain anything. Let's take one long breath out "
            "first, then notice what's around you.",
            style: theme.textTheme.titleMedium?.copyWith(height: 1.5),
          ),
          const SizedBox(height: 28),
          _Step(
            number: 1,
            title: 'One long breath out',
            body: "Start with the long breath out. It's one breath, then another "
                '— you can stop whenever you want.',
            buttonLabel: 'Open the breathing exercise',
            onTap: () => context.push(
              '/library/breathing?tool=$breathingToolId',
            ),
          ),
          const SizedBox(height: 20),
          _Step(
            number: 2,
            title: '5-4-3-2-1 grounding',
            buttonLabel: 'Open the grounding exercise',
            onTap: () => context.push('/library/grounding'),
          ),
          const SizedBox(height: 28),
          Text(
            'Stay here as long as you need.',
            style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.inkSoft),
          ),
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.number,
    required this.title,
    required this.buttonLabel,
    required this.onTap,
    this.body,
  });

  final int number;
  final String title;
  final String? body;
  final String buttonLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.oatElevated,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '$number. $title',
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
            if (body != null) ...[
              const SizedBox(height: 8),
              Text(body!, style: theme.textTheme.bodyMedium?.copyWith(height: 1.5)),
            ],
            const SizedBox(height: 14),
            FilledButton(onPressed: onTap, child: Text(buttonLabel)),
          ],
        ),
      ),
    );
  }
}
