import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/features/settings/about_screen.dart';
import 'package:okuvu/src/features/settings/privacy_screen.dart';

Widget _aboutApp() {
  return MaterialApp.router(
    routerConfig: GoRouter(
      initialLocation: '/settings/about',
      routes: [
        GoRoute(
          path: '/settings',
          builder: (_, __) => const Scaffold(
            body: Center(child: Text('Settings Screen')),
          ),
          routes: [
            GoRoute(
              path: 'about',
              builder: (_, __) => const AboutScreen(),
            ),
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
  group('AboutScreen', () {
    testWidgets('renders app info', (tester) async {
      await tester.pumpWidget(_aboutApp());
      await tester.pumpAndSettle();

      expect(find.text('OKUVU'), findsOneWidget);
      expect(find.text('AI Mental Wellness Companion'), findsOneWidget);
      expect(find.text('Version 1.0.0'), findsOneWidget);
      expect(find.byType(FlutterLogo), findsOneWidget);
    });

    testWidgets('renders Privacy Policy button', (tester) async {
      await tester.pumpWidget(_aboutApp());
      await tester.pumpAndSettle();

      expect(find.text('Privacy Policy'), findsOneWidget);
      expect(find.byIcon(LucideIcons.shieldAlert), findsOneWidget);
      expect(find.byType(OutlinedButton), findsOneWidget);
    });

    testWidgets('tapping Privacy Policy navigates to PrivacyScreen',
        (tester) async {
      await tester.pumpWidget(_aboutApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Privacy Policy'));
      await tester.pumpAndSettle();

      expect(find.byType(PrivacyScreen), findsOneWidget);
    });

    testWidgets('Back to Settings button navigates to settings',
        (tester) async {
      await tester.pumpWidget(_aboutApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Back to Settings'));
      await tester.pumpAndSettle();

      expect(find.text('Settings Screen'), findsOneWidget);
    });
  });
}
