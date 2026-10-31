import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/core/auth_service.dart';
import 'package:okuvu/src/core/token_store.dart';

/// Google sign-in, as far as the app is concerned: a Google ID token goes to
/// `POST /auth/google`, an Okuvu session token comes back and is what every
/// later request carries. The Google plugin itself is injected out, so these
/// tests never touch a platform channel.

const _idToken = 'google-id-token';
const _subject = 'google-sub-abc';

String _fakeSessionToken({String sub = _subject, int ttlSeconds = 3600}) {
  String seg(Map<String, dynamic> value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  final payload = {
    'sub': sub,
    'iss': 'okuvu-api',
    'aud': 'okuvu-mobile',
    'exp': DateTime.now().add(Duration(seconds: ttlSeconds)).millisecondsSinceEpoch ~/ 1000,
  };
  return '${seg({'alg': 'HS256'})}.${seg(payload)}.signature';
}

class FakeAdapter implements HttpClientAdapter {
  RequestOptions? lastRequest;
  int statusCode = 200;
  dynamic body = '{}';

  FakeAdapter({
    this.statusCode = 200,
    this.body = '{}',
  });

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;
    final payload = body is String ? body as String : jsonEncode(body);
    return ResponseBody.fromString(
      payload,
      statusCode,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> _successBody({
  String? token,
  int ttlSeconds = 3600,
  bool hasAccount = true,
  String email = 'client@example.com',
}) =>
    {
      'token': token ?? _fakeSessionToken(ttlSeconds: ttlSeconds),
      'expires_at':
          DateTime.now().add(Duration(seconds: ttlSeconds)).millisecondsSinceEpoch ~/ 1000,
      'has_account': hasAccount,
      'user_id': hasAccount ? 'user-1' : null,
      'phone_number': hasAccount ? '+919****3210' : null,
      'email': email,
      'linked': false,
    };

void main() {
  late Dio dio;
  late FakeAdapter adapter;
  late MemoryTokenStore store;

  AuthService build({
    Future<String?> Function()? idToken,
    Future<void> Function()? googleSignOut,
  }) =>
      AuthService(
        store: store,
        api: dio,
        googleIdToken: idToken ?? () async => _idToken,
        googleSignOut: googleSignOut ?? () async {},
      );

  setUp(() {
    adapter = FakeAdapter();
    dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
    dio.httpClientAdapter = adapter;
    store = MemoryTokenStore();
  });

  group('signInWithGoogle', () {
    test('posts the Google ID token and stores the returned session', () async {
      adapter.body = _successBody();
      final service = build();

      final result = await service.signInWithGoogle();

      expect(adapter.lastRequest?.path, contains('/auth/google'));
      expect(adapter.lastRequest?.data, containsPair('id_token', _idToken));
      expect(result.hasAccount, isTrue);
      expect(result.user.uid, _subject);
      expect(result.user.email, 'client@example.com');
      expect(result.user.phoneNumber, '+919****3210');

      // Persisted, so the session survives a restart.
      expect(store.session?.token, isNotEmpty);
      expect(store.session?.subject, _subject);
      expect(await service.getIdToken(), store.session?.token);
    });

    test('reports has_account:false for someone with no OKUVU account', () async {
      adapter.body = _successBody(hasAccount: false, email: 'stranger@example.com');
      final service = build();

      final result = await service.signInWithGoogle();

      expect(result.hasAccount, isFalse);
      expect(result.email, 'stranger@example.com');
      // The session still exists — redeeming an invite requires being signed in.
      expect(await service.getIdToken(), isNotNull);
    });

    test('throws when Google returns no ID token', () async {
      final service = build(idToken: () async => null);

      await expectLater(
        service.signInWithGoogle(),
        throwsA(isA<AuthException>().having((e) => e.code, 'code', 'NoIdToken')),
      );
      expect(adapter.lastRequest, isNull);
    });

    test('surfaces EMAIL_IN_USE with an actionable message', () async {
      adapter.statusCode = 409;
      adapter.body =
          '{"error": {"code": "EMAIL_IN_USE", "message": "already connected"}}';
      final service = build();

      await expectLater(
        service.signInWithGoogle(),
        throwsA(
          isA<AuthException>()
              .having((e) => e.code, 'code', 'EMAIL_IN_USE')
              .having((e) => e.message, 'message', contains('contact support')),
        ),
      );
    });

    test('surfaces a rejected Google token as a generic retry message', () async {
      adapter.statusCode = 401;
      adapter.body = '{"error": {"code": "INVALID_GOOGLE_TOKEN"}}';
      final service = build();

      await expectLater(
        service.signInWithGoogle(),
        throwsA(
          isA<AuthException>().having(
            (e) => e.code,
            'code',
            'INVALID_GOOGLE_TOKEN',
          ),
        ),
      );
    });

    test('surfaces ACCOUNT_DELETED', () async {
      adapter.statusCode = 403;
      adapter.body = '{"error": {"code": "ACCOUNT_DELETED"}}';

      await expectLater(
        build().signInWithGoogle(),
        throwsA(isA<AuthException>().having((e) => e.code, 'code', 'ACCOUNT_DELETED')),
      );
    });

    test('rejects a malformed success response instead of storing garbage', () async {
      adapter.body = '{"has_account": true}';

      await expectLater(
        build().signInWithGoogle(),
        throwsA(isA<AuthException>().having((e) => e.code, 'code', 'InvalidResponse')),
      );
      expect(store.session, isNull);
    });
  });

  group('session lifecycle', () {
    test('restores a persisted session on startup', () async {
      store.session = StoredSession(
        token: _fakeSessionToken(),
        expiresAt: DateTime.now().add(const Duration(days: 30)),
        subject: _subject,
        email: 'client@example.com',
      );
      final service = build();

      final user = await service.authStateChanges().first;

      expect(user?.uid, _subject);
      expect(service.isSignedIn, isTrue);
    });

    test('treats an expired stored session as signed out', () async {
      store.session = StoredSession(
        token: _fakeSessionToken(),
        expiresAt: DateTime.now().subtract(const Duration(minutes: 5)),
        subject: _subject,
      );
      final service = build();

      expect(await service.getIdToken(), isNull);
      expect(service.isSignedIn, isFalse);
      expect(store.session, isNull);
    });

    test('signOut clears the session and drops the Google account', () async {
      var googleSignedOut = false;
      adapter.body = _successBody();
      final service = build(googleSignOut: () async => googleSignedOut = true);
      await service.signInWithGoogle();

      await service.signOut();

      expect(googleSignedOut, isTrue);
      expect(service.isSignedIn, isFalse);
      expect(store.session, isNull);
    });

    test('signOut still clears locally when the Google call fails', () async {
      adapter.body = _successBody();
      final service = build(
        googleSignOut: () async => throw Exception('plugin unavailable'),
      );
      await service.signInWithGoogle();

      await service.signOut();

      expect(service.isSignedIn, isFalse);
      expect(store.session, isNull);
    });
  });
}
