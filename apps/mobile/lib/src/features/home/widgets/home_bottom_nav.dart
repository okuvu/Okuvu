import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import '../../../core/websocket_service.dart';
import '../../../theme/app_colors.dart';

/// The bottom nav: Home | Chat | Toolkit.
///
/// Owner's Step 5 rule (9 Nov 2026) replaced the Journal slot with Toolkit:
/// Breathe, Journal, Mood check-in, Library and Treasure Box all live under
/// the Toolkit tab so the home screen stays simple, and Chat keeps its own
/// slot because it is the thing the app is for. Progress and Settings stay as
/// icon buttons in Home's AppBar.
///
/// [currentIndex] is passed explicitly by each screen rather than derived
/// from the route — this widget is instantiated on several screens (Home,
/// Chat, Toolkit, Journal), each of which already knows which tab it
/// represents; that's simpler and less fragile than introspecting
/// GoRouterState, and fixes the previous hardcoded-to-0 bug (this bar used
/// to only ever render on Home, so the bug was latent until Chat/Journal
/// started rendering it too).
class HomeBottomNav extends ConsumerWidget {
  const HomeBottomNav({super.key, required this.currentIndex});

  final int currentIndex;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wsState = ref.watch(wsConnectionStateProvider);
    final chatState = ref.watch(chatMessagesProvider);

    // No dedicated "incomplete session" provider exists yet.
    // wsConnectionStateProvider is the best available reactive
    // approximation: sessionActive matches the lifecycle of an
    // open chat session (set on session_open_confirmed, cleared
    // on session_closed).
    final hasIncompleteSession =
        wsState == WsConnectionState.sessionActive && !chatState.isSessionClosed;

    return NavigationBar(
      selectedIndex: currentIndex,
      onDestinationSelected: (index) {
        if (index == currentIndex) return;
        switch (index) {
          case 0:
            context.go('/home');
          case 1:
            context.go('/chat');
          case 2:
            context.go('/toolkit');
        }
      },
      destinations: [
        const NavigationDestination(
          icon: Icon(LucideIcons.home),
          label: 'Home',
        ),
        NavigationDestination(
          icon: Badge(
            isLabelVisible: hasIncompleteSession,
            smallSize: 8,
            backgroundColor: AppColors.violet,
            child: const Icon(LucideIcons.messageCircle),
          ),
          label: 'Chat',
        ),
        const NavigationDestination(
          icon: Icon(LucideIcons.layoutGrid),
          label: 'Toolkit',
        ),
      ],
    );
  }
}
