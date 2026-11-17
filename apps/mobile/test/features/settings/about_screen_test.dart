import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'package:okuvu/src/features/settings/about_screen.dart';
import 'package:okuvu/src/features/settings/privacy_screen.dart';

Widget _aboutApp() {
  return ProviderScope(
    child: MaterialApp.router(
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
    ),
  );
}

void main() {
  setUp(() {
    PackageInfo.setMockInitialValues(
      appName: 'Okuvu',
      packageName: 'ai.okuvu.app',
      version: '1.0.21',
      buildNumber: '22',
      buildSignature: '',
    );
  });

  group('AboutScreen', () {
    testWidgets('renders app info', (tester) async {
      await tester.pumpWidget(_aboutApp());
      await tester.pumpAndSettle();

      expect(find.text('OKUVU'), findsOneWidget);
      expect(find.text('AI Mental Wellness Companion'), findsOneWidget);
      expect(find.text('Version 1.0.21 (22)'), findsOneWidget);
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
