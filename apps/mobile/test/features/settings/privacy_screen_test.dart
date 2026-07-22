import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:evia/src/features/settings/privacy_screen.dart';

Widget _privacyApp() {
  return MaterialApp.router(
    routerConfig: GoRouter(
      initialLocation: '/settings/privacy-policy',
      routes: [
        GoRoute(
          path: '/settings',
          builder: (_, __) => const Scaffold(
            body: Center(child: Text('Settings Screen')),
          ),
          routes: [
            GoRoute(
              path: 'privacy-policy',
              builder: (_, __) => const PrivacyScreen(),
            ),
          ],
        ),
      ],
    ),
  );
}

void main() {
  group('PrivacyScreen', () {
    testWidgets('renders Privacy Policy title in AppBar', (tester) async {
      await tester.pumpWidget(_privacyApp());
      await tester.pumpAndSettle();

      expect(find.text('Privacy Policy'), findsAtLeastNWidgets(1));
    });

    testWidgets('renders privacy icon', (tester) async {
      await tester.pumpWidget(_privacyApp());
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.privacy_tip), findsOneWidget);
    });

    testWidgets('renders description text', (tester) async {
      await tester.pumpWidget(_privacyApp());
      await tester.pumpAndSettle();

      expect(
        find.textContaining('understand how we collect, use, and protect'),
        findsOneWidget,
      );
    });

    testWidgets('renders Read Privacy Policy button', (tester) async {
      await tester.pumpWidget(_privacyApp());
      await tester.pumpAndSettle();

      expect(find.text('Read Privacy Policy'), findsOneWidget);
      expect(find.byType(FilledButton), findsOneWidget);
    });

    testWidgets('back button navigates to settings', (tester) async {
      await tester.pumpWidget(_privacyApp());
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.arrow_back));
      await tester.pumpAndSettle();

      expect(find.text('Settings Screen'), findsOneWidget);
    });
  });
}
