import 'package:firebase_auth/firebase_auth.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;

  User? get currentUser => _auth.currentUser;

  Future<String?> getIdToken() async {
    return _auth.currentUser?.getIdToken();
  }

  Future<void> verifyPhone({
    required String phoneNumber,
    required void Function(String verificationId) onCodeSent,
    required void Function(FirebaseAuthException) onError,
  }) async {
    await _auth.verifyPhoneNumber(
      phoneNumber: phoneNumber,
      verificationCompleted: (credential) async {
        await _auth.signInWithCredential(credential);
      },
      verificationFailed: (e) => onError(e),
      codeSent: (verificationId, forceResendingToken) {
        onCodeSent(verificationId);
      },
      codeAutoRetrievalTimeout: (verificationId) {},
    );
  }

  Future<void> verifyOtp({
    required String verificationId,
    required String smsCode,
  }) async {
    final credential = PhoneAuthProvider.credential(
      verificationId: verificationId,
      smsCode: smsCode,
    );
    await _auth.signInWithCredential(credential);
  }

  Future<void> signOut() async {
    await _auth.signOut();
  }
}
