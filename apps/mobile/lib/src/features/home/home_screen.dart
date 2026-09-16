import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/providers.dart';
import 'breathing_screen.dart';
import 'providers/today_card_provider.dart';
import 'widgets/home_bottom_nav.dart';
import 'widgets/mood_check_in.dart';
import 'widgets/next_session_card.dart';
import 'widgets/quick_access_tile.dart';
import 'widgets/today_card.dart';
import 'widgets/pending_chat_access_banner.dart';
import '../../widgets/okuvu_app_bar_title.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  String _greeting(String? displayAbbreviation) {
    final hour = DateTime.now().hour;
    final base = hour < 12
        ? 'Good morning'
        : hour < 17
            ? 'Good afternoon'
            : 'Good evening';
    final name = displayAbbreviation?.trim();
    return name != null && name.isNotEmpty ? '$base, $name' : base;
  }

  String _formattedDate() {
    final now = DateTime.now();
    const weekdays = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return '${weekdays[now.weekday - 1]}, ${months[now.month - 1]} ${now.day}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final displayAbbreviation =
        ref.watch(todayCardProvider).asData?.value.displayAbbreviation;

    return Scaffold(
      appBar: AppBar(
        title: const OkuvuAppBarTitle('OKUVU'),
        // Wireframe's 3-tab nav (Home/Chat/Journal) has no Progress or
        // Settings slot — both move here instead of occupying a tab.
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.barChart2),
            tooltip: 'Progress',
            onPressed: () => context.go('/progress'),
          ),
          IconButton(
            icon: const Icon(LucideIcons.settings),
            tooltip: 'Settings',
            onPressed: () => context.go('/settings'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          Text(
            _greeting(displayAbbreviation),
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            _formattedDate(),
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 16),
          const NextSessionCard(),
          const PendingChatAccessBanner(),
          const MoodCheckIn(),
          const SizedBox(height: 16),
          const TodayCard(),
          const SizedBox(height: 16),
          Consumer(
            builder: (context, ref, _) {
              final entryCount =
                  ref.watch(journalListProvider).value?.length ?? 0;
              return Row(
                children: [
                  Expanded(
                    child: QuickAccessTile(
                      icon: '\u{1F32B}',
                      label: 'Breathe',
                      subtitle: '4 min',
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => const BreathingScreen(),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: QuickAccessTile(
                      icon: '\u{1F4D4}',
                      label: 'Journal',
                      subtitle: '$entryCount entries',
                      onTap: () => context.go('/journal'),
                    ),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 16),
          Center(
            child: TextButton(
              onPressed: () => ref.read(crisisOverlayProvider.notifier).show(),
              child: Text(
                'Crisis Support',
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
      bottomNavigationBar: const HomeBottomNav(currentIndex: 0),
    );
  }
}
