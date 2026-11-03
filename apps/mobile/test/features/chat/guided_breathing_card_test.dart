import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/chat/models/breathing_presets.dart';
import 'package:okuvu/src/features/chat/models/tool_card_config.dart';
import 'package:okuvu/src/features/chat/widgets/guided_breathing_card.dart';
import 'package:okuvu/src/features/home/breathing_content.dart';

/// The breathing card's behaviour, driven with a millisecond tick so thirty
/// breaths take milliseconds instead of eight minutes. Owner round 2
/// (4 Nov 2026): the count must match the shape, the end must not appear on an
/// exercise nobody started, and a sitting is three rounds of ten.
void main() {
  ToolCardConfig boxConfig() => ToolCardConfig(
        type: ToolCardType.boxBreathing,
        breathingConfig: breathingConfigFor(ToolCardType.boxBreathing, BreathingPace.standard),
      );

  ToolCardConfig sighConfig() => ToolCardConfig(
        type: ToolCardType.physiologicalSigh,
        breathingConfig:
            breathingConfigFor(ToolCardType.physiologicalSigh, BreathingPace.standard),
      );

  Widget app(ToolCardConfig config, {Duration tick = const Duration(milliseconds: 1)}) {
    return ProviderScope(
      child: MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: GuidedBreathingCard(config: config, tick: tick),
          ),
        ),
      ),
    );
  }

  Future<void> pumpUntil(
    WidgetTester tester,
    Finder finder, {
    Duration step = const Duration(milliseconds: 20),
    int maxSteps = 600,
  }) async {
    for (var i = 0; i < maxSteps; i++) {
      if (finder.evaluate().isNotEmpty) return;
      await tester.pump(step);
    }
    fail('Never found $finder');
  }

  testWidgets('starts with Start and a ten-breath promise, and no Done screen', (tester) async {
    await tester.pumpWidget(app(boxConfig()));

    expect(find.text('Start'), findsOneWidget);
    expect(find.text('Ten breaths, then a pause'), findsOneWidget);
    expect(find.text('Done. How do you feel now?'), findsNothing);
    expect(find.text('4-4-4-4'), findsOneWidget);
  });

  testWidgets('the countdown is the seconds left in the phase, and the shape shares its clock',
      (tester) async {
    await tester.pumpWidget(
      app(boxConfig(), tick: const Duration(milliseconds: 100)),
    );
    await tester.tap(find.text('Start'));
    await tester.pump();

    // Box breathing: in 4, hold 4, out 4, hold 4. The number shown is the
    // seconds left, so it starts at 4 and counts down.
    expect(find.text('Breathe in'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('3'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('2'), findsOneWidget);

    // One tick per second, so after four seconds the phase is over and the
    // number can never have run ahead of the shape.
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Hold'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);

    await tester.tap(find.byKey(const Key('breathing_stop_button')));
    await tester.pump();
  });

  testWidgets('after ten breaths it asks how they feel, with a free-text box and two buttons',
      (tester) async {
    await tester.pumpWidget(app(boxConfig()));
    await tester.tap(find.text('Start'));
    await tester.pump();

    await pumpUntil(tester, find.text(breathPauseQuestion));

    expect(find.text(breathPauseQuestion), findsOneWidget);
    expect(find.byKey(const Key('breathing_feeling_field')), findsOneWidget);
    expect(find.byKey(const Key('breathing_continue_button')), findsOneWidget);
    expect(find.byKey(const Key('breathing_stop_for_now_button')), findsOneWidget);
    expect(find.text('10 breaths so far.'), findsOneWidget);
    // Nothing else claims the sitting is over.
    expect(find.text('Done. How do you feel now?'), findsNothing);
    expect(find.byKey(const Key('breathing_restart_button')), findsNothing);
  });

  testWidgets('the typed answer is accepted and does not block continuing', (tester) async {
    await tester.pumpWidget(app(boxConfig()));
    await tester.tap(find.text('Start'));
    await tester.pump();
    await pumpUntil(tester, find.byKey(const Key('breathing_feeling_field')));

    await tester.enterText(
      find.byKey(const Key('breathing_feeling_field')),
      'Lighter than before.',
    );
    await tester.pump();

    await tester.tap(find.byKey(const Key('breathing_continue_button')));
    await tester.pump();
    expect(find.text('Round 2 of 3'), findsOneWidget);

    // Leave the harness clean: a session still running owns a live timer.
    await tester.tap(find.byKey(const Key('breathing_stop_button')));
    await tester.pump();
  });

  testWidgets('continue gives a second and third round, then stops at thirty for a break',
      (tester) async {
    await tester.pumpWidget(app(boxConfig()));
    await tester.tap(find.text('Start'));
    await tester.pump();

    await pumpUntil(tester, find.text('10 breaths so far.'));
    await tester.tap(find.byKey(const Key('breathing_continue_button')));
    await tester.pump();

    await pumpUntil(tester, find.text('20 breaths so far.'));
    await tester.tap(find.byKey(const Key('breathing_continue_button')));
    await tester.pump();

    await pumpUntil(tester, find.text(breathFinishedHeadline));

    expect(find.text(breathFinishedHeadline), findsOneWidget);
    expect(find.text(breathFinishedBody), findsOneWidget);
    // No way to carry on past thirty in this sitting.
    expect(find.byKey(const Key('breathing_continue_button')), findsNothing);
    expect(find.text(breathPauseQuestion), findsNothing);
    expect(find.byKey(const Key('breathing_restart_button')), findsOneWidget);
  });

  testWidgets('stop for now ends the sitting and says how many breaths were done',
      (tester) async {
    await tester.pumpWidget(app(boxConfig()));
    await tester.tap(find.text('Start'));
    await tester.pump();

    await pumpUntil(tester, find.text('10 breaths so far.'));
    await tester.tap(find.byKey(const Key('breathing_stop_for_now_button')));
    await tester.pump();

    expect(find.text(breathStoppedHeadline(10)), findsOneWidget);
    expect(find.text('Come back whenever you like.'), findsOneWidget);
    expect(find.byKey(const Key('breathing_restart_button')), findsOneWidget);
  });

  testWidgets('Stop during a breath ends it at once, without a phantom pause', (tester) async {
    await tester.pumpWidget(
      app(boxConfig(), tick: const Duration(milliseconds: 10)),
    );
    await tester.tap(find.text('Start'));
    await tester.pump();

    await pumpUntil(
      tester,
      find.text('Breath 3 of 10'),
      step: const Duration(milliseconds: 10),
    );
    await tester.tap(find.byKey(const Key('breathing_stop_button')));
    await tester.pump();

    expect(find.text(breathStoppedHeadline(2)), findsOneWidget);
    // The abandoned loop must not count a third breath behind the screen.
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text(breathStoppedHeadline(2)), findsOneWidget);
    expect(find.text(breathPauseQuestion), findsNothing);
  });

  testWidgets('switching exercise clears the previous exercise ending', (tester) async {
    await tester.pumpWidget(app(boxConfig()));
    await tester.tap(find.text('Start'));
    await tester.pump();
    await pumpUntil(tester, find.text('10 breaths so far.'));

    // The parent swaps the exercise in place: same slot, different type.
    await tester.pumpWidget(app(sighConfig()));
    await tester.pump();

    expect(find.text(breathPauseQuestion), findsNothing);
    expect(find.text('10 breaths so far.'), findsNothing);
    expect(find.text('Start'), findsOneWidget);
    expect(find.text('Physiological Sigh'), findsOneWidget);
  });
}
