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
/// one screen, one line at a time, advanced on its own, each line held long
/// enough to read (a second for every three words, never under six), five extra
/// seconds on a line that says "hold", and ten seconds of quiet after every
/// line — with Pause and Stop visible the whole way through and Stop going back
/// to the Library.
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
      'script': {'secondsPerWords': 3, 'minSeconds': 6, 'gapSeconds': 10},
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
      'script': {
        'secondsPerWords': 3,
        'minSeconds': 6,
        'gapSeconds': 10,
        'holdExtraSeconds': 5,
      },
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

  testWidgets('reads each line for at least six seconds, then ten seconds of quiet, then advances', (tester) async {
    await tester.pumpWidget(harness(parseWorksheetContent(placeBody())));
    await tester.pumpAndSettle();
    await enterScript(tester);

    // 'Get comfortable.' is two words: the six-second floor, not one second.
    await tester.pump(const Duration(seconds: 5));
    expect(scriptLine(tester), 'Get comfortable.');
    expect(lineOpacity(tester), 1.0);

    // The read is over at six: same line, dimmed for the ten seconds of quiet.
    await tester.pump(const Duration(seconds: 1));
    expect(scriptLine(tester), 'Get comfortable.');
    expect(lineOpacity(tester), 0.45);

    // Ten more and the next line arrives — sixteen seconds for a two-word line.
    await tester.pump(const Duration(seconds: 10));
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
    // Six seconds of read and ten of quiet still in front of it after Resume.
    await tester.pump(const Duration(seconds: 16));
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

    // 'Get comfortable.' is 16s (six read, ten quiet); 'Hands. Hold… and let
    // go.' is 21s (six read, five hold, ten quiet). Thirty-seven in all.
    await tester.pump(const Duration(seconds: 37));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('worksheet_script_line')), findsNothing);
    expect(find.text('How does your body feel now?'), findsOneWidget);
  });

  group('the timing rule itself', () {
    const script = WorksheetScript(
      secondsPerWords: 3,
      minSeconds: 6,
      gapSeconds: 10,
      holdExtraSeconds: 5,
    );

    test('one second for every three words, and never less than six', () {
      expect(script.readSeconds('Listen.'), 6); // one word still gets six
      expect(script.readSeconds('Look around. What do you see?'), 6); // five words
      expect(
        script.readSeconds('a b c d e f g h i j k l m n o p q r s t u'),
        7, // twenty-one words, one second for every three
      );
    });

    test('the extra five seconds go to a line that says hold, and only then', () {
      expect(script.lineSeconds('Hands. Hold… and let go.'), 11);
      expect(script.lineSeconds('Look around. What do you see?'), 6);
    });

    test('the run is every line plus the quiet after each one', () {
      expect(script.runSeconds(['Look around.', 'Listen.']), 32);
    });

    test('a line of punctuation alone buys no reading time', () {
      // A bare ellipsis is not a word: the line falls to the six-second floor.
      expect(WorksheetScript.wordCount('… — ...'), 0);
      expect(script.readSeconds('…'), 6);
    });
  });
}
