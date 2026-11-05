import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/chat/models/breathing_presets.dart';
import 'package:okuvu/src/features/chat/models/tool_card_config.dart';
import 'package:okuvu/src/features/chat/widgets/guided_breathing_card.dart';
import 'package:okuvu/src/features/home/breathing_content.dart';

/// The breathing card's behaviour, driven with a millisecond tick so thirty
/// breaths take milliseconds instead of several minutes.
///
/// Owner round 2 (4 Nov 2026), building to Dr Goswami's approved v2.0.0: the
/// count must match the shape, an ending must never appear on an exercise
/// nobody started, a sitting is three rounds, the sigh pauses after five, the
/// answer is three taps rather than a text box, and the end offers a rest with
/// "Done" plus a smaller "Talk to Okuvu" instead of a hard wall.
void main() {
  ToolCardConfig configFor(ToolCardType type) => ToolCardConfig(
        type: type,
        breathingConfig: breathingConfigFor(type),
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

  testWidgets('starts with Start and a ten-breath promise, and no question already open',
      (tester) async {
    await tester.pumpWidget(app(configFor(ToolCardType.boxBreathing)));

    expect(find.text('Start'), findsOneWidget);
    expect(find.text('10 breaths, then a pause'), findsOneWidget);
    expect(find.text(breathPauseQuestion), findsNothing);
    expect(find.text('4-4-4-4'), findsOneWidget);
  });

  testWidgets('the countdown is the seconds left in the phase, and the shape shares its clock',
      (tester) async {
    await tester.pumpWidget(
      app(configFor(ToolCardType.boxBreathing), tick: const Duration(milliseconds: 100)),
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

  testWidgets('after ten breaths it asks how they feel, with three taps and no text box',
      (tester) async {
    await tester.pumpWidget(app(configFor(ToolCardType.boxBreathing)));
    await tester.tap(find.text('Start'));
    await tester.pump();

    await pumpUntil(tester, find.text(breathPauseQuestion));

    expect(find.text(breathPauseQuestion), findsOneWidget);
    expect(find.byKey(const Key('breathing_feeling_calmer')), findsOneWidget);
    expect(find.byKey(const Key('breathing_feeling_same')), findsOneWidget);
    expect(find.byKey(const Key('breathing_feeling_worse')), findsOneWidget);
    // Her instruction: no free-text channel at 2 a.m.
    expect(find.byType(TextField), findsNothing);
    expect(find.byKey(const Key('breathing_continue_button')), findsOneWidget);
    expect(find.byKey(const Key('breathing_stop_for_now_button')), findsOneWidget);
    // Nothing else claims the sitting is over.
    expect(find.byKey(const Key('breathing_restart_button')), findsNothing);
  });

  testWidgets('a tap is recorded and does not block continuing', (tester) async {
    await tester.pumpWidget(app(configFor(ToolCardType.boxBreathing)));
    await tester.tap(find.text('Start'));
    await tester.pump();
    await pumpUntil(tester, find.byKey(const Key('breathing_feeling_calmer')));

    await tester.tap(find.byKey(const Key('breathing_feeling_calmer')));
    await tester.pump();

    await tester.tap(find.byKey(const Key('breathing_continue_button')));
    await tester.pump();
    expect(find.text('Round 2 of 3'), findsOneWidget);

    // Leave the harness clean: a session still running owns a live timer.
    await tester.tap(find.byKey(const Key('breathing_stop_button')));
    await tester.pump();
  });

  testWidgets('"Worse" offers Okuvu and the helplines', (tester) async {
    await tester.pumpWidget(app(configFor(ToolCardType.boxBreathing)));
    await tester.tap(find.text('Start'));
    await tester.pump();
    await pumpUntil(tester, find.byKey(const Key('breathing_feeling_worse')));

    expect(find.byKey(const Key('breathing_talk_okuva_button')), findsNothing);
    await tester.tap(find.byKey(const Key('breathing_feeling_worse')));
    await tester.pump();

    expect(find.text(breathWorseCopy), findsOneWidget);
    expect(find.byKey(const Key('breathing_talk_okuva_button')), findsOneWidget);
    expect(find.byKey(const Key('breathing_helplines_button')), findsOneWidget);
  });

  testWidgets('continue gives a second and third round, then rests at thirty', (tester) async {
    await tester.pumpWidget(app(configFor(ToolCardType.boxBreathing)));
    await tester.tap(find.text('Start'));
    await tester.pump();

    await pumpUntil(tester, find.text(breathPauseQuestion));
    await tester.tap(find.byKey(const Key('breathing_continue_button')));
    await tester.pump();

    await pumpUntil(tester, find.text(breathPauseQuestion));
    // The second pause closes round two; round three only starts on continue.
    expect(find.text('Round 3 of 3'), findsNothing);
    await tester.tap(find.byKey(const Key('breathing_continue_button')));
    await tester.pump();
    expect(find.text('Round 3 of 3'), findsOneWidget);

    await pumpUntil(tester, find.text(breathFinishedHeadline(30)));

    expect(find.text(breathFinishedHeadline(30)), findsOneWidget);
    expect(find.text(breathBreakBody), findsOneWidget);
    // No way to carry on past the ceiling in this sitting...
    expect(find.byKey(const Key('breathing_continue_button')), findsNothing);
    expect(find.text(breathPauseQuestion), findsNothing);
    // ...but it is a rest, not a wall: Done is the main button, and a smaller
    // route to her "Talk to Okuvu" exists.
    expect(find.byKey(const Key('breathing_done_button')), findsOneWidget);
    expect(find.byKey(const Key('breathing_talk_button')), findsOneWidget);
  });

  testWidgets('stop for now ends the sitting without showing a score', (tester) async {
    await tester.pumpWidget(app(configFor(ToolCardType.boxBreathing)));
    await tester.tap(find.text('Start'));
    await tester.pump();

    await pumpUntil(tester, find.text(breathPauseQuestion));
    await tester.tap(find.byKey(const Key('breathing_stop_for_now_button')));
    await tester.pump();

    expect(find.text(breathStoppedCopy), findsOneWidget);
    // "Please do not show the breath count here – it reads like a score."
    expect(find.textContaining('10 breaths'), findsNothing);
    expect(find.byKey(const Key('breathing_restart_button')), findsOneWidget);
  });

  testWidgets('Stop during a breath ends it at once, without a phantom pause', (tester) async {
    await tester.pumpWidget(
      app(configFor(ToolCardType.boxBreathing), tick: const Duration(milliseconds: 10)),
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

    expect(find.text(breathStoppedCopy), findsOneWidget);
    // The abandoned loop must not count a third breath behind the screen.
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text(breathStoppedCopy), findsOneWidget);
    expect(find.text(breathPauseQuestion), findsNothing);
  });

  testWidgets('the sigh pauses after five breaths and is guided by words, not numbers',
      (tester) async {
    await tester.pumpWidget(app(configFor(ToolCardType.physiologicalSigh)));
    expect(find.text('5 breaths, then a pause'), findsOneWidget);

    await tester.tap(find.text('Start'));
    await tester.pump();

    expect(find.text('Fill your lungs… in'), findsOneWidget);
    // No number anywhere in the shape, and no pace line either.
    expect(find.text('4'), findsNothing);
    expect(find.text('4+1-8'), findsNothing);

    await pumpUntil(tester, find.text(breathPauseQuestion));
    expect(find.text(breathPauseQuestion), findsOneWidget);
  });

  testWidgets('humming breath names the hum, and its ceiling is thirty', (tester) async {
    await tester.pumpWidget(app(configFor(ToolCardType.hummingBreath)));
    await tester.tap(find.text('Start'));
    await tester.pump();

    expect(find.text('4-6'), findsOneWidget);
    expect(find.text('Breathe in'), findsOneWidget);

    await pumpUntil(
      tester,
      find.text('Hum out'),
      step: const Duration(milliseconds: 1),
    );
    expect(find.text('Hum out'), findsOneWidget);

    await tester.tap(find.byKey(const Key('breathing_stop_button')));
    await tester.pump();
  });

  testWidgets('switching exercise clears the previous exercise ending', (tester) async {
    await tester.pumpWidget(app(configFor(ToolCardType.boxBreathing)));
    await tester.tap(find.text('Start'));
    await tester.pump();
    await pumpUntil(tester, find.text(breathPauseQuestion));

    // The parent swaps the exercise in place: same slot, different type.
    await tester.pumpWidget(app(configFor(ToolCardType.physiologicalSigh)));
    await tester.pump();

    expect(find.text(breathPauseQuestion), findsNothing);
    expect(find.text('Start'), findsOneWidget);
    expect(find.text('Physiological Sigh'), findsOneWidget);
    expect(find.text('5 breaths, then a pause'), findsOneWidget);
  });
}
