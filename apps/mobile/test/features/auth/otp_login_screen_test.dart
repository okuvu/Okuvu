import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/features/auth/otp_login_screen.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/core/auth_service.dart';
import 'package:okuvu/src/router/router.dart';

/// Firebase-free fake — otp_login_screen.dart's own tests (this file) hit
/// the same Firebase-in-tests landmine documented elsewhere this session
/// (Firebase.initializeApp() unavailable in the test harness). Mirrors
/// consent_screen_test.dart's FakeAuthService exactly.
class FakeAuthService implements AuthService {
  @override
  User? get currentUser => null;

  @override
  Future<String?> getIdToken() async => null;

  @override
  Future<void> verifyPhone({
    required String phoneNumber,
    required void Function(String verificationId, int? forceResendingToken) onCodeSent,
    required void Function(FirebaseAuthException) onError,
    int? forceResendingToken,
  }) async {
    onCodeSent('test-verification-id', null);
  }

  @override
  Future<void> verifyOtp({
    required String verificationId,
    required String smsCode,
  }) async {}

  @override
  Future<void> signOut() async {}
}

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

Widget createTestApp(Dio dio) {
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
      authServiceProvider.overrideWithValue(FakeAuthService()),
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
}
