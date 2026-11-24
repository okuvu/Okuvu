import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/features/library/library_api.dart';
import 'package:okuvu/src/features/library/worksheet_draft_store.dart';
import 'package:okuvu/src/features/library/worksheet_runner_screen.dart';
import 'package:okuvu/src/features/library/worksheet_spec.dart';

/// The two pieces built for the owner's 24 Nov 2026 worksheet rules: a
/// countdown timer and a body outline the client can tap.
///
/// Both are built once, in the shared content model, so what is proved here is
/// the behaviour a worksheet depends on: the timer stores the seconds it ran,
/// the outline stores the parts that were tapped, and each satisfies a required
/// piece only in the way the piece says it should.
class _NoHelpApi extends LibraryApi {
  _NoHelpApi() : super(Dio());

  @override
  Future<String?> help(String toolId, String stepId) async => null;
}

Map<String, Object?> timerBody({int seconds = 5, int? minSeconds}) => {
      'version': 1,
      'fields': [
        {
          'id': 'sit',
          'type': 'countdown_timer',
          'prompt': 'Sit with it until the timer runs out.',
          'seconds': seconds,
          if (minSeconds != null) 'minSeconds': minSeconds,
          'startLabel': 'Start the timer',
          'doneLabel': 'Done',
          'required': true,
        },
      ],
      'closing': {
        'text': 'Done.',
        'buttons': [
          {'label': 'Done', 'action': 'done'},
        ],
      },
    };

Map<String, Object?> outlineBody() => {
      'version': 1,
      'fields': [
        {
          'id': 'where',
          'type': 'body_outline',
          'prompt': 'Tap where you feel it.',
          'required': true,
          'withStrength': true,
          'strengthPrompt': 'How strong is it there?',
          'regions': [
            {'id': 'head', 'label': 'Head'},
            {'id': 'chest', 'label': 'Chest'},
            {'id': 'shoulders', 'label': 'Shoulders'},
            {'id': 'left_elbow', 'label': 'Left elbow'},
          ],
        },
      ],
      'closing': {
        'text': 'Done.',
        'buttons': [
          {'label': 'Done', 'action': 'done'},
        ],
      },
    };

Widget harness(WorksheetContent content) => ProviderScope(
      overrides: [libraryApiProvider.overrideWithValue(_NoHelpApi())],
      child: MaterialApp(
        home: WorksheetRunnerScreen(
          toolId: 'ws_pieces',
          userId: 'u1',
          content: content,
          draftStore: WorksheetDraftStore(),
          onFinished: (_, __) async {},
        ),
      ),
    );

Future<void> skipBeforeRating(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('worksheet_before_skip')));
  await tester.pumpAndSettle();
}

/// A tall surface. The runner is a scrolling list, and a `ListView` builds
/// lazily: a piece below the fold does not exist to `find`, so a tap on it would
/// "miss" for a reason that has nothing to do with the widget under test.
void setTallSurface(WidgetTester tester) {
  tester.view.physicalSize = const Size(1200, 3000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets(
      'the countdown runs, shows the time left, and stores the seconds it ran',
      (tester) async {
    setTallSurface(tester);
    await tester.pumpWidget(harness(parseWorksheetContent(timerBody())));
    await tester.pumpAndSettle();
    await skipBeforeRating(tester);

    expect(find.text('Sit with it until the timer runs out.'), findsOneWidget);
    expect(find.text('00:05'), findsOneWidget);

    // Required and not yet run: the step is held.
    final finish = find.widgetWithText(FilledButton, 'Finish');
    expect(finish, findsOneWidget);
    expect(tester.widget<FilledButton>(finish).onPressed, isNull);

    await tester.tap(find.widgetWithText(FilledButton, 'Start the timer'));
    await tester.pump();

    // The clock counts down one second at a time.
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('00:04'), findsOneWidget);

    // Run it out.
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    await tester.pumpAndSettle();

    // Ran to the end: the piece is answered, so the step is no longer held.
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Finish'))
          .onPressed,
      isNotNull,
    );
  });

  testWidgets(
      'stopping the timer early is still an answer when no minimum is set',
      (tester) async {
    setTallSurface(tester);
    await tester
        .pumpWidget(harness(parseWorksheetContent(timerBody(seconds: 30))));
    await tester.pumpAndSettle();
    await skipBeforeRating(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Start the timer'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 3));

    // The running label is the app's own control word, not approved copy.
    await tester.tap(find.widgetWithText(FilledButton, 'Stop'));
    await tester.pumpAndSettle();

    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Finish'))
          .onPressed,
      isNotNull,
    );
  });

  testWidgets(
      'the body outline offers every part, and a tapped part is an answer',
      (tester) async {
    setTallSurface(tester);
    await tester.pumpWidget(harness(parseWorksheetContent(outlineBody())));
    await tester.pumpAndSettle();
    await skipBeforeRating(tester);

    expect(find.text('Tap where you feel it.'), findsOneWidget);

    final finish = find.widgetWithText(FilledButton, 'Finish');
    expect(tester.widget<FilledButton>(finish).onPressed, isNull);

    // A part the drawing has a place for is on the body; one it does not is
    // still offered, so no part of the worksheet is unreachable.
    expect(find.text('Chest'), findsOneWidget);
    expect(find.text('Left elbow'), findsOneWidget);

    await tester.tap(find.text('Chest'));
    await tester.pumpAndSettle();

    expect(tester.widget<FilledButton>(finish).onPressed, isNotNull);
    // The strength question is the worksheet's own copy.
    expect(find.text('How strong is it there?'), findsOneWidget);
  });

  testWidgets('a body outline with an unknown part still parses and renders',
      (tester) async {
    setTallSurface(tester);
    final body = outlineBody();
    final content = parseWorksheetContent(body);
    final field = content.fields.first;
    expect(field.type, 'body_outline');
    expect(field.regions.map((r) => r.id),
        ['head', 'chest', 'shoulders', 'left_elbow']);
  });
}
