import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/features/library/library_api.dart';
import 'package:okuvu/src/features/library/worksheet_draft_store.dart';
import 'package:okuvu/src/features/library/worksheet_runner_screen.dart';
import 'package:okuvu/src/features/library/worksheet_spec.dart';

/// The two capabilities the Low Mood batch needed:
///
///  * a hand-off, which carries the options the client picked into another
///    worksheet's own unsaved draft and opens it prefilled — without saving on
///    their behalf, replacing a row they wrote, or changing the target;
///  * a review, which reads this worksheet's own entries back in the client's
///    words, with no score, no average and no ranking of feelings.
Map<String, Object?> handOffBody() => {
      'version': 1,
      'fields': [
        {
          'id': 'ideas',
          'type': 'checklist',
          'prompt': 'Which of these might be worth a try?',
          'options': [
            {'value': 'walk', 'label': 'A walk, anywhere'},
            {'value': 'music', 'label': 'Music, loud or quiet'},
          ],
        },
      ],
      'closing': {
        'text': 'Done.',
        'handOff': {
          'toolId': 'ws_small_things',
          'field': 'ideas',
          'label': 'Take these to my Small things planner',
          'targetField': 'plan',
          'targetColumn': 'what',
        },
      },
    };

/// The runner, behind a real router, so the hand-off's navigation can be
/// observed instead of throwing on a missing GoRouter.
Widget routerHarness({
  required WorksheetContent content,
  required WorksheetDraftStore store,
  required List<String> pushed,
  String toolId = 'ws_things_i_might_enjoy',
}) {
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => WorksheetRunnerScreen(
          toolId: toolId,
          userId: 'u1',
          content: content,
          draftStore: store,
        ),
      ),
      GoRoute(
        path: '/library/worksheet/:toolId',
        builder: (context, state) {
          pushed.add(state.pathParameters['toolId'] ?? '');
          return Scaffold(body: Text('OPENED ${state.pathParameters['toolId']}'));
        },
      ),
    ],
  );
  return ProviderScope(child: MaterialApp.router(routerConfig: router));
}

Future<void> walkToClosing(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('worksheet_after_skip')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('worksheet_finish')));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('hand-off', () {
    testWidgets('seeds the target draft with the labels the client saw, then opens it',
        (tester) async {
      final store = WorksheetDraftStore();
      final pushed = <String>[];
      final content = parseWorksheetContent(handOffBody());

      await tester.pumpWidget(
        routerHarness(content: content, store: store, pushed: pushed),
      );
      await tester.pumpAndSettle();

      // Skip the optional before-rating, pick two ideas, finish.
      await tester.tap(find.byKey(const Key('worksheet_before_skip')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('A walk, anywhere'));
      await tester.pump();
      await tester.tap(find.text('Music, loud or quiet'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
      await tester.pumpAndSettle();
      await walkToClosing(tester);

      // The button is the body's own label, not a hard-coded one.
      expect(find.byKey(const Key('worksheet_hand_off')), findsOneWidget);
      await tester.tap(find.byKey(const Key('worksheet_hand_off')));
      await tester.pumpAndSettle();

      // The target's own unsaved draft now holds the picks, in its own column.
      final draft = await store.load('u1', 'ws_small_things');
      expect(draft, isNotNull);
      final rows = draft!.answers['plan'];
      expect(rows, isA<List<dynamic>>());
      expect(
        (rows as List).map((row) => (row as Map)['what']).toList(),
        ['A walk, anywhere', 'Music, loud or quiet'],
      );
      expect(pushed, ['ws_small_things']);
      expect(find.text('OPENED ws_small_things'), findsOneWidget);
    });

    testWidgets('appends to a draft the client already started, never replacing a row',
        (tester) async {
      final store = WorksheetDraftStore();
      await store.save(
        'u1',
        'ws_small_things',
        WorksheetDraft(
          answers: {
            'plan': [
              {'what': 'Chai with a friend', 'when': ''},
            ],
          },
          stepIndex: 2,
          updatedAt: DateTime.now(),
        ),
      );
      final pushed = <String>[];
      final content = parseWorksheetContent(handOffBody());

      await tester.pumpWidget(
        routerHarness(content: content, store: store, pushed: pushed),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('worksheet_before_skip')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Music, loud or quiet'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
      await tester.pumpAndSettle();
      await walkToClosing(tester);
      await tester.tap(find.byKey(const Key('worksheet_hand_off')));
      await tester.pumpAndSettle();

      final rows = (await store.load('u1', 'ws_small_things'))!.answers['plan'] as List;
      expect((rows.first as Map)['what'], 'Chai with a friend');
      expect((rows.last as Map)['what'], 'Music, loud or quiet');
    });

    testWidgets('says so and saves nothing when nothing was picked', (tester) async {
      final store = WorksheetDraftStore();
      final pushed = <String>[];
      final content = parseWorksheetContent(handOffBody());

      await tester.pumpWidget(
        routerHarness(content: content, store: store, pushed: pushed),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('worksheet_before_skip')));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
      await tester.pumpAndSettle();
      await walkToClosing(tester);

      await tester.tap(find.byKey(const Key('worksheet_hand_off')));
      await tester.pumpAndSettle();

      expect(find.text('Pick at least one first.'), findsOneWidget);
      expect(await store.load('u1', 'ws_small_things'), isNull);
      expect(pushed, isEmpty);
    });
  });

  group('review', () {
    testWidgets('reads the week back in words, with no score', (tester) async {
      final review = WorksheetReviewView(
        withinDays: 7,
        groups: [
          WorksheetReviewGroup(
            activity: 'Chai with a friend',
            entries: [
              WorksheetReviewEntry(
                at: DateTime(2026, 11, 22, 10),
                feelings: const ['calm', 'happy'],
              ),
              WorksheetReviewEntry(
                at: DateTime(2026, 11, 20, 18),
                feelings: const ['sad'],
              ),
            ],
          ),
        ],
      );

      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: WorksheetRunnerScreen(
              toolId: 'ws_mood_activity_log',
              userId: 'u1',
              content: parseWorksheetContent({
                'version': 1,
                'fields': [
                  {'id': 'doing', 'type': 'short_text', 'prompt': 'What were you doing?'},
                ],
                'closing': {'text': 'Done.'},
                'review': {
                  'withinDays': 7,
                  'activityField': 'doing',
                  'feelingsField': 'feelings',
                },
              }),
              draftStore: WorksheetDraftStore(),
              review: review,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('worksheet_before_skip')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'Chai with a friend');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
      await tester.pumpAndSettle();
      await walkToClosing(tester);

      expect(find.byKey(const Key('worksheet_review')), findsOneWidget);
      expect(find.text('Your last 7 days, in your own words'), findsOneWidget);
      expect(find.text('Chai with a friend'), findsOneWidget);
      // Their own feeling words, twice, and the date — never a total or a rank.
      expect(find.text('22 Nov · calm, happy'), findsOneWidget);
      expect(find.text('20 Nov · sad'), findsOneWidget);
      expect(find.textContaining('average'), findsNothing);
      expect(find.textContaining('score'), findsNothing);
      expect(find.textContaining('out of'), findsNothing);
    });

    testWidgets('draws nothing at all when the worksheet declares no review', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: WorksheetRunnerScreen(
              toolId: 'ws_one_small_thing',
              userId: 'u1',
              content: parseWorksheetContent({
                'version': 1,
                'fields': [
                  {'id': 'pick', 'type': 'short_text', 'prompt': 'What is one small thing?'},
                ],
                'closing': {'text': 'Done.'},
              }),
              draftStore: WorksheetDraftStore(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('worksheet_before_skip')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'Water');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
      await tester.pumpAndSettle();
      await walkToClosing(tester);

      expect(find.byKey(const Key('worksheet_review')), findsNothing);
    });
  });
}
