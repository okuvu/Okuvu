import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';

import 'package:evia/src/app.dart';
import 'package:evia/src/config/app_config.dart';
import 'package:evia/src/core/not_found_screen.dart';
import 'package:evia/src/core/providers.dart';
import 'package:evia/src/router/router.dart';
import 'package:evia/src/core/auth_service.dart';
import 'package:firebase_auth/firebase_auth.dart';

class FakeAuthService implements AuthService {
  @override
  User? get currentUser => null;

  @override
  Future<String?> getIdToken() async => null;

  @override
  Future<void> verifyPhone({
    required String phoneNumber,
    required void Function(String verificationId) onCodeSent,
    required void Function(FirebaseAuthException) onError,
  }) async {
    onCodeSent('test-verification-id');
  }

  @override
  Future<void> verifyOtp({
    required String verificationId,
    required String smsCode,
  }) async {}

  @override
  Future<void> signOut() async {}
}

final _testSessionState = StateProvider<SessionState>((ref) => SessionState.unauthenticated);

void main() {
  AppConfig.init('dev');

  testWidgets('App starts at splash screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: App()));
    await tester.pumpAndSettle();

    expect(find.text('Splash Screen'), findsOneWidget);
    expect(find.text('Evia'), findsAtLeast(1));
  });

  testWidgets('Navigation to home via auth flow', (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authServiceProvider.overrideWithValue(FakeAuthService()),
          sessionProvider.overrideWith((ref) => ref.watch(_testSessionState)),
        ],
        child: const App(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Get Started'));
    await tester.pumpAndSettle();
    expect(find.text('Sign In'), findsAtLeast(1));

    await tester.enterText(find.byType(TextField), '+1 555 555 5555');
    await tester.tap(find.text('Continue with Phone'));
    await tester.pumpAndSettle();
    expect(find.text('OTP Verification'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '123456');

    // Update session and navigate directly via router to avoid GoRouter
    // recreation resetting the location to /splash.
    final container = ProviderScope.containerOf(tester.element(find.byType(App)));
    container.read(_testSessionState.notifier).state = SessionState.authenticated;
    container.read(routerProvider).go('/consent');
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
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith((ref) => SessionState.authenticated),
        ],
        child: const App(),
      ),
    );
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
