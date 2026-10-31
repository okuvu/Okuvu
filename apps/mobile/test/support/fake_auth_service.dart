import 'dart:async';

import 'package:okuvu/src/core/auth_service.dart';

/// In-memory [AuthService] for widget tests.
///
/// Nothing here touches the network, the Google plugin or `shared_preferences`,
/// so widget tests run with no platform channels and no real identity provider.
class FakeAuthService implements AuthService {
  FakeAuthService({this.currentUser, this.tokenToReturn});

  @override
  AuthUser? currentUser;

  /// Token returned by [getIdToken]. Null means "signed out / no token".
  String? tokenToReturn;

  /// When set, [signInWithGoogle] throws it instead of signing in.
  AuthException? signInError;

  /// What the fake reports back for `has_account`.
  bool hasAccountResult = true;

  /// The email Google "returned" — used to prefill the waitlist.
  String emailResult = 'client@example.com';

  int signInCallCount = 0;
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
  Future<GoogleSignInResult> signInWithGoogle() async {
    signInCallCount++;

    final error = signInError;
    if (error != null) throw error;

    currentUser = AuthUser(uid: 'fake-google-sub', email: emailResult);
    _controller.add(currentUser);

    return GoogleSignInResult(
      user: currentUser!,
      hasAccount: hasAccountResult,
      email: emailResult,
    );
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
