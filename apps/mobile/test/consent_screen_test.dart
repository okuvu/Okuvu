import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';

import 'package:evia/src/config/app_config.dart';
import 'package:evia/src/features/consent/consent_screen.dart';
import 'package:evia/src/features/consent/consent_request.dart';
import 'package:evia/src/features/intake/intake_screen.dart';
import 'package:evia/src/core/providers.dart';
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
    ],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/consent',
        routes: [
          GoRoute(path: '/consent', builder: (_, __) => const ConsentScreen()),
          GoRoute(path: '/intake', builder: (_, __) => const IntakeScreen()),
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

    testWidgets('renders all four consent items', (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      expect(find.text('Safety monitoring'), findsOneWidget);
      expect(find.text('Mood inference'), findsOneWidget);
      expect(find.text('Assessment'), findsOneWidget);
      expect(find.text('Emergency contact'), findsOneWidget);
    });

    testWidgets('safety monitoring is checked and cannot be toggled off',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      final safetyTile = find.text('Safety monitoring');
      await tester.tap(safetyTile);
      await tester.pumpAndSettle();

      final checkboxes = find.byType(CheckboxListTile);
      final firstCheckbox = tester.widget<CheckboxListTile>(checkboxes.first);
      expect(firstCheckbox.value, true);
      expect(firstCheckbox.onChanged, isNull);
    });

    testWidgets('optional items toggle independently',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      final checkboxes = find.byType(CheckboxListTile);

      CheckboxListTile tile(int i) =>
          tester.widget<CheckboxListTile>(checkboxes.at(i));

      expect(tile(0).value, true);
      expect(tile(1).value, false);
      expect(tile(2).value, false);
      expect(tile(3).value, false);

      await tester.tap(find.text('Mood inference'));
      await tester.pumpAndSettle();

      expect(tile(0).value, true);
      expect(tile(1).value, true);
      expect(tile(2).value, false);
      expect(tile(3).value, false);

      await tester.tap(find.text('Assessment'));
      await tester.pumpAndSettle();

      expect(tile(0).value, true);
      expect(tile(1).value, true);
      expect(tile(2).value, true);
      expect(tile(3).value, false);

      await tester.tap(find.text('Mood inference'));
      await tester.pumpAndSettle();

      expect(tile(0).value, true);
      expect(tile(1).value, false);
      expect(tile(2).value, true);
      expect(tile(3).value, false);
    });

    testWidgets('Continue sends POST /users/me/consent with correct payload',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Mood inference'));
      await tester.tap(find.text('Assessment'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Accept & Continue'));
      await tester.pumpAndSettle();

      await tester.runAsync(() async {
        await tester.tap(find.text('Accept & Continue'));
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await tester.pumpAndSettle();

      expect(adapter.lastRequest, isNotNull);
      expect(adapter.lastRequest!.path, '/users/me/consent');
      expect(adapter.lastRequest!.method, 'POST');

      final body = adapter.lastRequest!.data as Map<String, dynamic>;
      expect(body['safety_monitoring'], true);
      expect(body['mood_inference'], true);
      expect(body['assessment'], true);
      expect(body['emergency_contact'], false);
    });

    testWidgets('on success navigates to /intake',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Accept & Continue'));
      await tester.pumpAndSettle();

      await tester.runAsync(() async {
        await tester.tap(find.text('Accept & Continue'));
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await tester.pumpAndSettle();

      expect(find.text('Intake Screen'), findsOneWidget);
    });

    testWidgets('on failure shows error message and preserves state',
        (WidgetTester tester) async {
      adapter.setStatus(400);

      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Mood inference'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Accept & Continue'));
      await tester.pumpAndSettle();

      await tester.runAsync(() async {
        await tester.tap(find.text('Accept & Continue'));
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await tester.pumpAndSettle();

      expect(
        find.text('Something went wrong. Please try again.'),
        findsOneWidget,
      );
      expect(find.textContaining('Intake Screen'), findsNothing);

      final checkboxes = find.byType(CheckboxListTile);
      final moodTile = tester.widget<CheckboxListTile>(checkboxes.at(1));
      expect(moodTile.value, true);
    });

    testWidgets('Continue button shows loading state during submission',
        (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp(dio));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Accept & Continue'));
      await tester.pumpAndSettle();

      final continueButton = find.text('Accept & Continue');
      await tester.tap(continueButton);
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );

      // Let the pending Dio request complete to avoid timer leaks.
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pumpAndSettle();
    });
  });
}
