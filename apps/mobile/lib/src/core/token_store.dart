import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'cognito_client.dart';

/// The locally persisted half of a signed-in session.
///
/// HARDENING NOTE: `shared_preferences` is plain-text app storage. Moving this
/// to `flutter_secure_storage` (Keystore/Keychain-backed) is the hardening step
/// and the only thing standing between a rooted device and the refresh token.
/// See `apps/mobile/README.md`.
class StoredSession {
  const StoredSession({
    required this.phoneNumber,
    required this.password,
    required this.session,
  });

  final String phoneNumber;

  /// Per-device password (32 random bytes, base64url). Never shown to the user.
  final String password;

  final CognitoSession session;

  Map<String, dynamic> toJson() => {
        'phone': phoneNumber,
        'password': password,
        'access_token': session.accessToken,
        'id_token': session.idToken,
        'refresh_token': session.refreshToken,
        'expires_at': session.expiresAt.millisecondsSinceEpoch,
      };

  static StoredSession? fromJson(Map<String, dynamic> json) {
    final phone = json['phone'];
    final password = json['password'];
    final access = json['access_token'];
    final id = json['id_token'];
    final expiresAt = json['expires_at'];
    if (phone is! String ||
        password is! String ||
        access is! String ||
        id is! String ||
        expiresAt is! int) {
      return null;
    }
    final refresh = json['refresh_token'];
    return StoredSession(
      phoneNumber: phone,
      password: password,
      session: CognitoSession(
        accessToken: access,
        idToken: id,
        refreshToken: refresh is String ? refresh : null,
        expiresAt: DateTime.fromMillisecondsSinceEpoch(expiresAt),
      ),
    );
  }
}

/// Persistence seam so `AuthService` can be tested without the plugin channel.
abstract class TokenStore {
  Future<StoredSession?> read();

  Future<void> write(StoredSession session);

  Future<void> clear();

  /// The device password for [phoneNumber], if this device has signed in
  /// before. Used to avoid generating a new password on every attempt.
  Future<String?> readPassword(String phoneNumber);
}

class PrefsTokenStore implements TokenStore {
  static const String _key = 'okuvu.cognito.session';

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

  @override
  Future<String?> readPassword(String phoneNumber) async {
    final stored = await read();
    if (stored == null || stored.phoneNumber != phoneNumber) return null;
    return stored.password;
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

  @override
  Future<String?> readPassword(String phoneNumber) async {
    final stored = session;
    if (stored == null || stored.phoneNumber != phoneNumber) return null;
    return stored.password;
  }
}
