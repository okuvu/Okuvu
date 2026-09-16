import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';

import 'package:okuvu/src/app.dart';
import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/not_found_screen.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/router/router.dart';
import 'package:okuvu/src/core/auth_service.dart';
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
    required void Function(String verificationId, int? forceResendingToken)
        onCodeSent,
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

class _ShowCrisisNotifier extends CrisisOverlayNotifier {
  @override
  bool build() => true;
}

Dio _mockDioForToday({required bool careEnded, String? therapistName}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      if (options.path.endsWith('/users/me/today')) {
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: {
            'careEnded': careEnded,
            'careEndedByTherapistName': therapistName,
          },
        ));
        return;
      }
      handler.resolve(
          Response(requestOptions: options, statusCode: 200, data: {}));
    },
  ));
  return dio;
}

final _testSessionState =
    NotifierProvider<_TestSessionState, SessionState>(_TestSessionState.new);

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
    await tester.pump();

    expect(find.text('OKUVU'), findsOneWidget);
    expect(find.text('A space that listens.'), findsOneWidget);
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
    await tester.pump();

    final container =
        ProviderScope.containerOf(tester.element(find.byType(App)));
    container.read(routerProvider).go('/auth');
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
    container
        .read(_testSessionState.notifier)
        .update(SessionState.authenticated);
    container.read(routerProvider).go('/onboarding/consent');
    await tester.pumpAndSettle();
    expect(find.text('Before we start'), findsOneWidget);

    // Consent submission now completes onboarding and routes straight to
    // /home itself — the guided-chat intake step no longer sits between
    // them (decisions doc round, 15 Sep 2026 — "4 taps, no questions").
    await tester.tap(find.text('Start'));
    await tester.pumpAndSettle();

    expect(find.text('How are you feeling today?'), findsOneWidget);
  });

  testWidgets('Crisis overlay shows all 5 crisis resources',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith((ref) => SessionState.authenticated),
          crisisOverlayProvider.overrideWith(_ShowCrisisNotifier.new),
        ],
        child: const App(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.pump();

    expect(find.text('9152987821'), findsOneWidget);
    expect(find.text('1860-2662-345'), findsOneWidget);
    expect(find.text('080-46110007'), findsOneWidget);
    expect(find.text('044-24640050'), findsOneWidget);
    expect(find.text('112'), findsOneWidget);
  });

  testWidgets('Crisis overlay has no dismiss button',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith((ref) => SessionState.authenticated),
          crisisOverlayProvider.overrideWith(_ShowCrisisNotifier.new),
        ],
        child: const App(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.pump();

    expect(find.text('Dismiss'), findsNothing);
  });

  testWidgets('Crisis overlay does not dismiss when tapped',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith((ref) => SessionState.authenticated),
          crisisOverlayProvider.overrideWith(_ShowCrisisNotifier.new),
        ],
        child: const App(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.pump();

    await tester.tap(find.byKey(const Key('crisisOverlayShieldIcon')));
    await tester.pumpAndSettle();

    expect(find.text('9152987821'), findsOneWidget);
    expect(find.text("You're not alone."), findsOneWidget);
  });

  testWidgets('Crisis overlay requires no network dependencies',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith((ref) => SessionState.authenticated),
          crisisOverlayProvider.overrideWith(_ShowCrisisNotifier.new),
        ],
        child: const App(),
      ),
    );
    await tester.pumpAndSettle();

    // No dioClientProvider or authServiceProvider override is needed.
    // The crisis overlay renders with zero network calls.
    await tester.pump();

    expect(find.text("You're not alone."), findsOneWidget);
    expect(find.text('9152987821'), findsOneWidget);
  });

  testWidgets(
      'Care-ended overlay shows app-wide when careEnded is true',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith((ref) => SessionState.authenticated),
          dioClientProvider.overrideWithValue(
              _mockDioForToday(careEnded: true, therapistName: 'Dr. Rao')),
        ],
        child: const App(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Your therapist has closed this space.'),
        findsOneWidget);
    expect(
        find.textContaining('Dr. Rao has ended your care on OKUVU'),
        findsOneWidget);
    expect(find.text('Get support now'), findsOneWidget);
    expect(find.text('Export my writing'), findsOneWidget);
  });

  testWidgets(
      'Care-ended overlay stays hidden when careEnded is false',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith((ref) => SessionState.authenticated),
          dioClientProvider
              .overrideWithValue(_mockDioForToday(careEnded: false)),
        ],
        child: const App(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Your therapist has closed this space.'), findsNothing);
  });

  testWidgets(
      'Crisis overlay still renders when care has also ended — crisis line always wins',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith((ref) => SessionState.authenticated),
          dioClientProvider.overrideWithValue(
              _mockDioForToday(careEnded: true, therapistName: 'Dr. Rao')),
          crisisOverlayProvider.overrideWith(_ShowCrisisNotifier.new),
        ],
        child: const App(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text("You're not alone."), findsOneWidget);
  });

  testWidgets('Unknown route shows not-found page',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 1.0;

        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
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