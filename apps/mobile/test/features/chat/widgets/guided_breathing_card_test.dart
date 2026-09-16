import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/chat/models/tool_card_config.dart';
import 'package:okuvu/src/features/chat/widgets/guided_breathing_card.dart';

const _config = ToolCardConfig(
  type: ToolCardType.boxBreathing,
  breathingConfig: BreathingConfig(
    inhaleSeconds: 4,
    holdSeconds: 4,
    exhaleSeconds: 4,
    secondHoldSeconds: 4,
    cycles: 5,
    label: 'Box Breathing',
    isBoxVisual: true,
  ),
);

Widget _buildApp() {
  return const ProviderScope(
    child: MaterialApp(
      home: Scaffold(body: GuidedBreathingCard(config: _config)),
    ),
  );
}

// Regression test: _skip() used to only set _skipped = true without ever
// advancing _phase to .complete (that transition previously lived only
// inside _startSession's own tail, guarded by `if (!_skipped && mounted)`,
// which _skip() bypasses entirely by design). Tapping Skip left the card
// permanently rendering its "active" UI — a frozen circle/box, a stale
// cycle counter, and a "Stop" button that had become a no-op — with no way
// to ever dismiss it.
void main() {
  testWidgets('tapping Skip before starting reaches the dismissible complete state, not a frozen one', (tester) async {
    await tester.pumpWidget(_buildApp());
    await tester.pump();

    expect(find.text('Start'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);

    await tester.tap(find.text('Skip'));
    await tester.pump();

    // The complete state is reached and is stable across further pumps —
    // before the fix, tapping Skip from .ready left _phase stuck at
    // .ready/.active forever with no way to progress.
    expect(find.text('Done. How do you feel now?'), findsOneWidget);
    expect(find.text('Start'), findsNothing);

    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Done. How do you feel now?'), findsOneWidget);
  });
}
