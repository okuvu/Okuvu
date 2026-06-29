import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';

import 'package:evia/src/app.dart';
import 'package:evia/src/config/app_config.dart';
import 'package:evia/src/core/not_found_screen.dart';
import 'package:evia/src/core/providers.dart';
import 'package:evia/src/router/router.dart';
import 'package:evia/src/core/auth_service.dart';
import 'package:firebase_auth/firebase_auth.dart';

class MockHttpClientAdapter implements HttpClientAdapter {
  RequestOptions? lastRequest;
  int _statusCode = 200;

  void setStatus(int code) => _statusCode = code;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;
    return ResponseBody.fromString('{"success": true}', _statusCode);
  }

  @override
  void close({bool force = false}) {}
}

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

class _TestSessionState extends Notifier<SessionState> {
  @override
  SessionState build() => SessionState.unauthenticated;

  void update(SessionState value) => state = value;
}

final _testSessionState = NotifierProvider<_TestSessionState, SessionState>(_TestSessionState.new);

Dio _createMockDio() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      if (options.path == '/auth/verify-otp') {
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: {'user_id': 'test-id', 'is_new_user': true},
        ));
        return;
      }
      if (options.path == '/users/me/consent') {
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: {'success': true},
        ));
        return;
      }
      handler.next(options);
    },
  ));
  return dio;
}

void main() {
  AppConfig.init('dev');

  testWidgets('App starts at splash screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: App()));
    await tester.pumpAndSettle();

    expect(find.text('Splash Screen'), findsOneWidget);
    expect(find.text('Evia'), findsAtLeast(1));
  });

  testWidgets('Navigation to home via auth flow', (WidgetTester tester) async {
    final adapter = MockHttpClientAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
    dio.httpClientAdapter = adapter;

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authServiceProvider.overrideWithValue(FakeAuthService()),
          sessionProvider.overrideWith((ref) => ref.watch(_testSessionState)),
          dioClientProvider.overrideWithValue(_createMockDio()),
        ],
        child: const App(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Get Started'));
    await tester.pumpAndSettle();
    expect(find.text('Sign In'), findsAtLeast(1));

    await tester.enterText(find.byType(TextField), '9999999999');
    await tester.tap(find.text('Continue with Phone'));
    await tester.pumpAndSettle();
    expect(find.text('OTP Verification'), findsOneWidget);

    for (int i = 0; i < 6; i++) {
      await tester.enterText(find.byKey(ValueKey('otp_$i')), '${i + 1}');
    }
    // Auto-submit triggers verify → backend → navigate → redirect to /auth.
    // Explicit pumps avoid pumpAndSettle getting stuck on the
    // CircularProgressIndicator animation and periodic resend timer.
    await tester.pump();
    await tester.pump();
    await tester.pump();

    // After auto-submit, verify + backend both succeed;
    // session remains unauthenticated, so redirect to /auth would happen.
    // Manually set session and navigate.
    final container = ProviderScope.containerOf(tester.element(find.byType(App)));
    container.read(_testSessionState.notifier).update(SessionState.authenticated);
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
