import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import '../../../core/websocket_service.dart';
import '../../../theme/app_colors.dart';

/// App wireframes H1/H2/C1/J1/A1 — bottom nav is Home | Chat | Journal on
/// every one of those screens, not just Home. Progress and Settings moved
/// to icon buttons in Home's AppBar (see home_screen.dart) instead of
/// occupying nav slots, per the wireframe having no Progress/Settings tab
/// anywhere in its bottom nav mockups.
///
/// [currentIndex] is passed explicitly by each screen rather than derived
/// from the route — this widget is now instantiated on three separate
/// screens (Home, Chat, Journal), each of which already knows which tab it
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
            context.go('/journal');
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
          icon: Icon(LucideIcons.book),
          label: 'Journal',
        ),
      ],
    );
  }
}
