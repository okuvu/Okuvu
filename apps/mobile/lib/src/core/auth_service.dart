import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../config/cognito_config.dart';
import 'cognito_client.dart';
import 'logger.dart';
import 'token_store.dart';

/// The signed-in user. `uid` is the Cognito `sub` claim — the value the API
/// stores as `User.auth_subject`.
@immutable
class AuthUser {
  const AuthUser({required this.uid, this.phoneNumber});

  final String uid;
  final String? phoneNumber;

  @override
  bool operator ==(Object other) =>
      other is AuthUser &&
      other.uid == uid &&
      other.phoneNumber == phoneNumber;

  @override
  int get hashCode => Object.hash(uid, phoneNumber);

  @override
  String toString() => 'AuthUser($uid, $phoneNumber)';
}

/// Auth failure with a human-readable [message] ready to show in the UI.
class AuthException implements Exception {
  const AuthException(this.code, this.message);

  /// Maps a Cognito error code to the message the login screen shows.
  factory AuthException.fromCognito(CognitoException error) {
    final message = switch (error.code) {
      'CodeMismatchException' => 'That code is incorrect.',
      'ExpiredCodeException' => 'That code has expired. Request a new one.',
      'LimitExceededException' ||
      'TooManyRequestsException' ||
      'TooManyFailedAttemptsException' =>
        'Too many attempts. Try again in a few minutes.',
      'NotAuthorizedException' => 'Sign-in failed. Request a new code.',
      'UsernameExistsException' =>
        'That number is already registered. Request a new code.',
      'UserNotFoundException' => 'No account found for that number.',
      'NetworkError' =>
        "Couldn't reach the server. Check your connection and try again.",
      _ => 'Something went wrong. Please try again.',
    };
    return AuthException(error.code, message);
  }

  final String code;
  final String message;

  @override
  String toString() => 'AuthException($code): $message';
}

enum _Flow { signup, reset, signedIn }

/// Phone-OTP authentication against Amazon Cognito.
///
/// Cognito user pool with `phone_number` as the username, SMS codes sent by
/// Cognito itself. New users: `SignUp` → `ConfirmSignUp` →
/// `InitiateAuth(USER_PASSWORD_AUTH)`. Returning users: `SignUp` answers
/// `UsernameExistsException`, which selects `ForgotPassword` →
/// `ConfirmForgotPassword` → `InitiateAuth` instead.
///
/// Public surface is unchanged from the previous implementation:
/// [currentUser], [getIdToken], [verifyPhone], [verifyOtp], [signOut],
/// [authStateChanges].
class AuthService {
  AuthService({
    CognitoConfig? config,
    TokenStore? store,
    CognitoClient? client,
  })  : _config = config ?? CognitoConfig.fromEnvironment(),
        _store = store ?? PrefsTokenStore() {
    _client = client ??
        CognitoClient(region: _config.region, clientId: _config.clientId);
  }

  final CognitoConfig _config;
  final TokenStore _store;
  late final CognitoClient _client;

  final StreamController<AuthUser?> _controller =
      StreamController<AuthUser?>.broadcast();

  AuthUser? _currentUser;
  Future<AuthUser?>? _restore;

  AuthUser? get currentUser => _currentUser;

  bool get isSignedIn => _currentUser != null;

  /// Emits the persisted session first (restored from device storage), then
  /// every sign-in and sign-out. Each listener gets its own `async*` stream, so
  /// a subscriber that attaches late still receives the restored state.
  Stream<AuthUser?> authStateChanges() async* {
    yield await _ensureRestored();
    yield* _controller.stream;
  }

  /// The Cognito **ID** token (the API accepts `id` and `access` tokens and
  /// reads `sub` from either). Refreshes transparently when the stored token is
  /// expired; a failed refresh is a sign-out and returns `null`.
  Future<String?> getIdToken() async {
    final stored = await _safeRead();
    if (stored == null) {
      _currentUser = null;
      return null;
    }

    var session = stored.session;
    if (session.isExpired) {
      final refreshed = await _refresh(stored);
      if (refreshed == null) return null;
      session = refreshed.session;
    }

    _currentUser ??= _userFrom(session, stored.phoneNumber);
    return session.idToken;
  }

  /// Sends an SMS code via Cognito.
  ///
  /// [forceResendingToken] is accepted for signature compatibility with the
  /// previous implementation but unused: Cognito has no resend token, so a
  /// resend is another `SignUp`/`ForgotPassword` call, which re-sends the code
  /// for the same username.
  Future<void> verifyPhone({
    required String phoneNumber,
    required void Function(String verificationId, int? forceResendingToken)
        onCodeSent,
    required void Function(AuthException) onError,
    int? forceResendingToken,
  }) async {
    final phone = _normalizePhone(phoneNumber);

    if (!_config.isConfigured) {
      onError(const AuthException(
        'AuthNotConfigured',
        'Sign-in is not configured on this build.',
      ));
      return;
    }

    try {
      final password = await _store.readPassword(phone) ?? _newDevicePassword();

      var confirmed = false;
      try {
        confirmed = await _client.signUp(
          phoneNumber: phone,
          password: password,
        );
      } on CognitoException catch (e) {
        if (e.code != 'UsernameExistsException') rethrow;

        // Returning user. Ask Cognito to send a fresh SMS code; confirming it
        // resets the (never-shown) device password, which is what verifyOtp
        // then sets and signs in with.
        final resetPassword = _newDevicePassword();
        await _client.forgotPassword(phone);
        onCodeSent(
          _encodeVerificationId(_Flow.reset, phone, resetPassword),
          null,
        );
        return;
      }

      if (confirmed) {
        // Only reachable on a pool with no confirmation step: there is no SMS
        // to wait for, so sign in now and hand back a verification id that
        // resolves the live session.
        final session = await _client.passwordAuth(
          phoneNumber: phone,
          password: password,
        );
        await _persist(phone, password, session);
        onCodeSent(_encodeVerificationId(_Flow.signedIn, phone, password), null);
        return;
      }

      onCodeSent(_encodeVerificationId(_Flow.signup, phone, password), null);
    } on CognitoException catch (e) {
      onError(AuthException.fromCognito(e));
    } catch (e) {
      Logger.debug('[AuthService] verifyPhone failed unexpectedly: $e');
      onError(const AuthException(
        'Unknown',
        'Something went wrong. Please try again.',
      ));
    }
  }

  /// Confirms the SMS code and signs in. Throws [AuthException] on any failure.
  Future<void> verifyOtp({
    required String verificationId,
    required String smsCode,
  }) async {
    final attempt = _decodeVerificationId(verificationId);
    if (attempt == null) {
      throw const AuthException(
        'InvalidVerificationId',
        'Sign-in failed. Request a new code.',
      );
    }

    try {
      if (attempt.flow == _Flow.signedIn) {
        await _ensureRestored();
        if (_currentUser == null) {
          throw const AuthException(
            'NotAuthorizedException',
            'Sign-in failed. Request a new code.',
          );
        }
        return;
      }

      if (attempt.flow == _Flow.signup) {
        try {
          await _client.confirmSignUp(
            phoneNumber: attempt.phone,
            code: smsCode,
          );
        } on CognitoException catch (e) {
          // A pool without a confirmation step reports the user as already
          // confirmed; the password sign-in below is the real check.
          final alreadyConfirmed = e.code == 'NotAuthorizedException' &&
              e.message.toLowerCase().contains('already');
          if (!alreadyConfirmed) rethrow;
        }
      } else {
        await _client.confirmForgotPassword(
          phoneNumber: attempt.phone,
          code: smsCode,
          password: attempt.password,
        );
      }

      final session = await _client.passwordAuth(
        phoneNumber: attempt.phone,
        password: attempt.password,
      );
      await _persist(attempt.phone, attempt.password, session);
    } on CognitoException catch (e) {
      throw AuthException.fromCognito(e);
    }
  }

  /// Clears local tokens and best-effort revokes the refresh token at Cognito.
  Future<void> signOut() async {
    final stored = await _safeRead();
    final refreshToken = stored?.session.refreshToken;
    if (refreshToken != null && _config.isConfigured) {
      try {
        await _client.revoke(refreshToken);
      } catch (e) {
        Logger.debug('[AuthService] RevokeToken failed (ignored): $e');
      }
    }
    await _signOutLocally();
  }

  Future<void> dispose() async {
    await _controller.close();
  }

  // ── internals ────────────────────────────────────────────────────────────

  Future<AuthUser?> _ensureRestored() => _restore ??= _restoreFromStore();

  Future<AuthUser?> _restoreFromStore() async {
    final stored = await _safeRead();
    if (stored == null) return null;

    var session = stored.session;
    if (session.isExpired) {
      // A dead refresh token means the stored session is worthless — treat it
      // as signed out rather than looping on 401s.
      final refreshed = await _refresh(stored);
      if (refreshed == null) return null;
      session = refreshed.session;
    }

    final user = _userFrom(session, stored.phoneNumber);
    _currentUser = user;
    return user;
  }

  Future<StoredSession?> _refresh(StoredSession stored) async {
    final refreshToken = stored.session.refreshToken;
    if (refreshToken == null) {
      await _signOutLocally();
      return null;
    }
    try {
      final session = await _client.refresh(refreshToken);
      final next = StoredSession(
        phoneNumber: stored.phoneNumber,
        password: stored.password,
        session: stored.session.merge(session),
      );
      await _store.write(next);
      return next;
    } catch (e) {
      Logger.debug('[AuthService] token refresh failed — signing out: $e');
      await _signOutLocally();
      return null;
    }
  }

  Future<void> _persist(
    String phoneNumber,
    String password,
    CognitoSession session,
  ) async {
    await _store.write(
      StoredSession(
        phoneNumber: phoneNumber,
        password: password,
        session: session,
      ),
    );
    final user = _userFrom(session, phoneNumber);
    _currentUser = user;
    _restore = Future<AuthUser?>.value(user);
    if (!_controller.isClosed) _controller.add(user);
  }

  Future<void> _signOutLocally() async {
    await _store.clear();
    _currentUser = null;
    _restore = Future<AuthUser?>.value(null);
    if (!_controller.isClosed) _controller.add(null);
  }

  Future<StoredSession?> _safeRead() async {
    try {
      return await _store.read();
    } catch (e) {
      Logger.debug('[AuthService] could not read stored session: $e');
      return null;
    }
  }

  AuthUser _userFrom(CognitoSession session, String phoneNumber) {
    final claims = _decodeJwtPayload(session.idToken);
    final sub = claims?['sub'];
    final phone = claims?['phone_number'];
    return AuthUser(
      uid: sub is String && sub.isNotEmpty ? sub : phoneNumber,
      phoneNumber: phone is String && phone.isNotEmpty ? phone : phoneNumber,
    );
  }

  static Map<String, dynamic>? _decodeJwtPayload(String token) {
    final parts = token.split('.');
    if (parts.length < 2) return null;
    try {
      final decoded =
          utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
      final json = jsonDecode(decoded);
      return json is Map ? Map<String, dynamic>.from(json) : null;
    } catch (_) {
      return null;
    }
  }

  /// 32 random bytes, base64url, behind a short prefix that satisfies the
  /// strictest Cognito password policy (upper, lower, digit, symbol). Never
  /// shown to the user; stored on the device next to the refresh token.
  static String _newDevicePassword() {
    final random = Random.secure();
    final bytes = List<int>.generate(32, (_) => random.nextInt(256));
    return 'Aa1!${base64Url.encode(bytes)}';
  }

  static String _encodeVerificationId(
    _Flow flow,
    String phone,
    String password,
  ) {
    final payload = jsonEncode({
      'flow': flow.name,
      'phone': phone,
      'password': password,
    });
    return base64Url.encode(utf8.encode(payload));
  }

  static _Attempt? _decodeVerificationId(String verificationId) {
    try {
      final json = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(verificationId))),
      );
      if (json is! Map) return null;
      _Flow? flow;
      for (final candidate in _Flow.values) {
        if (candidate.name == json['flow']) flow = candidate;
      }
      final phone = json['phone'];
      final password = json['password'];
      if (flow == null || phone is! String || password is! String) return null;
      return _Attempt(flow: flow, phone: phone, password: password);
    } catch (_) {
      return null;
    }
  }

  static String _normalizePhone(String input) {
    final trimmed = input.replaceAll(RegExp(r'[\s\-()]'), '');
    if (trimmed.startsWith('+')) return trimmed;
    final digits = trimmed.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return trimmed;
    if (digits.length == 10) return '+91$digits';
    return '+$digits';
  }
}

class _Attempt {
  const _Attempt({
    required this.flow,
    required this.phone,
    required this.password,
  });

  final _Flow flow;
  final String phone;
  final String password;
}
