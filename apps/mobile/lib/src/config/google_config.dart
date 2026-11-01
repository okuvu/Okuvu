import 'package:flutter/foundation.dart';

/// Google sign-in configuration for the mobile client.
///
/// `serverClientId` is the **web** OAuth client id from Google Cloud Console →
/// APIs & Services → Credentials. It is a web client because only a web client
/// can issue ID tokens, and `google_sign_in` returns an `idToken` only when it
/// is given a server client id. The Android OAuth client (package name
/// `ai.okuvu.app` plus the SHA-1 of the signing certificate) must also exist —
/// Play Services checks the app's signature against it — but it never appears in
/// a token claim.
///
/// Supplied at build time so no id is baked into source:
///
/// ```bash
/// flutter build apk --flavor prod \
///   --dart-define=GOOGLE_SERVER_CLIENT_ID=<web client id>.apps.googleusercontent.com
/// ```
///
/// Deliberately no default and no fallback: a missing id renders a clear
/// "sign-in is not configured" message instead of a button that cannot work.
@immutable
class GoogleConfig {
  const GoogleConfig._();

  static const String serverClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
    defaultValue: '',
  );

  static bool get isConfigured => serverClientId.isNotEmpty;
}
