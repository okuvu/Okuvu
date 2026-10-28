import 'dart:convert';

import 'package:dio/dio.dart';

import 'logger.dart';

/// A Cognito operation failure, carrying the bare AWS error code
/// (`CodeMismatchException`, `LimitExceededException`, …) so callers can branch
/// on it before it becomes a user-facing message.
class CognitoException implements Exception {
  const CognitoException(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => 'CognitoException($code): $message';
}

/// Tokens returned by `InitiateAuth`.
class CognitoSession {
  const CognitoSession({
    required this.accessToken,
    required this.idToken,
    this.refreshToken,
    required this.expiresAt,
  });

  final String accessToken;
  final String idToken;
  final String? refreshToken;
  final DateTime expiresAt;

  bool get isExpired => DateTime.now().isAfter(
        expiresAt.subtract(const Duration(seconds: 60)),
      );

  CognitoSession merge(CognitoSession refresh) {
    return CognitoSession(
      accessToken: refresh.accessToken,
      idToken: refresh.idToken,
      // REFRESH_TOKEN_AUTH does not return a new refresh token.
      refreshToken: refresh.refreshToken ?? refreshToken,
      expiresAt: refresh.expiresAt,
    );
  }
}

/// Plain-HTTPS transport to a Cognito user pool.
///
/// Every call is `POST https://cognito-idp.<region>.amazonaws.com/` with
/// `X-Amz-Target: AWSCognitoIdentityProviderService.<Op>`,
/// `Content-Type: application/x-amz-json-1.1` and a JSON body. No Amplify, no
/// AWS SDK — just the existing `dio` dependency.
class CognitoClient {
  CognitoClient({
    required this.region,
    required this.clientId,
    Dio? dio,
  })  : _dio = dio ??
            Dio(
              BaseOptions(
                connectTimeout: const Duration(seconds: 10),
                receiveTimeout: const Duration(seconds: 10),
                sendTimeout: const Duration(seconds: 10),
                // Cognito answers 4xx with a JSON body; let the interceptor
                // below read it instead of dio throwing on validation.
                responseType: ResponseType.plain,
              ),
            );

  static const String _targetPrefix = 'AWSCognitoIdentityProviderService';

  final String region;
  final String clientId;
  final Dio _dio;

  String get endpoint => 'https://cognito-idp.$region.amazonaws.com/';

  /// Performs one Cognito operation. Returns the decoded JSON body (empty map
  /// for operations with no output). Throws [CognitoException] on failure.
  Future<Map<String, dynamic>> call(
    String operation,
    Map<String, dynamic> body,
  ) async {
    final payload = <String, dynamic>{'ClientId': clientId, ...body};

    Response<dynamic> response;
    try {
      response = await _dio.post<dynamic>(
        endpoint,
        data: jsonEncode(payload),
        options: Options(
          headers: {
            'X-Amz-Target': '$_targetPrefix.$operation',
            'Content-Type': 'application/x-amz-json-1.1',
          },
        ),
      );
    } on DioException catch (e) {
      final errorResponse = e.response;
      if (errorResponse != null) {
        // Cognito reports every failure as a 4xx with a JSON body carrying
        // `__type` and `message`.
        final errorBody = _decode(errorResponse.data);
        final rawType = errorBody['__type'];
        if (rawType is String) {
          throw CognitoException(_shortErrorType(rawType), _message(errorBody));
        }
        throw CognitoException(
          'Http${errorResponse.statusCode}',
          _message(errorBody),
        );
      }
      Logger.debug('[Cognito] $operation transport failure: ${e.type}');
      throw CognitoException(
        'NetworkError',
        e.message ?? 'Network request failed',
      );
    }

    final decoded = _decode(response.data);
    final rawType = decoded['__type'];
    if (rawType is String) {
      throw CognitoException(_shortErrorType(rawType), _message(decoded));
    }
    return decoded;
  }

  /// `SignUp`. Returns `true` when the pool auto-confirmed the user (no SMS was
  /// sent) — only possible on a pool configured without a confirmation step.
  Future<bool> signUp({
    required String phoneNumber,
    required String password,
  }) async {
    final body = await call('SignUp', {
      'Username': phoneNumber,
      'Password': password,
      'UserAttributes': [
        {'Name': 'phone_number', 'Value': phoneNumber},
      ],
    });
    return body['UserConfirmed'] == true;
  }

  Future<void> forgotPassword(String phoneNumber) async {
    await call('ForgotPassword', {'Username': phoneNumber});
  }

  Future<void> confirmSignUp({
    required String phoneNumber,
    required String code,
  }) async {
    await call('ConfirmSignUp', {
      'Username': phoneNumber,
      'ConfirmationCode': code,
    });
  }

  Future<void> confirmForgotPassword({
    required String phoneNumber,
    required String code,
    required String password,
  }) async {
    await call('ConfirmForgotPassword', {
      'Username': phoneNumber,
      'ConfirmationCode': code,
      'Password': password,
    });
  }

  Future<CognitoSession> passwordAuth({
    required String phoneNumber,
    required String password,
  }) async {
    final body = await call('InitiateAuth', {
      'AuthFlow': 'USER_PASSWORD_AUTH',
      'AuthParameters': {'USERNAME': phoneNumber, 'PASSWORD': password},
    });
    return _session(body);
  }

  Future<CognitoSession> refresh(String refreshToken) async {
    final body = await call('InitiateAuth', {
      'AuthFlow': 'REFRESH_TOKEN_AUTH',
      'AuthParameters': {'REFRESH_TOKEN': refreshToken},
    });
    return _session(body, fallbackRefreshToken: refreshToken);
  }

  /// Best-effort token revocation on sign-out.
  Future<void> revoke(String refreshToken) async {
    await call('RevokeToken', {'Token': refreshToken});
  }

  CognitoSession _session(
    Map<String, dynamic> body, {
    String? fallbackRefreshToken,
  }) {
    final result = body['AuthenticationResult'];
    if (result is! Map) {
      throw const CognitoException(
        'InvalidResponse',
        'Cognito returned no authentication result',
      );
    }
    final access = result['AccessToken'];
    final id = result['IdToken'];
    if (access is! String || id is! String) {
      throw const CognitoException(
        'InvalidResponse',
        'Cognito returned no tokens',
      );
    }
    final expiresIn = result['ExpiresIn'];
    final seconds = expiresIn is int ? expiresIn : 3600;
    final refreshToken = result['RefreshToken'];
    return CognitoSession(
      accessToken: access,
      idToken: id,
      refreshToken: refreshToken is String ? refreshToken : fallbackRefreshToken,
      expiresAt: DateTime.now().add(Duration(seconds: seconds)),
    );
  }

  Map<String, dynamic> _decode(dynamic data) {
    if (data is Map) return Map<String, dynamic>.from(data);
    if (data is String && data.trim().isNotEmpty) {
      try {
        final parsed = jsonDecode(data);
        if (parsed is Map) return Map<String, dynamic>.from(parsed);
      } catch (_) {
        Logger.debug('[Cognito] non-JSON response body');
      }
    }
    return const {};
  }

  static String _message(Map<String, dynamic> body) {
    final message = body['message'] ?? body['Message'];
    return message is String ? message : 'Cognito request failed';
  }

  /// `com.amazonaws.cognitoidentityprovider.model.CodeMismatchException`
  /// → `CodeMismatchException`.
  static String _shortErrorType(String raw) {
    final index = raw.lastIndexOf('#');
    final hashTrimmed = index >= 0 ? raw.substring(index + 1) : raw;
    final dot = hashTrimmed.lastIndexOf('.');
    return dot >= 0 ? hashTrimmed.substring(dot + 1) : hashTrimmed;
  }
}
