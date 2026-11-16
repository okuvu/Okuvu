import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/auth_service.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/auth/self_serve_signup_screen.dart';
import 'package:okuvu/src/router/router.dart';

import '../../support/fake_auth_service.dart';

/// The on-boarding screen that creates the account.
///
/// Two rules are the point of it: nothing is created until the client answers
/// the 18+ question, and "under 18" creates nothing at all — it signs out and
/// leaves the person on the closing screen.

Widget createTestApp(FakeAuthService auth, {String? email = 'stranger@example.com'}) {
  final router = GoRouter(
    initialLocation: '/onboarding/signup',
    routes: [
      GoRoute(
        path: '/onboarding/signup',
        builder: (_, __) => SelfServeSignupScreen(email: email),
      ),
      GoRoute(
        path: '/home',
        builder: (_, __) => const Scaffold(body: Text('HOME_MARKER')),
      ),
      GoRoute(
        path: '/auth',
        builder: (_, __) => const Scaffold(body: Text('AUTH_MARKER')),
      ),
      GoRoute(
        path: '/onboarding/age-blocked',
        builder: (_, __) => const Scaffold(body: Text('AGE_BLOCKED_MARKER')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(auth),
      routerProvider.overrideWithValue(router),
    ],
    child: MaterialApp.router(routerConfig: router),
  );
}

void main() {
  AppConfig.init('dev');

  late FakeAuthService auth;

  setUp(() {
    auth = FakeAuthService();
  });

  testWidgets('cannot create an account before the age question is answered',
      (tester) async {
    await tester.pumpWidget(createTestApp(auth));
    await tester.pumpAndSettle();

    final button = tester.widget<FilledButton>(
      find.byKey(const ValueKey('create_account_button')),
    );
    expect(button.onPressed, isNull);
    expect(auth.signUpCallCount, 0);
  });

  testWidgets('creates the account for an adult and goes straight home',
      (tester) async {
    await tester.pumpWidget(createTestApp(auth));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('age_adult_option')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('create_account_button')));
    await tester.pumpAndSettle();

    expect(auth.signUpCallCount, 1);
    expect(auth.signedUpAdult, isTrue);
    expect(auth.signedUpShareSummaries, isFalse);
    expect(find.text('HOME_MARKER'), findsOneWidget);
  });

  testWidgets('passes the optional chat-share answer through', (tester) async {
    await tester.pumpWidget(createTestApp(auth));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('age_adult_option')));
    await tester.pumpAndSettle();
    // The second consent card is the only tappable checkbox.
    await tester.tap(find.byType(Checkbox).last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('create_account_button')));
    await tester.pumpAndSettle();

    expect(auth.signedUpAdult, isTrue);
    expect(auth.signedUpShareSummaries, isTrue);
  });

  testWidgets('an under-18 answer creates nothing, signs out and blocks',
      (tester) async {
    auth.signUpError = const AuthException(
      'UNDER_18',
      'OKUVU is for adults aged 18 and over.',
    );

    await tester.pumpWidget(createTestApp(auth));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('age_minor_option')));
    await tester.pumpAndSettle();
    // The label changes with the answer: no "Create my account" for someone
    // who has just said they are not eligible.
    expect(find.text('Continue'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('create_account_button')));
    await tester.pumpAndSettle();

    expect(auth.signedUpAdult, isFalse);
    expect(auth.signOutCalled, isTrue);
    expect(find.text('AGE_BLOCKED_MARKER'), findsOneWidget);
  });

  testWidgets('a server-side UNDER_18 for an adult answer also blocks',
      (tester) async {
    auth.signUpError = const AuthException(
      'UNDER_18',
      'OKUVU is for adults aged 18 and over.',
    );

    await tester.pumpWidget(createTestApp(auth));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('age_adult_option')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('create_account_button')));
    await tester.pumpAndSettle();

    expect(auth.signOutCalled, isTrue);
    expect(find.text('AGE_BLOCKED_MARKER'), findsOneWidget);
  });

  testWidgets('shows the failure and stays put when creation fails',
      (tester) async {
    auth.signUpError = const AuthException(
      'EMAIL_IN_USE',
      'This email is already connected to a different sign-in method. Please contact support.',
    );

    await tester.pumpWidget(createTestApp(auth));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('age_adult_option')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('create_account_button')));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'This email is already connected to a different sign-in method. Please contact support.',
      ),
      findsOneWidget,
    );
    expect(find.text('HOME_MARKER'), findsNothing);
    expect(auth.signOutCalled, isFalse);
  });

  testWidgets('shows which Google account is being turned into an account',
      (tester) async {
    await tester.pumpWidget(createTestApp(auth));
    await tester.pumpAndSettle();

    expect(
      find.text('Creating your account for stranger@example.com'),
      findsOneWidget,
    );
  });
}
