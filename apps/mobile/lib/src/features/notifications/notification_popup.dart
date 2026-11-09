import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/logger.dart';
import '../../core/providers.dart';
import 'notifications_provider.dart';

/// How often the app asks the server for the inbox while it is open.
///
/// Thirty seconds is a compromise: the inbox query is indexed on
/// `(user_id, created_at)` and returns a small page, and a client waiting on a
/// therapist's homework should not have to pull-to-refresh to find it. Anything
/// faster spends battery and radio on an event that happens a few times a week.
const Duration kNotificationPollInterval = Duration(seconds: 30);

/// Watches the inbox and surfaces the newest arrival as a pop-up.
///
/// Delivery is still a pull: nothing pushes to the device, so this is what
/// makes a therapist's action visible while the app is open, and what refreshes
/// the bell's count when the app comes back to the foreground. The banner and
/// the inbox both read `GET /users/me/notifications`, so they cannot disagree
/// about what arrived.
///
/// Two rules worth keeping:
///
/// 1. **The first read of a session is a baseline, not an event.** Rows that
///    were already waiting when the app opened belong to the bell and the inbox
///    — a banner that fires on every launch is noise, and the badge already
///    says how many are waiting.
/// 2. **A burst pops once.** A therapist who assigns homework and a reminder in
///    the same minute produces two rows; the banner shows the newest and the
///    rest stay on the bell instead of stacking up over the screen.
class NotificationPopupNotifier extends Notifier<ClientNotification?> {
  NotificationPopupNotifier({this.interval = kNotificationPollInterval});

  final Duration interval;

  Timer? _timer;
  final Set<String> _seen = <String>{};
  bool _primed = false;
  bool _inFlight = false;

  @override
  ClientNotification? build() {
    ref.onDispose(_cancelTimer);

    // Signing out must not leave a timer polling with a dead session, and the
    // next sign-in must not inherit the previous client's seen-ids.
    ref.listen<SessionState>(sessionProvider, (previous, next) {
      if (next == SessionState.authenticated) {
        start();
        return;
      }
      stop();
      _seen.clear();
      _primed = false;
      state = null;
    });

    if (ref.read(sessionProvider) == SessionState.authenticated) {
      // Not inline: `start` reads, and a read that resolved before build
      // returned would assign state mid-build.
      Future.microtask(start);
    }

    return null;
  }

  /// Begin polling. Called on sign-in, on app resume and by the widget that
  /// hosts the banner; safe to call repeatedly.
  void start({bool immediate = false}) {
    if (_timer != null) {
      // Already running. A resume still wants a fresh read now rather than
      // whenever the current interval happens to tick.
      if (immediate) unawaited(poll());
      return;
    }
    unawaited(poll());
    _timer = Timer.periodic(interval, (_) => unawaited(poll()));
  }

  /// Stop polling while the app is in the background.
  void stop() => _cancelTimer();

  void _cancelTimer() {
    _timer?.cancel();
    _timer = null;
  }

  /// One read of the inbox.
  ///
  /// Public so a test can drive it instead of waiting on a timer; the app only
  /// reaches it through [start].
  Future<void> poll() async {
    if (_inFlight) return;
    _inFlight = true;
    try {
      final dio = ref.read(dioClientProvider);
      final response = await dio.get(
        '/users/me/notifications',
        queryParameters: const {'limit': 20},
      );
      final page = NotificationsPage.fromJson(
        response.data as Map<String, dynamic>,
      );
      _ingest(page.notifications);
    } catch (error) {
      // A failed read is nothing the client can act on and the next tick
      // retries. Silence is deliberate: a toast every thirty seconds on a flaky
      // connection is worse than a notification arriving late.
      Logger.debug('[NOTIFY] inbox poll failed: $error');
    } finally {
      _inFlight = false;
    }
  }

  void _ingest(List<ClientNotification> items) {
    final fresh = items.where((item) => !_seen.contains(item.id)).toList();
    for (final item in items) {
      _seen.add(item.id);
    }

    if (!_primed) {
      _primed = true;
      return;
    }

    if (fresh.isEmpty) return;

    // The server returns newest first.
    state = fresh.first;

    // Home's badge reads the count separately; drop it so the bell agrees with
    // the banner the client just saw.
    ref.invalidate(unreadNotificationCountProvider);
  }

  /// Close the banner. Passing [id] makes it a no-op when a newer row has
  /// already replaced the one the caller was showing.
  void dismiss({String? id}) {
    if (id == null || state?.id == id) state = null;
  }
}

final notificationPopupProvider =
    NotifierProvider<NotificationPopupNotifier, ClientNotification?>(
      NotificationPopupNotifier.new,
    );
