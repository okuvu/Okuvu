import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/library/safety_plan_screen.dart';

SafetyPlan _plan() => const SafetyPlan(
      intro: "You made this with your therapist for times when things feel too much. It's here whenever you need it.",
      parts: [
        SafetyPlanPart(id: 'signs', prompt: 'Signs a hard moment might be coming'),
        SafetyPlanPart(id: 'on_my_own', prompt: 'Things I can do on my own to get through it'),
        SafetyPlanPart(id: 'people_places', prompt: 'People and places that help take my mind off it'),
        SafetyPlanPart(id: 'ask_for_help', prompt: 'People I can ask for help'),
        SafetyPlanPart(id: 'professional', prompt: 'Professional and crisis support'),
        SafetyPlanPart(id: 'safer_surroundings', prompt: 'Making my surroundings safer'),
        SafetyPlanPart(id: 'one_reason', prompt: 'One reason that matters to me'),
      ],
      answers: {
        'signs': [
          {'item': 'not sleeping'},
        ],
        'one_reason': 'my sister',
      },
      therapistContact: 'Reach me 10am-6pm',
      helplines: [
        Helpline(
          key: 'tele_manas',
          name: 'Tele-MANAS',
          description: 'free, 24 hours',
          phone: '14416',
          display: '14416',
        ),
        Helpline(
          key: 'emergency',
          name: 'Emergency services',
          description: 'Ambulance, police and fire.',
          phone: '112',
          display: '112',
        ),
      ],
    );

Widget _withPlan(SafetyPlan? plan) {
  return ProviderScope(
    overrides: [safetyPlanProvider.overrideWith((ref) async => plan)],
    child: const MaterialApp(home: SafetyPlanScreen()),
  );
}

void main() {
  // A tall viewport so every part of the plan is laid out at once: the screen is
  // a ListView, and a default 800px surface only builds the first few parts.
  void useTallViewport(WidgetTester tester) {
    tester.view.physicalSize = const Size(1200, 4000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
  }

  testWidgets('shows the seven parts, the client\'s words and the crisis lines',
      (tester) async {
    useTallViewport(tester);
    await tester.pumpWidget(_withPlan(_plan()));
    await tester.pumpAndSettle();

    expect(find.textContaining('Part 1. Signs a hard moment'), findsOneWidget);
    expect(find.textContaining('Part 7. One reason that matters'), findsOneWidget);
    expect(find.textContaining('not sleeping'), findsOneWidget);
    expect(find.text('my sister'), findsOneWidget);
    expect(find.textContaining('Reach me 10am-6pm'), findsOneWidget);
    expect(find.textContaining('Tele-MANAS — 14416'), findsOneWidget);
    expect(find.textContaining('Emergency services — 112'), findsOneWidget);

    // Therapist framing never appears on the client's screen.
    expect(find.textContaining('therapistPrompt'), findsNothing);
  });

  testWidgets('the fixed Get help now button raises the crisis screen', (tester) async {
    useTallViewport(tester);
    late ProviderContainer container;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [safetyPlanProvider.overrideWith((ref) async => _plan())],
        child: Consumer(
          builder: (context, ref, _) {
            container = ProviderScope.containerOf(context);
            return const MaterialApp(home: SafetyPlanScreen());
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('safetyPlanGetHelpNow')));
    await tester.pumpAndSettle();

    expect(container.read(crisisOverlayProvider), isTrue);
  });

  testWidgets('says nothing is there when no plan exists yet', (tester) async {
    await tester.pumpWidget(_withPlan(null));
    await tester.pumpAndSettle();

    expect(
      find.text('You and your therapist fill this in together.'),
      findsOneWidget,
    );
  });
}
