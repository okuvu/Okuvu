import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import '../../../core/websocket_service.dart';

class HomeBottomNav extends ConsumerWidget {
  const HomeBottomNav({super.key});

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
      selectedIndex: 0,
      onDestinationSelected: (index) {
        switch (index) {
          case 0:
            return;
          case 1:
            context.go('/chat');
          case 2:
            context.go('/progress');
          case 3:
            context.go('/settings');
        }
      },
      destinations: [
        const NavigationDestination(
          icon: Icon(Icons.home_filled),
          label: 'Home',
        ),
        NavigationDestination(
          icon: Badge(
            isLabelVisible: hasIncompleteSession,
            smallSize: 8,
            backgroundColor: const Color(0xFF1A6B5A),
            child: const Icon(Icons.chat_bubble_outline),
          ),
          selectedIcon: Badge(
            isLabelVisible: hasIncompleteSession,
            smallSize: 8,
            backgroundColor: const Color(0xFF1A6B5A),
            child: const Icon(Icons.chat_bubble),
          ),
          label: 'Chat',
        ),
        const NavigationDestination(
          icon: Icon(Icons.bar_chart_outlined),
          selectedIcon: Icon(Icons.bar_chart),
          label: 'Progress',
        ),
        const NavigationDestination(
          icon: Icon(Icons.settings_outlined),
          selectedIcon: Icon(Icons.settings),
          label: 'Settings',
        ),
      ],
    );
  }
}
