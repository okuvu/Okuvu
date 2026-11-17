import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../router/router.dart';
import 'notifications_provider.dart';

/// Wires [PushService] to the app's own lifecycle.
///
/// Sign-in asks for the notification permission and registers the handset;
/// sign-out forgets it. A tap on a notification routes to the row it refers to,
/// and a message that arrives while the app is open refreshes the inbox instead
/// of appearing as a second, duplicate system notification.
///
/// Nothing here decides whether the client sees a notification — the OS and the
/// api's own preference gate do. This is plumbing, and every call inside it is
/// failure-tolerant, so a phone with no Play services runs the product unchanged.
class PushLifecycle extends ConsumerStatefulWidget {
  const PushLifecycle({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<PushLifecycle> createState() => _PushLifecycleState();
}

class _PushLifecycleState extends ConsumerState<PushLifecycle> {
  StreamSubscription<String>? _openTargets;
  StreamSubscription<String>? _foreground;

  @override
  void initState() {
    super.initState();
    final push = ref.read(pushServiceProvider);

    _openTargets = push.openTargets.listen((target) {
      if (!mounted) return;
      ref.invalidate(notificationsProvider);
      ref.invalidate(unreadNotificationCountProvider);
      ref.read(routerProvider).go(target);
    });

    _foreground = push.foregroundMessages.listen((_) {
      if (!mounted) return;
      // The app is already open, so the detail is one tap away in the inbox —
      // a system notification on top of a visible app would be noise.
      ref.invalidate(notificationsProvider);
      ref.invalidate(unreadNotificationCountProvider);
    });
  }

  @override
  void dispose() {
    _openTargets?.cancel();
    _foreground?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<SessionState>(sessionProvider, (previous, next) {
      final push = ref.read(pushServiceProvider);
      if (next == SessionState.authenticated &&
          previous != SessionState.authenticated) {
        unawaited(push.signIn());
      } else if (previous == SessionState.authenticated &&
          next == SessionState.unauthenticated) {
        unawaited(push.signOut());
      }
    });

    return widget.child;
  }
}
