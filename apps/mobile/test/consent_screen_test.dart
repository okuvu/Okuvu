import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/features/consent/consent_screen.dart';
import 'package:okuvu/src/features/consent/consent_request.dart';
import 'package:okuvu/src/features/intake/intake_screen.dart';
import 'package:okuvu/src/features/intake/cold_start_screen.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/core/auth_service.dart';
import 'package:firebase_auth/firebase_auth.dart';

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

Widget createTestApp(Dio dio) {
  return ProviderScope(
    overrides: [
      dioClientProvider.overrideWithValue(dio),
      authServiceProvider.overrideWithValue(FakeAuthService()),
      userCarePlanProvider.overrideWith((ref) async => null),
    ],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/onboarding/consent',
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) => const SizedBox.shrink(),
          ),
          GoRoute(
            path: '/onboarding/consent',
            builder: (_, __) => const ConsentScreen(),
          ),
          GoRoute(path: '/intake', builder: (_, __) => const IntakeScreen()),
          GoRoute(
            path: '/onboarding/coldstart',
            builder: (_, __) => const ColdStartScreen(),
          ),
        ],
      ),
    ),
  );
}

void main() {
  AppConfig.init('dev');

  group('ConsentRequest', () {
    test('toJson maps fields to snake_case keys', () {
      const request = ConsentRequest(
        safetyMonitoring: true,
        moodInference: false,
        assessment: true,
        emergencyContact: false,
      );

      final json = request.toJson();

      expect(json, {
        'safety_monitoring': true,
        'mood_inference': false,
        'assessment': true,
        'emergency_contact': false,
      });
    });
  });

  group('ConsentScreen', () {
    late Dio dio;
    late MockHttpClientAdapter adapter;

    setUp(() {
      adapter = MockHttpClientAdapter();
      dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
      dio.httpClientAdapter = adapter;
    });

    Future<void> scrollToBottom(WidgetTester tester) async {
      final listView = find.byType(ListView);
      await tester.drag(listView, const Offset(0, -500));
      await tester.pumpAndSettle();
    }

    testWidgets('renders heading, subtitle, progress pill, and all four cards',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      expect(find.text('Before we begin'), findsOneWidget);
      expect(
        find.text('A few things to know about how Evia works.'),
        findsOneWidget,
      );
      expect(find.text('Step 1 of 8'), findsOneWidget);
      expect(find.text('Safety monitoring'), findsOneWidget);
      expect(find.text('Mood understanding'), findsOneWidget);
      expect(find.text('Progress tracking'), findsOneWidget);
      expect(find.text('Emergency contact'), findsOneWidget);
    });

    testWidgets(
        'safety monitoring is checked, shows Required badge, and cannot be toggled',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      expect(find.text('Required'), findsOneWidget);

      final checkboxWidget =
          tester.widget<Checkbox>(find.byType(Checkbox).first);
      expect(checkboxWidget.value, true);
      expect(checkboxWidget.onChanged, isNull);
    });

    testWidgets('optional items show correct defaults and toggle independently',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      final checkboxes = find.byType(Checkbox);

      Checkbox checkbox(int i) => tester.widget<Checkbox>(checkboxes.at(i));

      expect(checkbox(0).value, true);
      expect(checkbox(1).value, true);
      expect(checkbox(2).value, true);
      expect(checkbox(3).value, false);

      // Toggle mood understanding off
      await tester.tap(find.byType(Checkbox).at(1));
      await tester.pumpAndSettle();

      expect(checkbox(0).value, true);
      expect(checkbox(1).value, false);
      expect(checkbox(2).value, true);
      expect(checkbox(3).value, false);

      // Toggle progress tracking off
      await tester.tap(find.byType(Checkbox).at(2));
      await tester.pumpAndSettle();

      expect(checkbox(0).value, true);
      expect(checkbox(1).value, false);
      expect(checkbox(2).value, false);
      expect(checkbox(3).value, false);

      // Toggle emergency contact on
      await tester.tap(find.byType(Checkbox).at(3));
      await tester.pumpAndSettle();

      expect(checkbox(0).value, true);
      expect(checkbox(1).value, false);
      expect(checkbox(2).value, false);
      expect(checkbox(3).value, true);
    });

    testWidgets(
        'Save and continue sends POST /users/me/consent with correct payload',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      // Uncheck mood, toggle emergency on
      await tester.tap(find.byType(Checkbox).at(1));
      await tester.tap(find.byType(Checkbox).at(3));
      await tester.pumpAndSettle();

      await scrollToBottom(tester);

      await tester.tap(find.text('Save and continue'));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pump(const Duration(seconds: 1));

      expect(adapter.lastRequest, isNotNull);
      expect(adapter.lastRequest!.path, '/users/me/consent');
      expect(adapter.lastRequest!.method, 'POST');

      final body = adapter.lastRequest!.data as Map<String, dynamic>;
      expect(body['safety_monitoring'], true);
      expect(body['mood_inference'], false);
      expect(body['assessment'], true);
      expect(body['emergency_contact'], true);
    });

    testWidgets('on success navigates to /intake', (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      await scrollToBottom(tester);

      await tester.runAsync(() async {
        await tester.tap(find.text('Save and continue'));
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await tester.pumpAndSettle();

      expect(
        find.text("What's been weighing on your mind lately?"),
        findsOneWidget,
      );
    });

    testWidgets('on failure shows error message and preserves state',
        (WidgetTester tester) async {
      adapter.setStatus(400);

      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      await scrollToBottom(tester);

      await tester.tap(find.text('Save and continue'));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pumpAndSettle();

      expect(
        find.text('Something went wrong. Please try again.'),
        findsOneWidget,
      );
      expect(
        find.textContaining("What's been weighing"),
        findsNothing,
      );

      final checkboxes = find.byType(Checkbox);
      final moodCheckbox = tester.widget<Checkbox>(checkboxes.at(1));
      expect(moodCheckbox.value, true);
    });

    testWidgets('button is enabled after scrolling to bottom',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      await scrollToBottom(tester);

      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNotNull,
      );
    });

    testWidgets('Continue button shows loading state during submission',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      await scrollToBottom(tester);

      final continueButton = find.text('Save and continue');
      await tester.tap(continueButton);
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );

      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pumpAndSettle();
    });

    testWidgets('renders all four icons', (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.shield), findsOneWidget);
      expect(find.byIcon(Icons.favorite), findsOneWidget);
      expect(find.byIcon(Icons.bar_chart), findsOneWidget);
      expect(find.byIcon(Icons.phone), findsOneWidget);
    });

    testWidgets('renders footer text', (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      expect(
        find.text('You can change any of these in Settings > Privacy.'),
        findsOneWidget,
      );
    });

    testWidgets('back arrow navigates to previous route',
        (WidgetTester tester) async {
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) => const SizedBox.shrink(),
          ),
          GoRoute(
            path: '/onboarding/consent',
            builder: (_, __) => const ConsentScreen(),
          ),
          GoRoute(
            path: '/intake',
            builder: (_, __) => const IntakeScreen(),
          ),
        ],
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            dioClientProvider.overrideWithValue(dio),
            authServiceProvider.overrideWithValue(FakeAuthService()),
            userCarePlanProvider.overrideWith((ref) async => null),
          ],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pumpAndSettle();

      router.push('/onboarding/consent');
      await tester.pumpAndSettle();

      expect(find.byType(ConsentScreen), findsOneWidget);

      await tester.tap(find.byIcon(Icons.arrow_back));
      await tester.pumpAndSettle();

      expect(find.byType(ConsentScreen), findsNothing);
    });
  });
}
