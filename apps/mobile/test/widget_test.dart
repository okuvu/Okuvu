import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';

import 'package:evia/src/app.dart';
import 'package:evia/src/config/app_config.dart';
import 'package:evia/src/core/not_found_screen.dart';

void main() {
  AppConfig.init('dev');

  testWidgets('App starts at splash screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: App()));
    await tester.pumpAndSettle();

    expect(find.text('Splash Screen'), findsOneWidget);
    expect(find.text('Evia'), findsAtLeast(1));
  });

  testWidgets('Navigation to home via auth flow', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: App()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Get Started'));
    await tester.pumpAndSettle();
    expect(find.text('Auth Screen'), findsOneWidget);

    await tester.tap(find.text('Continue with Phone'));
    await tester.pumpAndSettle();
    expect(find.text('OTP Verification'), findsOneWidget);

    await tester.tap(find.text('Verify & Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Consent Screen'), findsOneWidget);

    await tester.tap(find.text('Accept & Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Intake Screen'), findsOneWidget);

    await tester.tap(find.text('Complete & Go Home'));
    await tester.pumpAndSettle();

    expect(find.text('Home Screen'), findsOneWidget);
    expect(find.textContaining('Environment:'), findsOneWidget);
    expect(find.textContaining('Base URL:'), findsOneWidget);
  });

  testWidgets('Crisis overlay renders on top without replacing screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: App()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Get Started'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue with Phone'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Verify & Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Accept & Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Complete & Go Home'));
    await tester.pumpAndSettle();

    expect(find.text('Home Screen'), findsOneWidget);

    final crisisButton = find.text('Crisis Support');
    await tester.ensureVisible(crisisButton);
    await tester.tap(crisisButton);
    await tester.pumpAndSettle();

    expect(find.text('Home Screen'), findsOneWidget);
    expect(find.text('Crisis Support'), findsAtLeast(1));

    await tester.tap(find.text('Dismiss'));
    await tester.pumpAndSettle();

    expect(find.text('Home Screen'), findsOneWidget);
  });

  testWidgets('Unknown route shows not-found page', (WidgetTester tester) async {
    final router = GoRouter(
      initialLocation: '/nonexistent-route',
      routes: const [],
      errorBuilder: (context, state) => const NotFoundScreen(),
    );

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Page not found'), findsOneWidget);
  });
}
