import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/library/exposure_ladder_api.dart';
import 'package:okuvu/src/features/library/exposure_ladder_screen.dart';

/// The owner's rule: a before-rating of 80 or more brings up grounding and the
/// pause line; 79 does not. Both numbers are the client's own, and the screen
/// asks for the after-rating only when there is something to rate afterwards.
class _FakeExposureApi extends ExposureLadderApi {
  _FakeExposureApi() : super(Dio());

  final List<({int before, int? after})> runs = [];

  @override
  Future<List<ExposureStep>> steps() async {
    return const [
      ExposureStep(id: 's1', label: 'Take the bus one stop', position: 1),
    ];
  }

  @override
  Future<ExposureRunResult> run(
    String stepId, {
    required int before,
    int? after,
  }) async {
    runs.add((before: before, after: after));
    return ExposureRunResult(pause: before >= 80);
  }
}

Widget harness(ExposureLadderApi api) {
  return ProviderScope(
    overrides: [exposureLadderApiProvider.overrideWithValue(api)],
    child: const MaterialApp(home: ExposureLadderScreen()),
  );
}

Future<void> openStep(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('exposure_step_s1')));
  await tester.pumpAndSettle();
}

Future<void> rateBefore(WidgetTester tester, int rating) async {
  final slider =
      tester.widget<Slider>(find.byKey(const Key('exposure_before_slider')));
  slider.onChanged!(rating.toDouble());
  await tester.pump();
  await tester.tap(find.byKey(const Key('exposure_before_continue')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a before-rating of 80 shows grounding and the pause line',
      (tester) async {
    final api = _FakeExposureApi();
    await tester.pumpWidget(harness(api));
    await tester.pumpAndSettle();

    await openStep(tester);
    await rateBefore(tester, 80);

    // The exact line, written here rather than read from the constant, so a
    // change to the constant cannot make this test agree with itself.
    expect(
      find.text(
        'This step feels like a lot right now. Take a moment with your '
        'breathing first. You can pause here and bring this step to your next '
        'session — waiting is not failing, and the step will still be here.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('exposure_grounding')), findsOneWidget);
    // The pause is the end of this attempt: no after-rating is asked for.
    expect(find.text('And afterwards?'), findsNothing);
    expect(api.runs, [(before: 80, after: null)]);
  });

  testWidgets('a before-rating of 79 does not show the pause line',
      (tester) async {
    final api = _FakeExposureApi();
    await tester.pumpWidget(harness(api));
    await tester.pumpAndSettle();

    await openStep(tester);
    await rateBefore(tester, 79);

    expect(find.textContaining('This step feels like a lot right now'), findsNothing);
    expect(find.byKey(const Key('exposure_grounding')), findsNothing);
    // 79 still gets the full run: the after-rating is the next question.
    expect(find.text('And afterwards?'), findsOneWidget);
  });
}
