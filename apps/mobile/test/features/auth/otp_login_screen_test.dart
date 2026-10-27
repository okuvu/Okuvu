import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/features/auth/otp_login_screen.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/core/auth_service.dart';
import 'package:okuvu/src/router/router.dart';

import '../../support/fake_auth_service.dart';

/// Responds per-path so the same adapter can drive both the invite-redeem
/// and the normal verify-otp branches within one test.
class RoutedMockAdapter implements HttpClientAdapter {
  RequestOptions? lastRequest;
  final Map<String, int> statusByPathSuffix = {};
  final Map<String, String> bodyByPathSuffix = {};

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;
    final suffix = statusByPathSuffix.keys.firstWhere(
      (k) => options.path.endsWith(k),
      orElse: () => '',
    );
    final status = statusByPathSuffix[suffix] ?? 200;
    final body = bodyByPathSuffix[suffix] ?? '{"success": true}';
    return ResponseBody.fromString(body, status);
  }

  @override
  void close({bool force = false}) {}
}

Widget createTestApp(Dio dio, {FakeAuthService? authService}) {
  final testRouter = GoRouter(
    initialLocation: '/auth',
    routes: [
      GoRoute(path: '/auth', builder: (_, __) => const OtpLoginScreen()),
      GoRoute(
        path: '/onboarding/welcome',
        builder: (_, __) => const Scaffold(body: Text('WELCOME_SCREEN_MARKER')),
      ),
      GoRoute(
        path: '/onboarding/coldstart',
        builder: (_, __) => const Scaffold(body: Text('COLDSTART_MARKER')),
      ),
      GoRoute(
        path: '/waitlist',
        builder: (_, state) => Scaffold(
          body: Text('WAITLIST_MARKER:${state.extra}'),
        ),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      dioClientProvider.overrideWithValue(dio),
      authServiceProvider.overrideWithValue(authService ?? FakeAuthService()),
      routerProvider.overrideWithValue(testRouter),
    ],
    child: MaterialApp.router(routerConfig: testRouter),
  );
}

Future<void> enterPhoneAndSendOtp(WidgetTester tester) async {
  await tester.enterText(find.byKey(const ValueKey('phone_input')), '9876543210');
  await tester.tap(find.text('Continue with Phone'));
  await tester.pumpAndSettle();
}

Future<void> enterOtp(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.enterText(find.byKey(ValueKey('otp_$i')), '1');
  }
  await tester.pumpAndSettle();
}

void main() {
  AppConfig.init('dev');

  group('OtpLoginScreen — invite code (therapist-portal wireframes C-06)', () {
    late Dio dio;
    late RoutedMockAdapter adapter;

    setUp(() {
      adapter = RoutedMockAdapter();
      dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
      dio.httpClientAdapter = adapter;
    });

    testWidgets('invite code field is hidden until "Have an invite code?" is tapped', (tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('invite_code_input')), findsNothing);

      await tester.tap(find.text('Have an invite code?'));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('invite_code_input')), findsOneWidget);
    });

    testWidgets('with a valid code, redeems the invite and navigates to the welcome screen', (tester) async {
      adapter.statusByPathSuffix['/invites/redeem'] = 200;

      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Have an invite code?'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('invite_code_input')), 'AB12CD34');

      await enterPhoneAndSendOtp(tester);
      await enterOtp(tester);

      expect(adapter.lastRequest?.path, contains('/invites/redeem'));
      expect(find.text('WELCOME_SCREEN_MARKER'), findsOneWidget);
      expect(find.text('COLDSTART_MARKER'), findsNothing);
    });

    testWidgets('normalizes a lowercase/mixed-case code to uppercase before redeeming', (tester) async {
      adapter.statusByPathSuffix['/invites/redeem'] = 200;

      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Have an invite code?'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('invite_code_input')), 'ab12cd34');

      await enterPhoneAndSendOtp(tester);
      await enterOtp(tester);

      expect(adapter.lastRequest?.path, contains('/invites/redeem'));
      expect(adapter.lastRequest?.data, containsPair('token', 'AB12CD34'));
    });

    testWidgets('invite code field enforces an 8-character max length', (tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Have an invite code?'));
      await tester.pumpAndSettle();

      final field = tester.widget<TextField>(find.byKey(const ValueKey('invite_code_input')));
      expect(field.maxLength, 8);
    });

    testWidgets('shows a friendly message when the code was already redeemed', (tester) async {
      adapter.statusByPathSuffix['/invites/redeem'] = 409;
      adapter.bodyByPathSuffix['/invites/redeem'] =
          '{"error": {"code": "ALREADY_REDEEMED", "message": "used"}}';

      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Have an invite code?'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('invite_code_input')), 'AB12CD34');

      await enterPhoneAndSendOtp(tester);
      await enterOtp(tester);

      expect(find.text('This invite code has already been used.'), findsOneWidget);
      expect(find.text('WELCOME_SCREEN_MARKER'), findsNothing);
    });

    testWidgets('without a code, falls through to the normal verify-otp flow unchanged', (tester) async {
      adapter.bodyByPathSuffix['/auth/verify-otp'] = '{"is_new_user": true}';

      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      await enterPhoneAndSendOtp(tester);
      await enterOtp(tester);

      expect(adapter.lastRequest?.path, contains('/auth/verify-otp'));
      expect(find.text('COLDSTART_MARKER'), findsOneWidget);
    });

    testWidgets('without a code and no matching account, navigates to the waitlist (S6)', (tester) async {
      adapter.statusByPathSuffix['/auth/verify-otp'] = 404;
      adapter.bodyByPathSuffix['/auth/verify-otp'] =
          '{"error": {"code": "NO_ACCOUNT", "message": "no account"}}';

      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      await enterPhoneAndSendOtp(tester);
      await enterOtp(tester);

      expect(find.text('WAITLIST_MARKER:+919876543210'), findsOneWidget);
      expect(find.text('COLDSTART_MARKER'), findsNothing);
    });
  });

  group('OtpLoginScreen — OTP digit boxes', () {
    late Dio dio;
    late RoutedMockAdapter adapter;

    setUp(() {
      adapter = RoutedMockAdapter();
      dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
      dio.httpClientAdapter = adapter;
    });

    testWidgets('rejects a non-digit character typed into a box', (tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();
      await enterPhoneAndSendOtp(tester);

      await tester.enterText(find.byKey(const ValueKey('otp_0')), 'a');
      await tester.pump();

      final box = tester.widget<TextField>(find.byKey(const ValueKey('otp_0')));
      expect(box.controller?.text, isEmpty);
    });

    testWidgets('accepts a digit typed into a box', (tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();
      await enterPhoneAndSendOtp(tester);

      await tester.enterText(find.byKey(const ValueKey('otp_0')), '7');
      await tester.pump();

      final box = tester.widget<TextField>(find.byKey(const ValueKey('otp_0')));
      expect(box.controller?.text, '7');
    });
  });

  group('OtpLoginScreen — Cognito OTP flow and failures', () {
    late Dio dio;
    late RoutedMockAdapter adapter;
    late FakeAuthService authService;

    setUp(() {
      adapter = RoutedMockAdapter();
      dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
      dio.httpClientAdapter = adapter;
      authService = FakeAuthService();
    });

    testWidgets('phone → OTP → verify drives AuthService with the entered code',
        (tester) async {
      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();

      await enterPhoneAndSendOtp(tester);

      // Phone step normalized to E.164 before reaching AuthService.
      expect(authService.verifyPhoneCallCount, 1);
      expect(authService.lastPhoneNumber, '+919876543210');
      expect(find.text('OTP Verification'), findsOneWidget);

      await enterOtp(tester);

      expect(authService.lastVerificationId, 'test-verification-id');
      expect(authService.lastSmsCode, '111111');
      expect(adapter.lastRequest?.path, contains('/auth/verify-otp'));
      expect(find.text('COLDSTART_MARKER'), findsOneWidget);
    });

    testWidgets('resend: after the cooldown, "Resend code" asks AuthService again',
        (tester) async {
      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();
      await enterPhoneAndSendOtp(tester);

      // Cooldown is 30s — the button only appears once the timer runs out.
      expect(find.text('Resend code'), findsNothing);

      await tester.pump(const Duration(seconds: 31));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Resend code'));
      await tester.pumpAndSettle();

      expect(authService.verifyPhoneCallCount, 2);
      expect(authService.lastPhoneNumber, '+919876543210');
      // Still on the OTP step, with a fresh cooldown running.
      expect(find.text('OTP Verification'), findsOneWidget);
    });

    testWidgets('phone step shows the Cognito error message', (tester) async {
      authService.verifyPhoneError = const AuthException(
        'LimitExceededException',
        'Too many attempts. Try again in a few minutes.',
      );

      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();
      await enterPhoneAndSendOtp(tester);

      expect(
        find.text('Too many attempts. Try again in a few minutes.'),
        findsOneWidget,
      );
      expect(find.text('OTP Verification'), findsNothing);
    });

    testWidgets('wrong code shows the mapped message and clears the boxes',
        (tester) async {
      authService.verifyOtpError = const AuthException(
        'CodeMismatchException',
        'That code is incorrect.',
      );

      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();
      await enterPhoneAndSendOtp(tester);
      await enterOtp(tester);

      expect(find.text('That code is incorrect.'), findsOneWidget);
      expect(find.text('COLDSTART_MARKER'), findsNothing);

      final box = tester.widget<TextField>(find.byKey(const ValueKey('otp_0')));
      expect(box.controller?.text, isEmpty);
    });

    testWidgets('failed resend surfaces its own error on the OTP step',
        (tester) async {
      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();
      await enterPhoneAndSendOtp(tester);

      authService.verifyPhoneError = const AuthException(
        'ExpiredCodeException',
        'That code has expired. Request a new one.',
      );

      await tester.pump(const Duration(seconds: 31));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Resend code'));
      await tester.pumpAndSettle();

      expect(
        find.text('That code has expired. Request a new one.'),
        findsOneWidget,
      );
    });
  });
}
