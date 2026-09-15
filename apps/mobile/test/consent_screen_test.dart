import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/features/consent/consent_screen.dart';
import 'package:okuvu/src/features/consent/consent_request.dart';
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
          GoRoute(
            path: '/home',
            builder: (_, __) => const Scaffold(body: Center(child: Text('Home'))),
          ),
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
      );

      final json = request.toJson();

      expect(json, {
        'safety_monitoring': true,
        'mood_inference': false,
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

    testWidgets('renders heading, subtitle, and both cards',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      expect(find.text('Before we begin'), findsOneWidget);
      expect(
        find.text('A few things to know about how OKUVU works.'),
        findsOneWidget,
      );
      expect(find.text('Safety monitoring'), findsOneWidget);
      expect(
        find.text('Share chat insights with your therapist'),
        findsOneWidget,
      );
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

    testWidgets('chat-share item defaults on and toggles independently',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      final checkboxes = find.byType(Checkbox);
      Checkbox checkbox(int i) => tester.widget<Checkbox>(checkboxes.at(i));

      expect(checkbox(0).value, true);
      expect(checkbox(1).value, true);

      await tester.tap(find.byType(Checkbox).at(1));
      await tester.pumpAndSettle();

      expect(checkbox(0).value, true);
      expect(checkbox(1).value, false);
    });

    testWidgets(
        'Save and continue sends POST /users/me/consent with correct payload',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      // Uncheck chat-share
      await tester.tap(find.byType(Checkbox).at(1));
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
      expect(body.containsKey('assessment'), isFalse);
      expect(body.containsKey('emergency_contact'), isFalse);
    });

    testWidgets('on success navigates to /home', (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      await scrollToBottom(tester);

      await tester.runAsync(() async {
        await tester.tap(find.text('Save and continue'));
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await tester.pumpAndSettle();

      expect(find.text('Home'), findsOneWidget);
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
      expect(find.text('Home'), findsNothing);

      final checkboxes = find.byType(Checkbox);
      final chatShareCheckbox = tester.widget<Checkbox>(checkboxes.at(1));
      expect(chatShareCheckbox.value, true);
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

    testWidgets('renders both icons', (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      expect(find.byIcon(LucideIcons.shield), findsOneWidget);
      expect(find.byIcon(LucideIcons.messageCircle), findsOneWidget);
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

      await tester.tap(find.byIcon(LucideIcons.arrowLeft));
      await tester.pumpAndSettle();

      expect(find.byType(ConsentScreen), findsNothing);
    });
  });
}
