import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/features/intake/care_plan_provider.dart';
import 'package:okuvu/src/features/intake/cold_start_screen.dart';
import 'package:okuvu/src/features/intake/onboarding_provider.dart';

/// Controllable starting value — no SharedPreferences override needed since
/// the provider's default (unoverridden) form is already in-memory-only.
class FakeOnboardingCompleteNotifier extends OnboardingCompleteNotifier {
  FakeOnboardingCompleteNotifier(this._initial);

  final bool _initial;

  @override
  bool build() => _initial;

  @override
  Future<void> complete() async {
    state = true;
  }
}

Widget createTestApp({required bool hasCompletedOnboarding, required UserCarePlan? carePlan}) {
  final testRouter = GoRouter(
    initialLocation: '/onboarding/coldstart',
    routes: [
      GoRoute(
        path: '/onboarding/coldstart',
        builder: (_, __) => const ColdStartScreen(),
      ),
      GoRoute(
        path: '/home',
        builder: (_, __) => const Scaffold(body: Text('HOME_MARKER')),
      ),
      GoRoute(
        path: '/onboarding/consent',
        builder: (_, __) => const Scaffold(body: Text('CONSENT_MARKER')),
      ),
      GoRoute(
        path: '/chat',
        builder: (_, __) => const Scaffold(body: Text('CHAT_MARKER')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      userCarePlanProvider.overrideWith((ref) async => carePlan),
      hasCompletedOnboardingProvider.overrideWith(
        () => FakeOnboardingCompleteNotifier(hasCompletedOnboarding),
      ),
    ],
    child: MaterialApp.router(routerConfig: testRouter),
  );
}

void main() {
  group('ColdStartScreen — repeat-visit behavior', () {
    testWidgets(
      'returning user with an existing care plan and completed onboarding goes straight to Home',
      (tester) async {
        await tester.pumpWidget(createTestApp(
          hasCompletedOnboarding: true,
          carePlan: const UserCarePlan(carePlanId: 'CP1', focusAreaName: 'Anxiety & Worry'),
        ));
        await tester.pumpAndSettle();

        expect(find.text('HOME_MARKER'), findsOneWidget);
        expect(find.text('Your space is ready.'), findsNothing);
      },
    );

    testWidgets(
      'first-time user with a care plan but no completed onboarding sees the greeting',
      (tester) async {
        await tester.pumpWidget(createTestApp(
          hasCompletedOnboarding: false,
          carePlan: const UserCarePlan(carePlanId: 'CP1', focusAreaName: 'Anxiety & Worry'),
        ));
        await tester.pumpAndSettle();

        expect(find.text('Your space is ready.'), findsOneWidget);
        expect(find.text('HOME_MARKER'), findsNothing);
      },
    );

    testWidgets(
      'no care plan and completed onboarding goes to Home, not consent',
      (tester) async {
        await tester.pumpWidget(createTestApp(
          hasCompletedOnboarding: true,
          carePlan: null,
        ));
        await tester.pumpAndSettle();

        expect(find.text('HOME_MARKER'), findsOneWidget);
      },
    );

    testWidgets(
      'no care plan and no completed onboarding goes to consent',
      (tester) async {
        await tester.pumpWidget(createTestApp(
          hasCompletedOnboarding: false,
          carePlan: null,
        ));
        await tester.pumpAndSettle();

        expect(find.text('CONSENT_MARKER'), findsOneWidget);
      },
    );
  });
}
