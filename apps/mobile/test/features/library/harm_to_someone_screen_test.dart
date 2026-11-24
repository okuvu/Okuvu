//
// The harm-to-someone screen (owner-approved copy, 24 Nov 2026).
//
// The thing this file is really guarding: **the words come from the api, not
// from Dart.** Every assertion below builds the screen from a JSON body shaped
// like the real response, so a screenshot of this widget is the copy that was
// signed — not a second version of it drifting in the client.
//
// The layout rules the copy depends on:
//  - 112 is the first row and is tappable (the sentence says "call 112 now");
//  - Vandrevala comes after it, never before;
//  - the alert line says what happened without promising a reply time;
//  - the safety plan button appears only when a plan exists.
//

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/library/harm_to_someone_screen.dart';
import 'package:okuvu/src/features/library/safety_plan_screen.dart';

Map<String, dynamic> _body() => {
      'kind': 'harm_to_someone',
      'paragraphs': [
        'Thank you for writing this down.',
        'It takes courage to say it out loud, and it does not make you a bad person.',
        'Three things that help right now. Put some distance between you and the person, if you can.',
      ],
      'emergency': {
        'label': 'Emergency services',
        'description': 'Ambulance, police and fire.',
        'number': '112',
        'display': '112',
      },
      'resources': [
        {
          'label': 'Vandrevala Foundation',
          'description': '24 hours, call or WhatsApp',
          'number': '+919999666555',
          'display': '+91 9999 666 555',
        },
      ],
      'alert': 'Your therapist has been told this is urgent. They may not be able to reply '
          'straight away, so if you need help right now, call 112.',
      'plan_label': 'My plan for hard moments',
      'closing': 'You can come back to OKUVU whenever you\'re ready.',
    };

SafetyPlan _plan() => const SafetyPlan(
      intro: 'You made this with your therapist.',
      parts: [SafetyPlanPart(id: 'signs', prompt: 'Signs a hard moment might be coming')],
      answers: {
        'signs': [
          {'item': 'not sleeping'},
        ],
      },
      therapistContact: null,
      helplines: [],
    );

Widget _app(HarmToSomeoneScreen screen, {SafetyPlan? plan}) {
  return ProviderScope(
    overrides: [safetyPlanProvider.overrideWith((ref) async => plan)],
    child: MaterialApp(home: Scaffold(body: HarmToSomeoneOverlay(screen: screen))),
  );
}

void main() {
  group('parsing the api body', () {
    test('reads the approved screen', () {
      final screen = HarmToSomeoneScreen.fromJson(_body());

      expect(screen, isNotNull);
      expect(screen!.paragraphs, hasLength(3));
      expect(screen.emergency.number, '112');
      expect(screen.resources.single.label, 'Vandrevala Foundation');
      expect(screen.planLabel, 'My plan for hard moments');
    });

    test('refuses a body that is not this screen', () {
      expect(HarmToSomeoneScreen.fromJson(null), isNull);
      expect(HarmToSomeoneScreen.fromJson({'kind': 'crisis_card'}), isNull);
      // No emergency row: the sentence tells them to call a number the screen
      // cannot dial, so the caller falls back rather than rendering half of it.
      final noEmergency = _body()..remove('emergency');
      expect(HarmToSomeoneScreen.fromJson(noEmergency), isNull);
      // No paragraphs is the same failure.
      final noParagraphs = _body()..['paragraphs'] = <String>[];
      expect(HarmToSomeoneScreen.fromJson(noParagraphs), isNull);
    });
  });

  group('what the client sees', () {
    Future<void> pumpOnPhone(WidgetTester tester, Widget child) async {
      // The screen is taller than the default 800x600 test surface; give it a
      // phone-shaped viewport so nothing under test is off-screen.
      tester.view.physicalSize = const Size(800, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(child);
      await tester.pumpAndSettle();
    }

    testWidgets('renders the approved copy in order, 112 first', (tester) async {
      final screen = HarmToSomeoneScreen.fromJson(_body())!;
      await pumpOnPhone(tester, _app(screen));

      expect(find.text('Thank you for writing this down.'), findsOneWidget);
      expect(find.text('Emergency services'), findsOneWidget);
      expect(find.text('112'), findsOneWidget);
      expect(find.text('Vandrevala Foundation'), findsOneWidget);
      expect(find.text('+91 9999 666 555'), findsOneWidget);

      // 112 sits above Vandrevala on the screen.
      final emergencyY = tester.getTopLeft(find.byKey(const Key('harm_emergency_row'))).dy;
      final vandrevalaY = tester.getTopLeft(find.text('Vandrevala Foundation')).dy;
      expect(emergencyY, lessThan(vandrevalaY));
    });

    testWidgets('says what happened, and never how fast anyone will answer', (tester) async {
      final screen = HarmToSomeoneScreen.fromJson(_body())!;
      await pumpOnPhone(tester, _app(screen));

      expect(find.textContaining('has been told this is urgent'), findsOneWidget);
      expect(find.textContaining('will get back to you'), findsNothing);
      expect(find.textContaining('reply soon'), findsNothing);
    });

    testWidgets('hides the safety plan button when no plan exists', (tester) async {
      final screen = HarmToSomeoneScreen.fromJson(_body())!;
      await pumpOnPhone(tester, _app(screen, plan: null));

      expect(find.byKey(const Key('harm_safety_plan')), findsNothing);
    });

    testWidgets('offers the safety plan, one tap, when one exists', (tester) async {
      final screen = HarmToSomeoneScreen.fromJson(_body())!;
      await pumpOnPhone(tester, _app(screen, plan: _plan()));

      expect(find.byKey(const Key('harm_safety_plan')), findsOneWidget);
      expect(find.text('My plan for hard moments'), findsOneWidget);
    });

    testWidgets('can be closed, and closing clears the overlay state', (tester) async {
      final screen = HarmToSomeoneScreen.fromJson(_body())!;
      final container = ProviderContainer(
        overrides: [safetyPlanProvider.overrideWith((ref) async => _plan())],
      );
      addTearDown(container.dispose);

      await pumpOnPhone(
        tester,
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(home: Scaffold(body: HarmToSomeoneOverlay(screen: screen))),
        ),
      );

      await tester.ensureVisible(find.byKey(const Key('harm_close')));
      await tester.tap(find.byKey(const Key('harm_close')));
      await tester.pumpAndSettle();

      expect(container.read(harmToSomeoneOverlayProvider), isNull);
    });
  });

  group('the gentler screen for a frightening thought', () {
    Future<void> pumpOnPhone(WidgetTester tester, Widget child) async {
      tester.view.physicalSize = const Size(800, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(child);
      await tester.pumpAndSettle();
    }

    Map<String, dynamic> thoughtsBody() => {
          ..._body(),
          'kind': 'harm_to_someone_thoughts',
          'paragraphs': [
            'Thank you for telling me. Saying that out loud is not easy.',
            'A frightening thought is not the same as wanting to act on it. '
                'having one does not make you a bad person. Many people have '
                'thoughts like this and never act on them.',
          ],
          'alert': 'Your therapist has been let know, so you can talk about it '
              'together. They may not be able to reply straight away.',
        };

    testWidgets('shows the normal alert, not the urgent one', (tester) async {
      final screen = HarmToSomeoneScreen.fromJson(thoughtsBody())!;
      await pumpOnPhone(tester, _app(screen));

      expect(find.textContaining('has been let know'), findsOneWidget);
      expect(find.textContaining('talk about it together'), findsOneWidget);
      expect(find.textContaining('urgent'), findsNothing);
    });

    testWidgets('keeps 112 on screen without telling anyone to use it', (tester) async {
      final screen = HarmToSomeoneScreen.fromJson(thoughtsBody())!;
      await pumpOnPhone(tester, _app(screen));

      expect(find.text('112'), findsOneWidget);
      expect(find.textContaining('call 112'), findsNothing);
    });
  });
}
