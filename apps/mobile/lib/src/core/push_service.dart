import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'logger.dart';

/// Push, from the app's side.
///
/// One class owns the whole handset half: initialise Firebase, ask for the
/// notification permission, hand the FCM token to the api, refresh it when it
/// rotates, forget it on sign-out, and turn a tap into a route.
///
/// Three rules this file exists to keep:
///
/// 1. **Push must never break the app.** Every Firebase call is guarded. A build
///    with no `google-services.json`, a device with no Play services, or an FCM
///    outage leaves the product exactly as it was before this feature — a
///    companion that answers when opened. Push is an addition, never a
///    prerequisite.
/// 2. **The ask happens once the client is signed in, never at cold start.** The
///    permission dialog makes sense next to "your therapist's homework and
///    reminders"; it is noise on a splash screen, and Android only allows one
///    automatic prompt, so spending it before there is a reason is wasteful.
/// 3. **Sign-out forgets the handset.** A shared phone must stop receiving the
///    previous account's alerts the moment someone else signs in.
///
/// The notification body never arrives here as clinical text: the api builds the
/// wording from the kind (`buildPushCopy`), so a lock screen shows "Something new
/// from your care team" and the detail is read inside the app.
class PushService {
  PushService({required Dio api}) : _api = api;

  final Dio _api;

  /// Deep-link targets from taps: `/notifications`, `/homework`, or an
  /// appointment's detail. Empty stream when Firebase is unavailable.
  final StreamController<String> _openTargets =
      StreamController<String>.broadcast();

  /// Foreground messages, as their kind. The app refreshes its inbox and shows
  /// its own banner — only the background path renders a system notification, so
  /// the UI never needs a Firebase type.
  final StreamController<String> _foreground =
      StreamController<String>.broadcast();

  Stream<String> get openTargets => _openTargets.stream;
  Stream<String> get foregroundMessages => _foreground.stream;

  bool _initialised = false;
  bool _unavailable = false;
  StreamSubscription<RemoteMessage>? _onMessage;
  StreamSubscription<RemoteMessage>? _onOpen;
  StreamSubscription<String>? _onRefresh;

  /// Firebase, once per process. Returns false when the platform cannot do push,
  /// and every other method becomes a no-op.
  Future<bool> _ensureInitialised() async {
    if (_initialised) return true;
    if (_unavailable) return false;
    try {
      await Firebase.initializeApp();
      _onMessage = FirebaseMessaging.onMessage.listen((message) {
        _foreground.add((message.data['kind'] as String?) ?? '');
      });
      _onOpen = FirebaseMessaging.onMessageOpenedApp.listen(_handleOpen);
      // A tap that launched the app from cold: the router is not up yet, so the
      // target is queued on the same stream the running app uses.
      unawaited(
        FirebaseMessaging.instance.getInitialMessage().then((message) {
          if (message != null) _handleOpen(message);
        }),
      );
      _initialised = true;
      return true;
    } catch (e) {
      // Missing google-services.json, no Play services, emulator without them.
      // Log once, then stay quiet: a product that logs every launch is worse
      // than one that quietly has no push.
      _unavailable = true;
      Logger.debug('[PUSH] unavailable on this build/device: $e');
      return false;
    }
  }

  /// Ask, then register. Called when the session becomes authenticated.
  ///
  /// Returns true when the api now holds this handset's token. A `false` is not an
  /// error — it is a client who declined, a device without Play services, or an
  /// api that could not be reached, and the product works in all three cases.
  Future<bool> signIn() async {
    if (!await _ensureInitialised()) return false;

    try {
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        // Sticky by design. The route back is phone settings, offered from the
        // inbox the first time something actually arrives — never a second
        // dialog, which Android has already stopped showing.
        Logger.debug('[PUSH] notification permission denied by the client');
        return false;
      }

      // The **FCM registration token**, not the Firebase Installation ID the
      // newer `register()`/`onRegistered` pair emits: the api sends to
      // `message.token` over FCM HTTP v1, and switching to FID targeting would
      // be a server change with no benefit. Deprecated in the plugin, supported
      // by the platform, and pinned here deliberately.
      // ignore: deprecated_member_use
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null || token.isEmpty) return false;

      // ignore: deprecated_member_use
      _onRefresh ??= FirebaseMessaging.instance.onTokenRefresh.listen((refreshed) {
        // A rotation is silent to the client; re-registering is idempotent on the
        // api (upsert on the token).
        unawaited(_postToken(refreshed));
      });

      await _postToken(token);
      return true;
    } catch (e) {
      Logger.debug('[PUSH] registration failed: $e');
      return false;
    }
  }

  Future<void> _postToken(String token) async {
    try {
      await _api.post<void>('/devices', data: {
        'token': token,
        'platform': 'android',
      });
      Logger.debug('[PUSH] device registered');
    } catch (e) {
      // Offline or a 5xx: the next app open tries again, and a missing token
      // costs a buzz, not the inbox row.
      Logger.debug('[PUSH] device registration failed: $e');
    }
  }

  /// Forget this handset. Called on sign-out, and deliberately silent on failure:
  /// a phone that keeps a stale token for a while is a smaller problem than a
  /// sign-out that throws.
  Future<void> signOut() async {
    if (!_initialised) return;
    try {
      // The **FCM registration token**, not the Firebase Installation ID the
      // newer `register()`/`onRegistered` pair emits: the api sends to
      // `message.token` over FCM HTTP v1, and switching to FID targeting would
      // be a server change with no benefit. Deprecated in the plugin, supported
      // by the platform, and pinned here deliberately.
      // ignore: deprecated_member_use
      // ignore: deprecated_member_use
      final token = await FirebaseMessaging.instance.getToken();
      await _onRefresh?.cancel();
      _onRefresh = null;
      if (token != null && token.isNotEmpty) {
        await _api.delete<void>('/devices', data: {'token': token});
      }
      // ignore: deprecated_member_use
      await FirebaseMessaging.instance.deleteToken();
    } catch (e) {
      Logger.debug('[PUSH] could not unregister the device: $e');
    }
  }

  void _handleOpen(RemoteMessage message) {
    final target = routeFor(message.data);
    if (target != null) _openTargets.add(target);
  }

  /// The tap target, from the ids the `Notification` row already carries.
  ///
  /// Appointment detail wins over the list because a session change is
  /// time-sensitive, and homework wins over the inbox for the same reason.
  static String? routeFor(Map<String, dynamic> data) {
    final appointmentId = data['appointmentId'];
    if (appointmentId is String && appointmentId.isNotEmpty) {
      return '/appointments/$appointmentId';
    }
    final kind = data['kind'];
    if (kind == 'homework_assigned' || kind == 'homework_due_today') {
      return '/homework';
    }
    if (kind is String && kind.isNotEmpty) return '/notifications';
    return null;
  }

  void dispose() {
    _onMessage?.cancel();
    _onOpen?.cancel();
    _onRefresh?.cancel();
    _openTargets.close();
    _foreground.close();
  }
}
