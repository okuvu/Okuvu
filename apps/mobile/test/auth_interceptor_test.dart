import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/auth_interceptor.dart';
import 'package:okuvu/src/core/auth_service.dart';

import 'support/fake_auth_service.dart';

/// Simulates an HTTP backend without a real network.
class MockHttpClientAdapter implements HttpClientAdapter {
  RequestOptions? lastRequest;
  int _statusCode = 200;
  Map<String, List<String>>? _headers;

  void setStatus(int code) => _statusCode = code;
  void setHeaders(Map<String, List<String>> h) => _headers = h;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;
    return ResponseBody.fromString('{}', _statusCode, headers: _headers);
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  AppConfig.init('dev');

  group('AuthInterceptor — validation harness', () {
    /* ───────── 1. Authorization header  ───────── */

    testWidgets('Authorization header: absent for unauthenticated client', (tester) async {
      final fakeAuth = FakeAuthService();
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
      dio.interceptors.add(AuthInterceptor(fakeAuth, dio.options));
      final adapter = MockHttpClientAdapter();
      dio.httpClientAdapter = adapter;

      await tester.runAsync(() => dio.get('/test'));

      expect(adapter.lastRequest?.headers['Authorization'], isNull);
    });

    testWidgets('Authorization header: present when user is signed in', (tester) async {
      final fakeAuth = FakeAuthService(
        currentUser: const AuthUser(uid: 'sub-123', phoneNumber: '+919876543210'),
        tokenToReturn: 'fake-id-token',
      );

      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
      dio.interceptors.add(AuthInterceptor(fakeAuth, dio.options));
      final adapter = MockHttpClientAdapter();
      dio.httpClientAdapter = adapter;

      await tester.runAsync(() => dio.get('/test'));

      expect(adapter.lastRequest?.headers['Authorization'],
          'Bearer fake-id-token');
    });

    /* ───────── 2. 401 handling  ───────── */

    testWidgets('401: calls signOut and forwards the error', (tester) async {
      final fakeAuth = FakeAuthService();
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
      dio.interceptors.add(AuthInterceptor(fakeAuth, dio.options));
      final adapter = MockHttpClientAdapter()..setStatus(401);
      dio.httpClientAdapter = adapter;

      DioException? captured;
      await tester.runAsync(() async {
        try {
          await dio.get('/protected');
        } on DioException catch (e) {
          captured = e;
        }
      });

      expect(captured, isNotNull);
      expect(captured!.response?.statusCode, 401);
      expect(fakeAuth.signOutCalled, isTrue,
          reason: 'The interceptor should call AuthService.signOut() on 401');
    });

    /* ───────── 3. 503 Retry-After  ───────── */

    testWidgets('503: retries 3 times then forwards the error', (tester) async {
      final fakeAuth = FakeAuthService();
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
      dio.interceptors.add(AuthInterceptor(fakeAuth, dio.options));
      final adapter = MockHttpClientAdapter()..setStatus(503);
      dio.httpClientAdapter = adapter;

      final stopwatch = Stopwatch()..start();
      DioException? captured;
      await tester.runAsync(() async {
        try {
          await dio.get('/overloaded');
        } on DioException catch (e) {
          captured = e;
        }
      });
      stopwatch.stop();

      expect(captured, isNotNull);
      expect(captured!.response?.statusCode, 503);
      // 3 retries × 2s default delay = ~6s.
      // Inner Dio().fetch() fails quickly (no mock adapter on the
      // fresh instance), so elapsed is close to 6s.
      expect(stopwatch.elapsedMilliseconds, greaterThanOrEqualTo(5000));
    });
  });
}
