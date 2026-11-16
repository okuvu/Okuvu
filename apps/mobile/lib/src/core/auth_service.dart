import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../config/google_config.dart';
import 'dio_client.dart';
import 'logger.dart';
import 'token_store.dart';

/// The signed-in user. `uid` is the Google subject — the value the API stores
/// as `User.auth_subject`.
@immutable
class AuthUser {
  const AuthUser({required this.uid, this.email, this.phoneNumber});

  final String uid;
  final String? email;
  final String? phoneNumber;

  @override
  bool operator ==(Object other) =>
      other is AuthUser &&
      other.uid == uid &&
      other.email == email &&
      other.phoneNumber == phoneNumber;

  @override
  int get hashCode => Object.hash(uid, email, phoneNumber);

  @override
  String toString() => 'AuthUser($uid)';
}

/// Auth failure with a human-readable [message] ready to show in the UI.
class AuthException implements Exception {
  const AuthException(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => 'AuthException($code): $message';
}

/// What `signInWithGoogle` resolved to.
///
/// [hasAccount] is false when Google verified the person but no Okuvu `User`
/// exists for them yet — the app sends them to the waitlist (or redeems an
/// invite code first). Sign-in itself still succeeded, and a session token
/// exists either way, because redeeming an invite requires being authenticated.
@immutable
class GoogleSignInResult {
  const GoogleSignInResult({
    required this.user,
    required this.hasAccount,
    this.email,
  });

  final AuthUser user;
  final bool hasAccount;
  final String? email;
}

/// Supplies a Google ID token. Injected so tests never touch the plugin.
typedef GoogleIdTokenProvider = Future<String?> Function();

/// Google authentication, exchanged for an Okuvu session token.
///
/// Flow: `google_sign_in` performs the consent dialog on device and returns a
/// Google ID token → this class posts it to `POST /auth/google` → the API
/// verifies the token's signature/issuer/audience, links the Google subject to
/// the invited `User` row, and returns Okuvu's own 30-day session token, which
/// is what every subsequent request carries.
///
/// Why not Cognito and not phone OTP: SMS-only sign-in needed TRAI DLT
/// registration before a single client could log in, and clients are already
/// Google users. The API still accepts Cognito tokens (see
/// `apps/api/src/middleware/auth.ts`), so this is additive on the server side.
class AuthService {
  AuthService({
    TokenStore? store,
    Dio? api,
    GoogleIdTokenProvider? googleIdToken,
    Future<void> Function()? googleSignOut,
  })  : _store = store ?? PrefsTokenStore(),
        _api = api ?? createDioClient(),
        _googleIdToken = googleIdToken ?? _deviceGoogleIdToken,
        _googleSignOut = googleSignOut ?? _deviceGoogleSignOut;

  final TokenStore _store;

  /// A bare Dio (no `AuthInterceptor`): signing in is precisely the call that
  /// has no bearer token yet, and wiring the interceptor in would make
  /// `AuthService` depend on itself.
  final Dio _api;

  final GoogleIdTokenProvider _googleIdToken;
  final Future<void> Function() _googleSignOut;

  final StreamController<AuthUser?> _controller =
      StreamController<AuthUser?>.broadcast();

  AuthUser? _currentUser;
  Future<AuthUser?>? _restore;

  /// The Google ID token from the most recent sign-in.
  ///
  /// Held in memory only, and only long enough to create an account: a stranger
  /// signs in (identity proved, nothing created), lands on the 18+/consent
  /// screen, and `signUp` presents this same token so the API can create the
  /// row without a second Google consent dialog. It is never written to disk —
  /// a token that can mint an account does not belong in preferences.
  String? _pendingIdToken;

  /// `GoogleSignIn.initialize` may only be called once per process.
  static bool _googleInitialised = false;

  AuthUser? get currentUser => _currentUser;

  bool get isSignedIn => _currentUser != null;

  /// Emits the persisted session first (restored from device storage), then
  /// every sign-in and sign-out. Each listener gets its own `async*` stream, so
  /// a subscriber that attaches late still receives the restored state.
  Stream<AuthUser?> authStateChanges() async* {
    yield await _ensureRestored();
    yield* _controller.stream;
  }

  /// The bearer token for API calls. Refreshes nothing: a session token lasts
  /// 30 days, and an expired one means signing in again, so the caller sees
  /// `null` and the router sends the user back to `/auth`.
  Future<String?> getIdToken() async {
    final stored = await _safeRead();
    if (stored == null) {
      _currentUser = null;
      return null;
    }

    if (stored.isExpired) {
      Logger.debug('[AuthService] stored session expired — signing out');
      await _signOutLocally();
      return null;
    }

    _currentUser ??= _userFrom(stored);
    return stored.token;
  }

  /// Runs the Google consent dialog and exchanges the result for a session.
  ///
  /// Throws [AuthException] for everything a user could act on — cancelled,
  /// not configured, no account, email already bound, network — so the login
  /// screen only has to render `e.message`.
  Future<GoogleSignInResult> signInWithGoogle() async {
    final idToken = await _googleIdToken();
    if (idToken == null || idToken.isEmpty) {
      throw const AuthException(
        'NoIdToken',
        'Google did not return a sign-in token. Please try again.',
      );
    }

    // Kept for `signUp`, which needs the same proof of identity to create an
    // account for someone who has none yet.
    _pendingIdToken = idToken;

    Response<dynamic> response;
    try {
      response = await _api.post<dynamic>(
        '/auth/google',
        data: {'id_token': idToken},
      );
    } on DioException catch (e) {
      throw _fromDio(e);
    }

    final data = response.data;
    if (data is! Map) {
      throw const AuthException(
        'InvalidResponse',
        'Something went wrong. Please try again.',
      );
    }
    final body = Map<String, dynamic>.from(data);

    final token = body['token'];
    final expiresAt = body['expires_at'];
    if (token is! String || token.isEmpty || expiresAt is! num) {
      throw const AuthException(
        'InvalidResponse',
        'Something went wrong. Please try again.',
      );
    }

    final email = body['email'] is String ? body['email'] as String : null;
    final phone = body['phone_number'] is String ? body['phone_number'] as String : null;
    final stored = StoredSession(
      token: token,
      expiresAt: DateTime.fromMillisecondsSinceEpoch(expiresAt.toInt() * 1000),
      subject: _subjectOf(token) ?? email ?? '',
      email: email,
      phoneNumber: phone,
    );

    if (stored.subject.isEmpty) {
      throw const AuthException(
        'InvalidResponse',
        'Something went wrong. Please try again.',
      );
    }

    await _persist(stored);

    return GoogleSignInResult(
      user: _userFrom(stored),
      hasAccount: body['has_account'] == true,
      email: email,
    );
  }

  /// Creates this person's Okuvu account — self-serve onboarding.
  ///
  /// Signing in proves *who* someone is and deliberately creates nothing. This
  /// is the one call that creates the `User` row, and it cannot run without the
  /// client's own 18+ answer and safety-monitoring consent in the same request.
  ///
  /// The account starts unassigned: no therapist, no care plan. The operator
  /// console lists them and assigns a therapist; until then the client sees the
  /// whole app and the agent's turns are non-directional.
  ///
  /// Throws [AuthException] with `UNDER_18` when the client said they are under
  /// 18 — nothing is created, and the caller shows the closing screen.
  Future<void> signUp({
    required bool adult,
    required bool shareSummaries,
  }) async {
    final idToken = _pendingIdToken;
    if (idToken == null || idToken.isEmpty) {
      throw const AuthException(
        'NoIdToken',
        'Please sign in with Google again to finish setting up your account.',
      );
    }

    Response<dynamic> response;
    try {
      response = await _api.post<dynamic>(
        '/auth/signup',
        data: {
          'id_token': idToken,
          'adult': adult,
          'consents': {
            // Mandatory and not negotiable — the server refuses without it.
            'safety_monitoring': true,
            // One toggle on the onboarding card covers both derived-from-chat
            // signals, matching the settings screen's single chip.
            'mood_inference': shareSummaries,
            'assessment': shareSummaries,
            // Never asked at signup; the emergency-contact screen owns it.
            'emergency_contact': false,
          },
        },
      );
    } on DioException catch (e) {
      throw _fromDio(e);
    }

    final data = response.data;
    if (data is! Map) {
      throw const AuthException(
        'InvalidResponse',
        'Something went wrong. Please try again.',
      );
    }
    final body = Map<String, dynamic>.from(data);
    if (body['has_account'] != true) {
      throw const AuthException(
        'InvalidResponse',
        'Something went wrong. Please try again.',
      );
    }

    // The response carries a session of its own (the API mints one), so a build
    // that reaches this screen after losing its stored session still ends up
    // signed in without a second Google prompt.
    final token = body['token'];
    final expiresAt = body['expires_at'];
    if (token is String && token.isNotEmpty && expiresAt is num) {
      final email = body['email'] is String ? body['email'] as String : null;
      final subject = _subjectOf(token) ?? email ?? '';
      if (subject.isNotEmpty) {
        await _persist(StoredSession(
          token: token,
          expiresAt:
              DateTime.fromMillisecondsSinceEpoch(expiresAt.toInt() * 1000),
          subject: subject,
          email: email,
        ));
      }
    }

    // One-shot: the token is not needed again either way.
    _pendingIdToken = null;
  }

  /// Clears the session locally and drops the Google account from this app.
  ///
  /// There is no server-side revocation in this revision: the token expires on
  /// its own (30 days) and rotating `OKUVU_SESSION_SECRET` invalidates all
  /// sessions at once. Deliberately no failure surface — a user tapping "Sign
  /// out" must end up signed out even if the Google call fails.
  Future<void> signOut() async {
    try {
      await _googleSignOut();
    } catch (e) {
      Logger.debug('[AuthService] Google sign-out failed (ignored): $e');
    }
    await _signOutLocally();
  }

  Future<void> dispose() async {
    await _controller.close();
  }

  // ── internals ────────────────────────────────────────────────────────────

  static Future<String?> _deviceGoogleIdToken() async {
    if (!GoogleConfig.isConfigured) {
      throw const AuthException(
        'SignInNotConfigured',
        'Sign-in is not configured on this build.',
      );
    }

    final google = GoogleSignIn.instance;
    try {
      if (!_googleInitialised) {
        await google.initialize(serverClientId: GoogleConfig.serverClientId);
        _googleInitialised = true;
      }
      final account = await google.authenticate();
      return account.authentication.idToken;
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) {
        throw const AuthException('Cancelled', 'Sign-in cancelled.');
      }
      Logger.debug('[AuthService] Google sign-in failed: ${e.code} ${e.description}');
      throw AuthException(
        'GoogleSignInFailed',
        GoogleConfig.diag
            ? 'Google sign-in failed [${e.code.name}] ${e.description ?? 'no detail'}'
            : "Google sign-in didn't complete. Please try again.",
      );
    }
  }

  static Future<void> _deviceGoogleSignOut() async {
    if (!_googleInitialised) return;
    await GoogleSignIn.instance.signOut();
  }

  static AuthException _fromDio(DioException error) {
    final code = _errorCode(error.response?.data);
    switch (code) {
      case 'INVALID_GOOGLE_TOKEN':
        return const AuthException(
          'INVALID_GOOGLE_TOKEN',
          'Google sign-in could not be verified. Please try again.',
        );
      case 'EMAIL_IN_USE':
        return const AuthException(
          'EMAIL_IN_USE',
          'This email is already connected to a different sign-in method. Please contact support.',
        );
      case 'ACCOUNT_DELETED':
        return const AuthException(
          'ACCOUNT_DELETED',
          'This account has been closed.',
        );
      case 'UNDER_18':
        return const AuthException(
          'UNDER_18',
          'OKUVU is for adults aged 18 and over.',
        );
      case 'CONSENT_REQUIRED':
        return const AuthException(
          'CONSENT_REQUIRED',
          'Safety monitoring consent is required to use OKUVU.',
        );
      case 'SIGN_IN_NOT_CONFIGURED':
        return const AuthException(
          'SIGN_IN_NOT_CONFIGURED',
          'Sign-in is not configured on this build.',
        );
    }

    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return const AuthException(
        'NetworkError',
        "Couldn't reach the server. Check your connection and try again.",
      );
    }

    return AuthException(
      code ?? 'Unknown',
      'Something went wrong. Please try again.',
    );
  }

  static String? _errorCode(dynamic responseData) {
    var data = responseData;
    if (data is String && data.isNotEmpty) {
      try {
        data = jsonDecode(data);
      } catch (_) {
        return null;
      }
    }
    if (data is Map) {
      final error = data['error'];
      if (error is Map) {
        final code = error['code'];
        if (code is String) return code;
      }
    }
    return null;
  }

  Future<AuthUser?> _ensureRestored() => _restore ??= _restoreFromStore();

  Future<AuthUser?> _restoreFromStore() async {
    final stored = await _safeRead();
    if (stored == null) return null;
    if (stored.isExpired) {
      await _signOutLocally();
      return null;
    }
    final user = _userFrom(stored);
    _currentUser = user;
    return user;
  }

  Future<void> _persist(StoredSession stored) async {
    await _store.write(stored);
    final user = _userFrom(stored);
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

  AuthUser _userFrom(StoredSession stored) => AuthUser(
        uid: stored.subject,
        email: stored.email,
        phoneNumber: stored.phoneNumber,
      );

  /// The `sub` claim of the session token — the Google subject the API has
  /// already verified. Read without verification because it is only used as a
  /// local identifier; authorisation happens server-side on every request.
  static String? _subjectOf(String token) {
    final parts = token.split('.');
    if (parts.length < 2) return null;
    try {
      final decoded =
          utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
      final json = jsonDecode(decoded);
      if (json is Map && json['sub'] is String) return json['sub'] as String;
      return null;
    } catch (_) {
      return null;
    }
  }
}
