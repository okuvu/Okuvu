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
  int? feelingBefore,
  bool isAssigned = false,
  Future<void> Function(WorksheetAnswers, WorksheetOutcome)? onFinished,
}) {
  return ProviderScope(
    child: MaterialApp(
      home: WorksheetRunnerScreen(
        toolId: toolId,
        userId: userId,
        content: content,
        draftStore: store ?? WorksheetDraftStore(),
        feelingBefore: feelingBefore,
        isAssigned: isAssigned,
        onFinished: onFinished,
      ),
    ),
  );
}

/// Step 5 — the optional "before" rating is its own screen. Skip it, which is
/// what a client who does not want to rate does.
Future<void> skipBeforeRating(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('worksheet_before_skip')));
  await tester.pumpAndSettle();
}

/// Step 5 — after the last piece: the optional "after" rating, then the
/// wrap-up screen (This helped, and for an assigned worksheet did-you-do-it).
Future<void> walkToClosing(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('worksheet_after_skip')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('worksheet_finish')));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('shows one piece per screen and gates Next on a required answer', (tester) async {
    final content = parseWorksheetContent(body());
    await tester.pumpWidget(harness(content: content));
    await tester.pumpAndSettle();

    // Step 5 — the first screen is the optional rating, not a piece.
    expect(find.text("How strong is what you're feeling right now?"), findsOneWidget);
    await skipBeforeRating(tester);

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
    await skipBeforeRating(tester);

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

    // A draft means the client already started, so the opening rating question
    // is not put in front of them again.
    expect(find.byKey(const Key('worksheet_before_skip')), findsNothing);

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
    await skipBeforeRating(tester);

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
    await skipBeforeRating(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
    await tester.pumpAndSettle();
    // "Finish" on the last piece goes to the after-rating question, so the
    // client is never dropped out of a worksheet without a chance to rate it.
    expect(find.byKey(const Key('worksheet_after_skip')), findsOneWidget);
    await walkToClosing(tester);

    expect(find.text('Kept safe.'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Open my Treasure Box'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Done'), findsOneWidget);
  });

  // ─── Step 5 — the optional ratings, the barrier question, "This helped" ───

  testWidgets('the before and after ratings are what get stored, and a skip is null',
      (tester) async {
    final content = parseWorksheetContent({
      'version': 1,
      'fields': [
        {'id': 'only', 'type': 'short_text', 'prompt': 'One thing?'},
      ],
    });

    WorksheetOutcome? outcome;
    await tester.pumpWidget(harness(
      content: content,
      onFinished: (answers, result) async => outcome = result,
    ));
    await tester.pumpAndSettle();

    await tester.drag(find.byKey(const Key('worksheet_feeling_before')), const Offset(120, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('worksheet_before_continue')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const ValueKey('worksheet_field_only')), 'Something');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('worksheet_after_skip')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('worksheet_finish')));
    await tester.pumpAndSettle();

    // 0-10, never the 1-5 mood scale; a skipped rating is null, not zero.
    expect(outcome, isNotNull);
    expect(outcome!.feelingBefore, isNotNull);
    expect(outcome!.feelingBefore! >= 0 && outcome!.feelingBefore! <= 10, isTrue);
    expect(outcome!.feelingAfter, isNull);
  });

  testWidgets('a gate answer is never asked for twice', (tester) async {
    final content = parseWorksheetContent({
      'version': 1,
      'fields': [
        {'id': 'only', 'type': 'short_text', 'prompt': 'One thing?'},
      ],
    });

    WorksheetOutcome? outcome;
    await tester.pumpWidget(harness(
      content: content,
      feelingBefore: 3,
      onFinished: (answers, result) async => outcome = result,
    ));
    await tester.pumpAndSettle();

    // Straight into the pieces: the demanding-worksheet gate already asked, and
    // that answer is the "before".
    expect(find.byKey(const Key('worksheet_before_skip')), findsNothing);
    expect(find.text('One thing?'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('worksheet_field_only')), 'Something');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
    await tester.pumpAndSettle();
    await walkToClosing(tester);

    expect(outcome!.feelingBefore, 3);
  });

  testWidgets('an assigned worksheet asks what got in the way only when it was not done',
      (tester) async {
    final content = parseWorksheetContent({
      'version': 1,
      'fields': [
        {'id': 'only', 'type': 'short_text', 'prompt': 'One thing?'},
      ],
    });

    WorksheetOutcome? outcome;
    await tester.pumpWidget(harness(
      content: content,
      isAssigned: true,
      onFinished: (answers, result) async => outcome = result,
    ));
    await tester.pumpAndSettle();
    await skipBeforeRating(tester);

    await tester.enterText(find.byKey(const ValueKey('worksheet_field_only')), 'Something');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('worksheet_after_skip')));
    await tester.pumpAndSettle();

    expect(find.text('Did you do it?'), findsOneWidget);
    expect(find.text('What got in the way?'), findsNothing);

    await tester.tap(find.byKey(const Key('worksheet_did_it_no')));
    await tester.pumpAndSettle();
    expect(find.text('What got in the way?'), findsOneWidget);
    expect(
      find.text('No judgement. This helps you and your therapist plan better.'),
      findsOneWidget,
    );

    await tester.enterText(find.byKey(const Key('worksheet_barriers')), 'Ran out of time');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('worksheet_finish')));
    await tester.pumpAndSettle();

    expect(outcome!.didIt, isFalse);
    expect(outcome!.barriers, 'Ran out of time');
  });

  testWidgets('an open worksheet never asks what got in the way', (tester) async {
    final content = parseWorksheetContent({
      'version': 1,
      'fields': [
        {'id': 'only', 'type': 'short_text', 'prompt': 'One thing?'},
      ],
    });

    await tester.pumpWidget(harness(content: content));
    await tester.pumpAndSettle();
    await skipBeforeRating(tester);

    await tester.enterText(find.byKey(const ValueKey('worksheet_field_only')), 'Something');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('worksheet_after_skip')));
    await tester.pumpAndSettle();

    expect(find.text('Did you do it?'), findsNothing);
    expect(find.text('What got in the way?'), findsNothing);
  });

  testWidgets('"This helped" is one tap and travels with the answers', (tester) async {
    final content = parseWorksheetContent({
      'version': 1,
      'fields': [
        {'id': 'only', 'type': 'short_text', 'prompt': 'One thing?'},
      ],
    });

    WorksheetOutcome? outcome;
    await tester.pumpWidget(harness(
      content: content,
      onFinished: (answers, result) async => outcome = result,
    ));
    await tester.pumpAndSettle();
    await skipBeforeRating(tester);

    await tester.enterText(find.byKey(const ValueKey('worksheet_field_only')), 'Something');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Finish'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('worksheet_after_skip')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('worksheet_this_helped')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('worksheet_finish')));
    await tester.pumpAndSettle();

    expect(outcome!.helped, isTrue);
  });
}
