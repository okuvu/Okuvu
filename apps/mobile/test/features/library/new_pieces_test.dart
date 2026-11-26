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

  // Registered here so the per-part feelings tests run with the rest.
  feelingsTests();
}

/// The Body map's per-part feelings (25 Nov 2026).
///
/// The owner's brief: "The client taps where they feel something, then uses the
/// feelings picker for that spot." So the answer carries `feelings` keyed by the
/// tapped part, exactly as it carries `strength` — two places can feel different
/// and the exercise is about noticing that.
Map<String, Object?> feelingsOutlineBody() => {
      'version': 1,
      'fields': [
        {
          'id': 'where',
          'type': 'body_outline',
          'prompt': 'Where do you notice something right now?',
          'required': true,
          'withStrength': true,
          'strengthPrompt': 'How strong is it there?',
          'withFeelings': true,
          'feelingsPrompt': 'What does it feel like there?',
          'feelings': [
            {'id': 'sad', 'label': 'sad'},
            {'id': 'scared', 'label': 'scared'},
            {'id': 'angry', 'label': 'angry'},
          ],
          'regions': [
            {'id': 'chest', 'label': 'Chest'},
            {'id': 'stomach', 'label': 'Stomach'},
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

void feelingsTests() {
  testWidgets('carries the flag, the prompt and the vocabulary through the parser',
      (tester) async {
    final content = parseWorksheetContent(feelingsOutlineBody());
    final field = content.fields.first;
    expect(field.type, 'body_outline');
    expect(field.withFeelings, isTrue);
    expect(field.feelingsPrompt, 'What does it feel like there?');
    expect(field.feelings.map((f) => f.id), ['sad', 'scared', 'angry']);
  });

  testWidgets('offers a picker for each tapped part, and sends feelings per part',
      (tester) async {
    setTallSurface(tester);
    final content = parseWorksheetContent(feelingsOutlineBody());
    WorksheetAnswers? submitted;

    await tester.pumpWidget(ProviderScope(
      overrides: [libraryApiProvider.overrideWithValue(_NoHelpApi())],
      child: MaterialApp(
        home: WorksheetRunnerScreen(
          toolId: 'ws_body_map',
          userId: 'u1',
          content: content,
          draftStore: WorksheetDraftStore(),
          onFinished: (answers, _) async => submitted = answers,
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await skipBeforeRating(tester);

    // No picker until a part is tapped: there is nothing to ask about yet.
    expect(find.text('What does it feel like there?'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('body_spot_chest')));
    await tester.pumpAndSettle();

    // The question appears, and one chip per feeling in the vocabulary.
    expect(find.text('What does it feel like there?'), findsOneWidget);
    expect(find.byKey(const ValueKey('body_feeling_where_chest_sad')), findsOneWidget);
    expect(find.byKey(const ValueKey('body_feeling_where_chest_angry')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('body_feeling_where_chest_scared')));
    await tester.pumpAndSettle();

    // Tapping a second part gives it its own picker, not a shared one.
    await tester.tap(find.byKey(const ValueKey('body_spot_stomach')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('body_feeling_where_stomach_scared')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('body_feeling_where_stomach_angry')));
    await tester.pumpAndSettle();

    // Finish advances to the optional after-rating; the second confirm is the
    // one that submits, exactly as every other worksheet does.
    await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('worksheet_after_skip')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('worksheet_finish')));
    await tester.pumpAndSettle();

    final answer = submitted!['where'] as Map<Object?, Object?>;
    expect(answer['picked'], ['chest', 'stomach']);
    final feelings = answer['feelings'] as Map<Object?, Object?>;
    expect((feelings['chest'] as List), ['scared']);
    expect((feelings['stomach'] as List), ['angry']);
  });

  testWidgets('dropping a part drops the feelings chosen for it', (tester) async {
    setTallSurface(tester);
    final content = parseWorksheetContent(feelingsOutlineBody());
    WorksheetAnswers? submitted;

    await tester.pumpWidget(ProviderScope(
      overrides: [libraryApiProvider.overrideWithValue(_NoHelpApi())],
      child: MaterialApp(
        home: WorksheetRunnerScreen(
          toolId: 'ws_body_map',
          userId: 'u1',
          content: content,
          draftStore: WorksheetDraftStore(),
          onFinished: (answers, _) async => submitted = answers,
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await skipBeforeRating(tester);

    await tester.tap(find.byKey(const ValueKey('body_spot_chest')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('body_feeling_where_chest_sad')));
    await tester.pumpAndSettle();

    // Untap the part: its feelings must not survive as a stray answer.
    await tester.tap(find.byKey(const ValueKey('body_spot_chest')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('body_spot_stomach')));
    await tester.pumpAndSettle();
    // Finish advances to the optional after-rating; the second confirm is the
    // one that submits, exactly as every other worksheet does.
    await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('worksheet_after_skip')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('worksheet_finish')));
    await tester.pumpAndSettle();

    final answer = submitted!['where'] as Map<Object?, Object?>;
    expect(answer['picked'], ['stomach']);
    final feelings = answer['feelings'] as Map<Object?, Object?>;
    expect(feelings.containsKey('chest'), isFalse);
  });

  testWidgets('tells the client what the cap is instead of swallowing the tap',
      (tester) async {
    // Owner's decision, 26 Nov 2026: "You can pick up to three. Tap a spot
    // again to remove it." A fourth tap that silently does nothing reads like a
    // broken screen, so the line has to appear — and disappear again once a
    // part is removed, or it would look like a permanent warning.
    setTallSurface(tester);
    final content = parseWorksheetContent({
      'version': 1,
      'fields': [
        {
          'id': 'where',
          'type': 'body_outline',
          'prompt': 'Where do you feel it right now?',
          'required': true,
          'maxSelections': 3,
          'fullMessage': 'You can pick up to three. Tap a spot again to remove it.',
          'regions': [
            {'id': 'head', 'label': 'Head'},
            {'id': 'chest', 'label': 'Chest'},
            {'id': 'stomach', 'label': 'Stomach'},
            {'id': 'shoulders', 'label': 'Shoulders'},
          ],
        },
      ],
      'closing': {
        'text': 'Done.',
        'buttons': [
          {'label': 'Done', 'action': 'done'},
        ],
      },
    });

    await tester.pumpWidget(ProviderScope(
      overrides: [libraryApiProvider.overrideWithValue(_NoHelpApi())],
      child: MaterialApp(
        home: WorksheetRunnerScreen(
          toolId: 'ws_body_map',
          userId: 'u1',
          content: content,
          draftStore: WorksheetDraftStore(),
          onFinished: (answers, _) async {},
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await skipBeforeRating(tester);

    expect(find.byKey(const ValueKey('body_cap_where')), findsNothing);

    for (final id in ['head', 'chest', 'stomach']) {
      await tester.tap(find.byKey(ValueKey('body_spot_$id')));
      await tester.pumpAndSettle();
    }
    // Three picked, no complaint: the cap has not been reached past.
    expect(find.byKey(const ValueKey('body_cap_where')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('body_spot_shoulders')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('body_cap_where')), findsOneWidget);
    expect(
      find.text('You can pick up to three. Tap a spot again to remove it.'),
      findsOneWidget,
    );

    // Removing a part clears it: the limit is no longer in the way.
    await tester.tap(find.byKey(const ValueKey('body_spot_head')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('body_cap_where')), findsNothing);
  });
}
