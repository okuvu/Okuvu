import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/features/onboarding_welcome/welcome_screen.dart';
import 'package:okuvu/src/features/onboarding_welcome/welcome_provider.dart';

Widget _buildTestApp() {
  return ProviderScope(
    overrides: [
      welcomeInfoProvider.overrideWith(
        (ref) async => const WelcomeInfo(welcomeNote: null, displayAbbreviation: null),
      ),
    ],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/onboarding/welcome',
        routes: [
          GoRoute(
            path: '/onboarding/welcome',
            builder: (_, __) => const WelcomeScreen(),
          ),
          GoRoute(
            path: '/onboarding/age-blocked',
            builder: (_, __) => const Scaffold(body: Text('AGE_BLOCKED_MARKER')),
          ),
          GoRoute(
            path: '/onboarding/consent',
            builder: (_, __) => const Scaffold(body: Text('CONSENT_MARKER')),
          ),
        ],
      ),
    ),
  );
}

void main() {
  group('ageOn — S3-stop age calculation', () {
    test('exact 18th birthday counts as 18', () {
      expect(ageOn(DateTime(2008, 6, 15), DateTime(2026, 6, 15)), 18);
    });

    test('day before 18th birthday still counts as 17', () {
      expect(ageOn(DateTime(2008, 6, 15), DateTime(2026, 6, 14)), 17);
    });

    test('day after birthday counts the completed year', () {
      expect(ageOn(DateTime(2008, 6, 15), DateTime(2026, 6, 16)), 18);
    });

    test('16-year-old is under 18', () {
      final now = DateTime(2026, 9, 15);
      expect(ageOn(DateTime(now.year - 16, now.month, now.day), now) < 18, isTrue);
    });
  });

  group('WelcomeScreen — S3-stop age gate', () {
    testWidgets('requires a date of birth before continuing', (tester) async {
      await tester.pumpWidget(_buildTestApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(find.text('Enter your date of birth to continue'), findsOneWidget);
      expect(find.text('CONSENT_MARKER'), findsNothing);
    });
  });
}
