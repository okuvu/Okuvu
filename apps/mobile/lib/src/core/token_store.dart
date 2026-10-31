import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// The locally persisted half of a signed-in session.
///
/// HARDENING NOTE: `shared_preferences` is plain-text app storage. Moving this
/// to `flutter_secure_storage` (Keystore/Keychain-backed) is the hardening step
/// and the only thing standing between a rooted device and the session token.
/// See `apps/mobile/README.md`.
class StoredSession {
  const StoredSession({
    required this.token,
    required this.expiresAt,
    required this.subject,
    this.email,
    this.phoneNumber,
  });

  /// Okuvu's own session token (from `POST /auth/google`), sent as the bearer.
  final String token;

  /// When [token] stops being accepted — 30 days from sign-in, server-decided.
  final DateTime expiresAt;

  /// The Google subject, which is what the API stores as `User.auth_subject`.
  final String subject;

  final String? email;
  final String? phoneNumber;

  bool get isExpired => DateTime.now().isAfter(
        expiresAt.subtract(const Duration(seconds: 60)),
      );

  Map<String, dynamic> toJson() => {
        'token': token,
        'expires_at': expiresAt.millisecondsSinceEpoch,
        'subject': subject,
        'email': email,
        'phone': phoneNumber,
      };

  static StoredSession? fromJson(Map<String, dynamic> json) {
    final token = json['token'];
    final expiresAt = json['expires_at'];
    final subject = json['subject'];
    if (token is! String || expiresAt is! int || subject is! String) return null;
    if (token.isEmpty || subject.isEmpty) return null;

    final email = json['email'];
    final phone = json['phone'];
    return StoredSession(
      token: token,
      expiresAt: DateTime.fromMillisecondsSinceEpoch(expiresAt),
      subject: subject,
      email: email is String ? email : null,
      phoneNumber: phone is String ? phone : null,
    );
  }
}

/// Persistence seam so `AuthService` can be tested without the plugin channel.
abstract class TokenStore {
  Future<StoredSession?> read();

  Future<void> write(StoredSession session);

  Future<void> clear();
}

class PrefsTokenStore implements TokenStore {
  /// v2: the stored shape changed with Google sign-in (a session token instead
  /// of a Cognito refresh token plus a hidden per-device password). A v1 entry
  /// is ignored rather than migrated — it holds nothing the new app can use, and
  /// rewriting it would leave a dead credential on disk.
  static const String _key = 'okuvu.session.v2';

  SharedPreferences? _prefs;

  Future<SharedPreferences> _instance() async =>
      _prefs ??= await SharedPreferences.getInstance();

  @override
  Future<StoredSession?> read() async {
    try {
      final prefs = await _instance();
      final raw = prefs.getString(_key);
      if (raw == null || raw.isEmpty) return null;
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      return StoredSession.fromJson(Map<String, dynamic>.from(decoded));
    } catch (_) {
      // Corrupt entry, or no plugin channel (unit tests) — treat as signed out.
      return null;
    }
  }

  @override
  Future<void> write(StoredSession session) async {
    try {
      final prefs = await _instance();
      await prefs.setString(_key, jsonEncode(session.toJson()));
    } catch (_) {
      // Persistence is best-effort: the in-memory session still works.
    }
  }

  @override
  Future<void> clear() async {
    try {
      final prefs = await _instance();
      await prefs.remove(_key);
    } catch (_) {
      // Nothing to clear.
    }
  }
}

/// In-memory store for tests and for platforms without plugin support.
class MemoryTokenStore implements TokenStore {
  MemoryTokenStore([this.session]);

  StoredSession? session;

  @override
  Future<StoredSession?> read() async => session;

  @override
  Future<void> write(StoredSession value) async => session = value;

  @override
  Future<void> clear() async => session = null;
}
