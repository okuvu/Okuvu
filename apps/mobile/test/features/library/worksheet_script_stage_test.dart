import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/features/library/worksheet_draft_store.dart';
import 'package:okuvu/src/features/library/worksheet_runner_screen.dart';
import 'package:okuvu/src/features/library/worksheet_spec.dart';

/// Unclench and My calm place are a run of instruction pieces the client
/// follows without tapping. These tests pin the behaviour the owner asked for:
/// one screen, one line at a time, advanced on its own, `holdSeconds` on each
/// line and `gapSeconds` of quiet between them, with Pause and Stop visible the
/// whole way through and Stop going back to the Library.
///
/// What is deliberately NOT here: any audio. There is no player, no recording
/// and no timing against the client — the countdown only decides when the next
/// line appears.

/// My calm place's shape: the client names their place first, then the script,
/// then the rating.
Map<String, Object?> placeBody() => {
      'version': 1,
      'intro': 'Think of a place where you feel calmer.',
      'fields': [
        {
          'id': 'choose',
          'type': 'short_text',
          'prompt': "Where's your place?",
          'required': true,
        },
        {'id': 'settle', 'type': 'instruction', 'prompt': 'Get comfortable.'},
        {'id': 'see', 'type': 'instruction', 'prompt': 'Look around.'},
        {'id': 'hear', 'type': 'instruction', 'prompt': 'Listen.'},
        {
          'id': 'after',
          'type': 'scale_0_10',
          'prompt': 'How do you feel now?',
          'minLabel': 'very unsettled',
          'maxLabel': 'very calm',
        },
      ],
      'script': {'holdSeconds': 5, 'gapSeconds': 5},
      'closing': {'text': 'Your place is yours.'},
    };

/// Unclench's shape: the body opens with the script, nothing to answer first.
Map<String, Object?> unclenchBody() => {
      'version': 1,
      'fields': [
        {'id': 'settle', 'type': 'instruction', 'prompt': 'Get comfortable.'},
        {'id': 'hands', 'type': 'instruction', 'prompt': 'Hands. Hold… and let go.'},
        {
          'id': 'after',
          'type': 'scale_0_10',
          'prompt': 'How does your body feel now?',
        },
      ],
      'script': {'holdSeconds': 5, 'gapSeconds': 5},
      'closing': {'text': "That's it."},
    };

Widget harness(WorksheetContent content, {int? feelingBefore}) {
  return ProviderScope(
    child: MaterialApp(
      home: WorksheetRunnerScreen(
        toolId: 'ws_safe_place',
        userId: 'u1',
        content: content,
        draftStore: WorksheetDraftStore(),
        feelingBefore: feelingBefore,
        onFinished: (_, __) async {},
      ),
    ),
  );
}

/// Stop is a navigation, so this one needs the router the app really uses.
Widget routerHarness(WorksheetContent content) {
  final router = GoRouter(
    initialLocation: '/worksheet',
    routes: [
      GoRoute(
        path: '/worksheet',
        builder: (_, __) => WorksheetRunnerScreen(
          toolId: 'ws_safe_place',
          userId: 'u1',
          content: content,
          draftStore: WorksheetDraftStore(),
          onFinished: (_, __) async {},
        ),
      ),
      GoRoute(
        path: '/library',
        builder: (_, __) => const Scaffold(body: Text('Library')),
      ),
    ],
  );

  return ProviderScope(child: MaterialApp.router(routerConfig: router));
}

String scriptLine(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(const Key('worksheet_script_line'))).data!;

double lineOpacity(WidgetTester tester) => tester
    .widget<AnimatedOpacity>(find.ancestor(
      of: find.byKey(const Key('worksheet_script_line')),
      matching: find.byType(AnimatedOpacity),
    ))
    .opacity;

Future<void> enterScript(WidgetTester tester) async {
  // The opening rating is its own screen; skip it to reach the first question.
  await tester.tap(find.text('Skip'));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextField).first, 'my nani kitchen');
  // The Next button enables on the frame after the answer lands, so give the
  // rebuild that frame before tapping it.
  await tester.pump();
  await tester.tap(find.text('Next'));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('after the first question the script is one screen, one line, no taps', (tester) async {
    await tester.pumpWidget(harness(parseWorksheetContent(placeBody())));
    await tester.pumpAndSettle();

    await enterScript(tester);

    expect(scriptLine(tester), 'Get comfortable.');
    expect(find.text('1 of 3'), findsOneWidget);
    expect(find.byKey(const Key('worksheet_script_pause')), findsOneWidget);
    expect(find.byKey(const Key('worksheet_script_stop')), findsOneWidget);
    // The run is not a set of pages any more: no Next and no Back on it.
    expect(find.text('Next'), findsNothing);
    expect(find.text('Back'), findsNothing);
    // One line at a time — the later lines are not on screen with it.
    expect(find.text('Look around.'), findsNothing);
  });

  testWidgets('holds each line for five seconds, then five seconds of quiet, then advances', (tester) async {
    await tester.pumpWidget(harness(parseWorksheetContent(placeBody())));
    await tester.pumpAndSettle();
    await enterScript(tester);

    // Four seconds in, still the first line at full strength.
    await tester.pump(const Duration(seconds: 4));
    expect(scriptLine(tester), 'Get comfortable.');
    expect(lineOpacity(tester), 1.0);

    // The hold is over at five: same line, dimmed for the quiet before the next.
    await tester.pump(const Duration(seconds: 1));
    expect(scriptLine(tester), 'Get comfortable.');
    expect(lineOpacity(tester), 0.45);

    // Five more and the next line arrives.
    await tester.pump(const Duration(seconds: 5));
    expect(scriptLine(tester), 'Look around.');
    expect(lineOpacity(tester), 1.0);
    expect(find.text('2 of 3'), findsOneWidget);
    // Pause and Stop are still there on the second line.
    expect(find.byKey(const Key('worksheet_script_pause')), findsOneWidget);
    expect(find.byKey(const Key('worksheet_script_stop')), findsOneWidget);
  });

  testWidgets('pause holds the line for as long as the client needs', (tester) async {
    await tester.pumpWidget(harness(parseWorksheetContent(placeBody())));
    await tester.pumpAndSettle();
    await enterScript(tester);

    await tester.tap(find.byKey(const Key('worksheet_script_pause')));
    await tester.pump();
    expect(find.text('Resume'), findsOneWidget);
    expect(find.byKey(const Key('worksheet_script_paused')), findsOneWidget);

    await tester.pump(const Duration(seconds: 40));
    expect(scriptLine(tester), 'Get comfortable.');
    expect(find.text('1 of 3'), findsOneWidget);

    await tester.tap(find.byKey(const Key('worksheet_script_pause')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 10));
    expect(scriptLine(tester), 'Look around.');
  });

  testWidgets('stop goes back to the Library', (tester) async {
    await tester.pumpWidget(routerHarness(parseWorksheetContent(placeBody())));
    await tester.pumpAndSettle();
    await enterScript(tester);

    await tester.tap(find.byKey(const Key('worksheet_script_stop')));
    await tester.pumpAndSettle();

    expect(find.text('Library'), findsOneWidget);
    expect(find.byKey(const Key('worksheet_script_line')), findsNothing);
  });

  testWidgets('a worksheet that asks nothing first opens straight into the script', (tester) async {
    await tester.pumpWidget(
      harness(parseWorksheetContent(unclenchBody()), feelingBefore: 4),
    );
    await tester.pumpAndSettle();

    expect(scriptLine(tester), 'Get comfortable.');
    expect(find.text('1 of 2'), findsOneWidget);
  });

  testWidgets('the rating comes after the last line', (tester) async {
    await tester.pumpWidget(
      harness(parseWorksheetContent(unclenchBody()), feelingBefore: 4),
    );
    await tester.pumpAndSettle();

    // Two lines, ten seconds each: hold plus quiet.
    await tester.pump(const Duration(seconds: 20));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('worksheet_script_line')), findsNothing);
    expect(find.text('How does your body feel now?'), findsOneWidget);
  });
}
