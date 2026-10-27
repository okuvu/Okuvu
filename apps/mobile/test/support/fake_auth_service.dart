import 'dart:async';

import 'package:okuvu/src/core/auth_service.dart';

/// In-memory [AuthService] for widget tests.
///
/// Replaces the per-file Firebase mocks: nothing here touches the network, the
/// Cognito client or `shared_preferences`, so widget tests run with no plugin
/// channels and no real user pool.
class FakeAuthService implements AuthService {
  FakeAuthService({this.currentUser, this.tokenToReturn});

  @override
  AuthUser? currentUser;

  /// Token returned by [getIdToken]. Null means "signed out / no token".
  String? tokenToReturn;

  /// When set, [verifyPhone] reports it through `onError` instead of sending a
  /// code.
  AuthException? verifyPhoneError;

  /// When set, [verifyOtp] throws it.
  AuthException? verifyOtpError;

  String verificationIdToReturn = 'test-verification-id';
  int? forceResendingTokenToReturn;

  int verifyPhoneCallCount = 0;
  String? lastPhoneNumber;
  int? lastForceResendingToken;
  String? lastVerificationId;
  String? lastSmsCode;
  bool signOutCalled = false;

  final StreamController<AuthUser?> _controller =
      StreamController<AuthUser?>.broadcast();

  /// Emits whatever the fake currently holds — mirrors the real service's
  /// "restored session first, then changes" behaviour.
  @override
  Stream<AuthUser?> authStateChanges() async* {
    yield currentUser;
    yield* _controller.stream;
  }

  @override
  bool get isSignedIn => currentUser != null;

  @override
  Future<String?> getIdToken() async => tokenToReturn;

  @override
  Future<void> verifyPhone({
    required String phoneNumber,
    required void Function(String verificationId, int? forceResendingToken)
        onCodeSent,
    required void Function(AuthException) onError,
    int? forceResendingToken,
  }) async {
    verifyPhoneCallCount++;
    lastPhoneNumber = phoneNumber;
    lastForceResendingToken = forceResendingToken;

    final error = verifyPhoneError;
    if (error != null) {
      onError(error);
      return;
    }
    onCodeSent(verificationIdToReturn, forceResendingTokenToReturn);
  }

  @override
  Future<void> verifyOtp({
    required String verificationId,
    required String smsCode,
  }) async {
    lastVerificationId = verificationId;
    lastSmsCode = smsCode;

    final error = verifyOtpError;
    if (error != null) throw error;

    currentUser = AuthUser(uid: 'fake-uid', phoneNumber: lastPhoneNumber);
    _controller.add(currentUser);
  }

  @override
  Future<void> signOut() async {
    signOutCalled = true;
    currentUser = null;
    _controller.add(null);
  }

  @override
  Future<void> dispose() async {
    await _controller.close();
  }
}
