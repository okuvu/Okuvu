import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/config/cognito_config.dart';
import 'package:okuvu/src/core/auth_service.dart';
import 'package:okuvu/src/core/cognito_client.dart';
import 'package:okuvu/src/core/token_store.dart';

const _clientId = 'mobile-client-id';
const _phone = '+919876543210';

String _fakeIdToken({String sub = 'sub-abc', String phone = _phone}) {
  final header = base64Url.encode(utf8.encode(jsonEncode({'alg': 'RS256'})));
  final payload = base64Url.encode(
    utf8.encode(jsonEncode({'sub': sub, 'phone_number': phone})),
  );
  return '$header.$payload.signature';
}

Map<String, dynamic> _authResult({
  String idToken = '',
  String? refreshToken = 'refresh-1',
  int expiresIn = 3600,
}) {
  return {
    'AuthenticationResult': {
      'AccessToken': 'access-1',
      'IdToken': idToken.isEmpty ? _fakeIdToken() : idToken,
      'RefreshToken': refreshToken,
      'ExpiresIn': expiresIn,
      'TokenType': 'Bearer',
    },
  };
}

/// Records every Cognito call and answers per operation.
class FakeCognitoAdapter implements HttpClientAdapter {
  final List<String> operations = [];
  final List<Map<String, dynamic>> bodies = [];

  final Map<String, Map<String, dynamic>> _responses = {};
  final Map<String, ({int status, String type, String message})> _failures = {};

  void on(String operation, Map<String, dynamic> body) {
    _responses[operation] = body;
  }

  void fail(
    String operation,
    String type, {
    int status = 400,
    String message = 'failed',
  }) {
    _failures[operation] = (status: status, type: type, message: message);
  }

  int countOf(String operation) => operations.where((o) => o == operation).length;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final target = options.headers['X-Amz-Target'] as String;
    final operation = target.split('.').last;
    operations.add(operation);
    bodies.add(
      Map<String, dynamic>.from(jsonDecode(options.data as String) as Map),
    );

    final failure = _failures[operation];
    if (failure != null) {
      return ResponseBody.fromString(
        jsonEncode({
          '__type': 'com.amazonaws.cognitoidentityprovider.model.${failure.type}',
          'message': failure.message,
        }),
        failure.status,
        headers: {
          'content-type': ['application/x-amz-json-1.1'],
        },
      );
    }

    return ResponseBody.fromString(
      jsonEncode(_responses[operation] ?? {}),
      200,
      headers: {
        'content-type': ['application/x-amz-json-1.1'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> _verificationIdPayload(String verificationId) {
  return Map<String, dynamic>.from(
    jsonDecode(utf8.decode(base64Url.decode(verificationId))) as Map,
  );
}

void main() {
  late FakeCognitoAdapter adapter;
  late Dio dio;

  setUp(() {
    adapter = FakeCognitoAdapter();
    dio = Dio();
    dio.httpClientAdapter = adapter;
  });

  AuthService buildService(TokenStore store) {
    return AuthService(
      config: const CognitoConfig(region: 'ap-south-1', clientId: _clientId),
      store: store,
      client: CognitoClient(
        region: 'ap-south-1',
        clientId: _clientId,
        dio: dio,
      ),
    );
  }

  group('SignUp flow (new phone number)', () {
    test('sends SignUp with phone_number and an unseen device password', () async {
      final store = MemoryTokenStore();
      final service = buildService(store);
      adapter.on('SignUp', {'UserConfirmed': false});

      String? verificationId;
      AuthException? error;
      await service.verifyPhone(
        phoneNumber: '9876543210',
        onCodeSent: (id, token) => verificationId = id,
        onError: (e) => error = e,
      );

      expect(error, isNull);
      expect(adapter.operations, ['SignUp']);
      final body = adapter.bodies.single;
      expect(body['ClientId'], _clientId);
      expect(body['Username'], _phone);
      expect(body['UserAttributes'], [
        {'Name': 'phone_number', 'Value': _phone},
      ]);
      final password = body['Password'] as String;
      expect(password.length, greaterThan(32));
      // Meets the strictest pool policy out of the box.
      expect(password, contains('Aa1!'));

      final payload = _verificationIdPayload(verificationId!);
      expect(payload['flow'], 'signup');
      expect(payload['phone'], _phone);
      expect(payload['password'], password);
    });

    test('verifyOtp confirms the code then signs in with the password', () async {
      final store = MemoryTokenStore();
      final service = buildService(store);
      adapter.on('SignUp', {'UserConfirmed': false});
      adapter.on('ConfirmSignUp', {});
      adapter.on('InitiateAuth', _authResult());

      String? verificationId;
      await service.verifyPhone(
        phoneNumber: '9876543210',
        onCodeSent: (id, _) => verificationId = id,
        onError: (_) {},
      );

      await service.verifyOtp(verificationId: verificationId!, smsCode: '123456');

      expect(adapter.operations, ['SignUp', 'ConfirmSignUp', 'InitiateAuth']);

      final confirm = adapter.bodies[1];
      expect(confirm['Username'], _phone);
      expect(confirm['ConfirmationCode'], '123456');

      final initiate = adapter.bodies[2];
      expect(initiate['AuthFlow'], 'USER_PASSWORD_AUTH');
      final params = initiate['AuthParameters'] as Map;
      expect(params['USERNAME'], _phone);
      expect(params['PASSWORD'], _verificationIdPayload(verificationId!)['password']);

      expect(service.currentUser?.uid, 'sub-abc');
      expect(service.currentUser?.phoneNumber, _phone);
      expect(store.session?.session.idToken, _fakeIdToken());
      expect(store.session?.session.refreshToken, 'refresh-1');
      expect(store.session?.phoneNumber, _phone);
    });

    test('a SignUp failure is reported as an AuthException message', () async {
      final service = buildService(MemoryTokenStore());
      adapter.fail('SignUp', 'LimitExceededException');

      String? verificationId;
      AuthException? error;
      await service.verifyPhone(
        phoneNumber: '9876543210',
        onCodeSent: (id, _) => verificationId = id,
        onError: (e) => error = e,
      );

      expect(verificationId, isNull);
      expect(error?.code, 'LimitExceededException');
      expect(error?.message, 'Too many attempts. Try again in a few minutes.');
    });

    test('refuses to call Cognito when the build has no client id', () async {
      final service = AuthService(
        config: const CognitoConfig(region: 'ap-south-1', clientId: ''),
        store: MemoryTokenStore(),
        client: CognitoClient(
          region: 'ap-south-1',
          clientId: '',
          dio: dio,
        ),
      );

      AuthException? error;
      await service.verifyPhone(
        phoneNumber: '9876543210',
        onCodeSent: (_, __) {},
        onError: (e) => error = e,
      );

      expect(error?.code, 'AuthNotConfigured');
      expect(adapter.operations, isEmpty);
    });
  });

  group('ForgotPassword flow (returning phone number)', () {
    test('UsernameExistsException switches to ForgotPassword and marks the flow reset', () async {
      final service = buildService(MemoryTokenStore());
      adapter.fail('SignUp', 'UsernameExistsException');
      adapter.on('ForgotPassword', {});

      String? verificationId;
      AuthException? error;
      await service.verifyPhone(
        phoneNumber: '9876543210',
        onCodeSent: (id, _) => verificationId = id,
        onError: (e) => error = e,
      );

      expect(error, isNull);
      expect(adapter.operations, ['SignUp', 'ForgotPassword']);
      expect(adapter.bodies[1]['Username'], _phone);
      expect(adapter.bodies[1]['ClientId'], _clientId);

      final payload = _verificationIdPayload(verificationId!);
      expect(payload['flow'], 'reset');
      expect(payload['phone'], _phone);
    });

    test('verifyOtp confirms the reset with a new password, then signs in', () async {
      final store = MemoryTokenStore();
      final service = buildService(store);
      adapter.fail('SignUp', 'UsernameExistsException');
      adapter.on('ForgotPassword', {});
      adapter.on('ConfirmForgotPassword', {});
      adapter.on('InitiateAuth', _authResult(refreshToken: 'refresh-2', expiresIn: 60));

      String? verificationId;
      await service.verifyPhone(
        phoneNumber: '9876543210',
        onCodeSent: (id, _) => verificationId = id,
        onError: (_) {},
      );

      await service.verifyOtp(verificationId: verificationId!, smsCode: '999999');

      expect(
        adapter.operations,
        ['SignUp', 'ForgotPassword', 'ConfirmForgotPassword', 'InitiateAuth'],
      );
      final confirm = adapter.bodies[2];
      final expectedPassword =
          _verificationIdPayload(verificationId!)['password'] as String;
      expect(confirm['ConfirmationCode'], '999999');
      expect(confirm['Password'], expectedPassword);
      expect(confirm['Username'], _phone);
      expect(
        (adapter.bodies[3]['AuthParameters'] as Map)['PASSWORD'],
        expectedPassword,
      );
      expect(service.currentUser?.uid, 'sub-abc');
      expect(store.session?.session.refreshToken, 'refresh-2');
    });

    test('a wrong code surfaces as CodeMismatchException with a readable message', () async {
      final service = buildService(MemoryTokenStore());
      adapter.on('SignUp', {'UserConfirmed': false});
      adapter.fail('ConfirmSignUp', 'CodeMismatchException');

      String? verificationId;
      await service.verifyPhone(
        phoneNumber: '9876543210',
        onCodeSent: (id, _) => verificationId = id,
        onError: (_) {},
      );

      await expectLater(
        service.verifyOtp(verificationId: verificationId!, smsCode: '000000'),
        throwsA(
          isA<AuthException>()
              .having((e) => e.code, 'code', 'CodeMismatchException')
              .having((e) => e.message, 'message', 'That code is incorrect.'),
        ),
      );
    });

    test('an expired code maps to the "request a new one" message', () async {
      final service = buildService(MemoryTokenStore());
      adapter.on('SignUp', {'UserConfirmed': false});
      adapter.fail('ConfirmSignUp', 'ExpiredCodeException');

      String? verificationId;
      await service.verifyPhone(
        phoneNumber: '9876543210',
        onCodeSent: (id, _) => verificationId = id,
        onError: (_) {},
      );

      await expectLater(
        service.verifyOtp(verificationId: verificationId!, smsCode: '000000'),
        throwsA(
          isA<AuthException>().having(
            (e) => e.message,
            'message',
            'That code has expired. Request a new one.',
          ),
        ),
      );
    });
  });

  group('getIdToken', () {
    StoredSession expiredSession() => StoredSession(
          phoneNumber: _phone,
          password: 'device-password',
          session: CognitoSession(
            accessToken: 'old-access',
            idToken: _fakeIdToken(),
            refreshToken: 'refresh-old',
            expiresAt: DateTime.now().subtract(const Duration(minutes: 5)),
          ),
        );

    test('refreshes an expired token via REFRESH_TOKEN_AUTH', () async {
      final store = MemoryTokenStore(expiredSession());
      final service = buildService(store);
      adapter.on('InitiateAuth', _authResult(refreshToken: null));

      final token = await service.getIdToken();

      expect(token, _fakeIdToken());
      expect(adapter.operations, ['InitiateAuth']);
      expect(adapter.bodies.single['AuthFlow'], 'REFRESH_TOKEN_AUTH');
      expect(
        (adapter.bodies.single['AuthParameters'] as Map)['REFRESH_TOKEN'],
        'refresh-old',
      );
      // REFRESH_TOKEN_AUTH returns no new refresh token — the old one is kept.
      expect(store.session?.session.refreshToken, 'refresh-old');
      expect(service.currentUser?.uid, 'sub-abc');
    });

    test('a successful refresh is cached (no second network call)', () async {
      final store = MemoryTokenStore(expiredSession());
      final service = buildService(store);
      adapter.on('InitiateAuth', _authResult(refreshToken: null));

      await service.getIdToken();
      await service.getIdToken();

      expect(adapter.countOf('InitiateAuth'), 1);
    });

    test('a failed refresh signs the user out and returns null', () async {
      final store = MemoryTokenStore(expiredSession());
      final service = buildService(store);
      adapter.fail('InitiateAuth', 'NotAuthorizedException');

      final token = await service.getIdToken();

      expect(token, isNull);
      expect(store.session, isNull);
      expect(service.currentUser, isNull);
    });

    test('returns null when nothing is stored', () async {
      final service = buildService(MemoryTokenStore());
      expect(await service.getIdToken(), isNull);
      expect(adapter.operations, isEmpty);
    });
  });

  group('authStateChanges', () {
    test('emits the restored session at start-up without a network call', () async {
      final store = MemoryTokenStore(
        StoredSession(
          phoneNumber: _phone,
          password: 'device-password',
          session: CognitoSession(
            accessToken: 'access',
            idToken: _fakeIdToken(sub: 'restored-sub'),
            refreshToken: 'refresh',
            expiresAt: DateTime.now().add(const Duration(hours: 1)),
          ),
        ),
      );
      final service = buildService(store);

      final user = await service.authStateChanges().first;

      expect(user?.uid, 'restored-sub');
      expect(user?.phoneNumber, _phone);
      expect(service.currentUser?.uid, 'restored-sub');
      expect(adapter.operations, isEmpty);
    });

    test('emits null when there is no stored session', () async {
      final service = buildService(MemoryTokenStore());
      expect(await service.authStateChanges().first, isNull);
    });

    test('emits the user on sign-in and null on sign-out', () async {
      final store = MemoryTokenStore();
      final service = buildService(store);
      adapter.on('SignUp', {'UserConfirmed': false});
      adapter.on('ConfirmSignUp', {});
      adapter.on('InitiateAuth', _authResult());
      adapter.on('RevokeToken', {});

      final emitted = <AuthUser?>[];
      final subscription = service.authStateChanges().listen(emitted.add);
      await Future<void>.delayed(Duration.zero);

      String? verificationId;
      await service.verifyPhone(
        phoneNumber: '9876543210',
        onCodeSent: (id, _) => verificationId = id,
        onError: (_) {},
      );
      await service.verifyOtp(verificationId: verificationId!, smsCode: '123456');
      await Future<void>.delayed(Duration.zero);

      await service.signOut();
      await Future<void>.delayed(Duration.zero);
      await subscription.cancel();

      expect(emitted.map((u) => u?.uid), [null, 'sub-abc', null]);
      expect(store.session, isNull);
      expect(service.currentUser, isNull);
      expect(adapter.countOf('RevokeToken'), 1);
      expect(adapter.bodies.last['Token'], 'refresh-1');
    });
  });
}
