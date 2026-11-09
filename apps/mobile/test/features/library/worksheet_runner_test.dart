import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/features/library/worksheet_draft_store.dart';
import 'package:okuvu/src/features/library/worksheet_runner_screen.dart';
import 'package:okuvu/src/features/library/worksheet_spec.dart';

Map<String, Object?> body() => {
      'version': 1,
      'fields': [
        {'id': 'start', 'type': 'instruction', 'prompt': 'A moment from this week.'},
        {'id': 'facts', 'type': 'short_text', 'prompt': 'What happened?', 'required': true},
        {
          'id': 'can_act',
          'type': 'choice',
          'prompt': 'Anything you can do?',
          'required': true,
          'options': [
            {'value': 'yes', 'label': 'Yes'},
            {'value': 'no', 'label': 'Not right now'},
          ],
        },
        {
          'id': 'step',
          'type': 'short_text',
          'prompt': 'One small step?',
          'visibleWhen': {'field': 'can_act', 'in': ['yes']},
        },
        {
          'id': 'park',
          'type': 'datetime',
          'prompt': 'When will you come back to it?',
          'withDate': true,
          'withTime': true,
          'visibleWhen': {'field': 'can_act', 'in': ['no']},
        },
      ],
      'closing': {
        'text': 'Done.',
        'buttons': [
          {'label': 'Done', 'action': 'done'},
        ],
      },
    };

Widget harness({
  required WorksheetContent content,
  WorksheetDraftStore? store,
  String userId = 'u1',
  String toolId = 'ws_test',
}) {
  return ProviderScope(
    child: MaterialApp(
      home: WorksheetRunnerScreen(
        toolId: toolId,
        userId: userId,
        content: content,
        draftStore: store ?? WorksheetDraftStore(),
      ),
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('shows one piece per screen and gates Next on a required answer', (tester) async {
    final content = parseWorksheetContent(body());
    await tester.pumpWidget(harness(content: content));
    await tester.pumpAndSettle();

    // Only the pieces that apply yet: both branches are still hidden.
    expect(find.text('A moment from this week.'), findsOneWidget);
    expect(find.text('1 of 3'), findsOneWidget);

    // An instruction is not a question, so it never blocks.
    await tester.tap(find.widgetWithText(FilledButton, 'Next'));
    await tester.pumpAndSettle();

    expect(find.text('What happened?'), findsOneWidget);
    final next = find.widgetWithText(FilledButton, 'Next');
    expect(tester.widget<FilledButton>(next).onPressed, isNull);
    await tester.tap(next);
    await tester.pumpAndSettle();
    expect(find.text('What happened?'), findsOneWidget, reason: 'a required piece must hold the step');

    await tester.enterText(find.byKey(const ValueKey('worksheet_field_facts')), 'A thing happened');
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(next).onPressed, isNotNull);

    await tester.tap(next);
    await tester.pumpAndSettle();
    expect(find.text('Anything you can do?'), findsOneWidget);

    // This is the last piece that applies, so the button reads Finish — and it
    // stays shut because the choice is required and unanswered.
    final finish = find.widgetWithText(FilledButton, 'Finish');
    expect(finish, findsOneWidget);
    expect(tester.widget<FilledButton>(finish).onPressed, isNull);
    await tester.tap(finish, warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.text('Anything you can do?'), findsOneWidget);
  });

  testWidgets('follows the branch the answer picks', (tester) async {
    final content = parseWorksheetContent(body());
    await tester.pumpWidget(harness(content: content));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Next'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('worksheet_field_facts')), 'A thing happened');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Next'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Yes'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Next'));
    await tester.pumpAndSettle();

    expect(find.text('One small step?'), findsOneWidget);
    expect(find.text('When will you come back to it?'), findsNothing);
  });

  testWidgets('restores a draft saved before the app was closed', (tester) async {
    final content = parseWorksheetContent(body());
    final store = WorksheetDraftStore();
    await store.save(
      'u1',
      'ws_test',
      WorksheetDraft(
        answers: {'facts': 'Written before closing', 'can_act': 'no'},
        stepIndex: 4,
        updatedAt: DateTime.now(),
      ),
    );

    await tester.pumpWidget(harness(content: content, store: store));
    await tester.pumpAndSettle();

    // The "no" branch is the step the client left on, and the "yes" branch is
    // not in the step list at all, so the set is four pieces, not five.
    expect(find.text('When will you come back to it?'), findsOneWidget);
    expect(find.text('4 of 4'), findsOneWidget);
  });

  testWidgets('keeps what was typed when the screen is rebuilt', (tester) async {
    final content = parseWorksheetContent(body());
    final store = WorksheetDraftStore();
    await tester.pumpWidget(harness(content: content, store: store));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Next'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('worksheet_field_facts')), 'Typed once');
    await tester.pumpAndSettle();

    // A rebuild (here: a hot-reload-shaped one) must not lose the text.
    await tester.pump();
    final field = tester.widget<TextField>(find.byKey(const ValueKey('worksheet_field_facts')));
    expect(field.controller?.text, 'Typed once');

    final draft = await store.load('u1', 'ws_test');
    expect(draft?.answers['facts'], 'Typed once');
  });

  testWidgets('ends on the closing line and its buttons', (tester) async {
    final content = parseWorksheetContent({
      'version': 1,
      'fields': [
        {'id': 'only', 'type': 'short_text', 'prompt': 'One thing?'},
      ],
      'closing': {
        'text': 'Kept safe.',
        'buttons': [
          {'label': 'Done', 'action': 'done'},
          {'label': 'Open my Treasure Box', 'action': 'treasure_box'},
        ],
      },
    });

    await tester.pumpWidget(harness(content: content));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
    await tester.pumpAndSettle();

    expect(find.text('Kept safe.'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Open my Treasure Box'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Done'), findsOneWidget);
  });
}
