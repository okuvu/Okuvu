import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../theme/app_colors.dart';
import '../home/breathing_content.dart';
import 'exposure_ladder_screen.dart';
import 'worry_time_screen.dart';

/// The route a catalogue item lives at, when a path can name it.
///
/// [openLibraryTool] is the one way to *open* an item from a screen, and it is
/// the authority on that; this is the same mapping reduced to a string, for the
/// surfaces that sit above the Navigator (the in-app notification banner) or
/// that only hold an id (a tapped update). Null means \"no route names this
/// item\", and the caller must fall back to a list rather than pushing a
/// worksheet route at something that is not a worksheet — that is how a client
/// ends up reading \"this one isn't ready to open yet\" after tapping a
/// reminder about a breathing exercise.
String? libraryRoutePath(String toolId) {
  switch (toolId) {
    case 'breathing':
      return '/library/breathing';
    case 'grounding_5431':
      return '/library/grounding';
    case 'mood_checkin':
      return '/library/mood';
    case 'ws_sos_calm':
      return '/library/sos';
    case 'ws_safety_plan':
      return '/safety-plan';
  }

  // A single technique inside the breathing player: the route takes the id as
  // a query parameter, so a reminder about box breathing opens box breathing
  // rather than the technique picker.
  if (breathingTechniqueFor(toolId) != null) {
    return '/library/breathing?tool=${Uri.encodeComponent(toolId)}';
  }

  // Worry time and the exposure ladder are pushed as widgets, not paths, and
  // every worksheet body is a `ws_` id.
  if (toolId.startsWith('ws_')) {
    return '/library/worksheet/${Uri.encodeComponent(toolId)}';
  }

  return null;
}

/// One way to open a catalogue item, used by the Library and the Today card.
///
/// Kept in one place because the two entry points must behave identically: the
/// demanding-worksheet question is not something a client should be asked on one
/// screen and skipped on another, and the four existing screens (breathing,
/// grounding, mood check-in, the safety plan) are already built, so both
/// entry points route to the same widgets rather than rebuilding them.
///
/// [loadLevel] and [feelingNow] come from the catalogue row. A demanding
/// worksheet asks the question here, and the api refuses to open one whose
/// answer is missing or above 5 out of 10 — the server is the authority, this
/// only avoids a pointless round trip.
Future<void> openLibraryTool(
  BuildContext context, {
  required String toolId,
  String? loadLevel,
  int? feelingNow,
}) async {
  switch (toolId) {
    case 'ws_worry_time':
      // The daily window and the parked list are server state the worksheet
      // runner cannot carry, so the card opens the screen that talks to
      // /worry-time rather than a form that is mailed in at the end.
      Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => const WorryTimeScreen()),
      );
      return;
    case 'ws_exposure_ladder':
      // Therapist-only: the api never lists it and never answers for a locked
      // step. This case exists for the one door that does exist — the client's
      // unlocked ladder — and never adds a card anywhere.
      Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => const ExposureLadderScreen()),
      );
      return;
  }

  // Every other item that names a route opens at it — one mapping, shared with
  // the surfaces that only hold an id (`libraryRoutePath`). A worksheet body is
  // the exception: it asks the demanding question first.
  final direct = libraryRoutePath(toolId);
  if (direct != null && !direct.startsWith('/library/worksheet/')) {
    context.push(direct);
    return;
  }

  if (loadLevel == 'demanding' && feelingNow == null) {
    final rating = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.oatElevated,
      builder: (_) => const FeelingGateSheet(),
    );
    if (rating == null || !context.mounted) return;
    context.push('/library/worksheet/$toolId?feelingNow=$rating');
    return;
  }

  final suffix = feelingNow == null ? '' : '?feelingNow=$feelingNow';
  context.push('/library/worksheet/$toolId$suffix');
}

/// The one question asked before a demanding worksheet.
///
/// Copy and scale are the owner's: "How strong is what you're feeling right
/// now?", 0-10. The sheet returns the answer, and the api decides whether that
/// answer opens the worksheet.
class FeelingGateSheet extends StatefulWidget {
  const FeelingGateSheet({super.key});

  @override
  State<FeelingGateSheet> createState() => _FeelingGateSheetState();
}

class _FeelingGateSheetState extends State<FeelingGateSheet> {
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
