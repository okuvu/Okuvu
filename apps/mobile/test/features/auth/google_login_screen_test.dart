import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/auth_service.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/auth/google_login_screen.dart';
import 'package:okuvu/src/router/router.dart';

import '../../support/fake_auth_service.dart';

/// Responds per-path so one adapter can drive both the invite-redeem branch and
/// the plain sign-in branch inside a single test.
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
      GoRoute(path: '/auth', builder: (_, __) => const GoogleLoginScreen()),
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

Future<void> tapGoogleButton(WidgetTester tester) async {
  await tester.tap(find.byKey(const ValueKey('google_sign_in_button')));
  await tester.pumpAndSettle();
}

void main() {
  AppConfig.init('dev');

  late Dio dio;
  late RoutedMockAdapter adapter;
  late FakeAuthService authService;

  setUp(() {
    adapter = RoutedMockAdapter();
    dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
    dio.httpClientAdapter = adapter;
    authService = FakeAuthService();
  });

  group('GoogleLoginScreen — sign-in', () {
    testWidgets('offers Google sign-in and no phone/OTP entry point',
        (tester) async {
      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();

      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.byKey(const ValueKey('phone_input')), findsNothing);
      expect(find.text('Continue with Phone'), findsNothing);
    });

    testWidgets('signs in, then continues to onboarding for a known account',
        (tester) async {
      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();

      await tapGoogleButton(tester);

      expect(authService.signInCallCount, 1);
      expect(find.text('COLDSTART_MARKER'), findsOneWidget);
    });

    testWidgets('sends an unknown Google account to the waitlist with its email',
        (tester) async {
      authService.hasAccountResult = false;
      authService.emailResult = 'stranger@example.com';

      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();
      await tapGoogleButton(tester);

      expect(find.text('WAITLIST_MARKER:stranger@example.com'), findsOneWidget);
      expect(find.text('COLDSTART_MARKER'), findsNothing);
    });

    testWidgets('renders the AuthService failure message and stays put',
        (tester) async {
      authService.signInError = const AuthException(
        'EMAIL_IN_USE',
        'This email is already connected to a different sign-in method. Please contact support.',
      );

      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();
      await tapGoogleButton(tester);

      expect(
        find.text(
          'This email is already connected to a different sign-in method. Please contact support.',
        ),
        findsOneWidget,
      );
      expect(find.text('COLDSTART_MARKER'), findsNothing);
    });

    testWidgets('shows nothing extra when the user cancels the Google dialog',
        (tester) async {
      authService.signInError = const AuthException('Cancelled', 'Sign-in cancelled.');

      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();
      await tapGoogleButton(tester);

      expect(find.byKey(const ValueKey('sign_in_error')), findsNothing);
    });
  });

  group('GoogleLoginScreen — invite code (therapist-portal wireframes C-06)', () {
    testWidgets('field is hidden until "Have an invite code?" is tapped',
        (tester) async {
      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('invite_code_input')), findsNothing);

      await tester.tap(find.text('Have an invite code?'));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('invite_code_input')), findsOneWidget);
    });

    testWidgets('enforces an 8-character max length', (tester) async {
      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Have an invite code?'));
      await tester.pumpAndSettle();

      final field = tester.widget<TextField>(
        find.byKey(const ValueKey('invite_code_input')),
      );
      expect(field.maxLength, 8);
    });

    testWidgets('redeems the code after sign-in and goes to the welcome screen',
        (tester) async {
      adapter.statusByPathSuffix['/invites/redeem'] = 200;

      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Have an invite code?'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('invite_code_input')),
        'ab12cd34',
      );

      await tapGoogleButton(tester);

      expect(adapter.lastRequest?.path, contains('/invites/redeem'));
      // Normalised to upper case before it leaves the device.
      expect(adapter.lastRequest?.data, containsPair('token', 'AB12CD34'));
      expect(find.text('WELCOME_SCREEN_MARKER'), findsOneWidget);
      expect(find.text('COLDSTART_MARKER'), findsNothing);
    });

    testWidgets('shows a friendly message when the code was already used',
        (tester) async {
      adapter.statusByPathSuffix['/invites/redeem'] = 409;
      adapter.bodyByPathSuffix['/invites/redeem'] =
          '{"error": {"code": "ALREADY_REDEEMED", "message": "used"}}';

      await tester.pumpWidget(createTestApp(dio, authService: authService));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Have an invite code?'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('invite_code_input')),
        'AB12CD34',
      );

      await tapGoogleButton(tester);

      expect(find.text('This invite code has already been used.'), findsOneWidget);
      expect(find.text('WELCOME_SCREEN_MARKER'), findsNothing);
    });
  });
}
