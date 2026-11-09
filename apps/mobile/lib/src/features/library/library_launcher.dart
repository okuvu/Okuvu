import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../theme/app_colors.dart';

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
