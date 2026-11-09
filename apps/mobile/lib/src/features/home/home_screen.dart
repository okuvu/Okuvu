import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/providers.dart';
import 'providers/today_card_provider.dart';
import 'widgets/home_bottom_nav.dart';
import 'widgets/next_session_card.dart';
import 'widgets/today_card.dart';
import 'widgets/pending_chat_access_banner.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../settings/profile_provider.dart';
import '../notifications/notifications_provider.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  String _greeting({String? fullName, String? displayAbbreviation}) {
    final hour = DateTime.now().hour;
    final base = hour < 12
        ? 'Good morning'
        : hour < 17
            ? 'Good afternoon'
            : 'Good evening';
    // Owner round 7 (3 Nov 2026) — the profile name wins, because that is the
    // name Settings > Profile shows and the one a user edits. The short name
    // from the welcome screen only covers accounts with no profile name yet.
    final name = greetingFirstName(fullName) ?? displayAbbreviation?.trim();
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
    final todayCard = ref.watch(todayCardProvider).asData?.value;
    // Owner round 7 (3 Nov 2026) — the greeting reads the same name the
    // Profile screen shows. A failed profile fetch (offline, server hiccup)
    // leaves it null and the today-card short name covers it.
    final profileName = ref.watch(profileInfoProvider).asData?.value.fullName;

    return Scaffold(
      appBar: AppBar(
        title: const OkuvuAppBarTitle('OKUVU'),
        // Wireframe's 3-tab nav (Home/Chat/Journal) has no Progress or
        // Settings slot — both move here instead of occupying a tab.
        actions: [
          Consumer(
            builder: (context, ref, _) {
              // The bell reads the unread count, not the list: Home should not
              // pull 30 rows to draw a number. Invalidated whenever the inbox
              // marks something read.
              final unread =
                  ref.watch(unreadNotificationCountProvider).asData?.value ?? 0;
              return IconButton(
                key: const ValueKey('notifications_bell'),
                icon: Badge.count(
                  count: unread,
                  isLabelVisible: unread > 0,
                  child: const Icon(LucideIcons.bell),
                ),
                tooltip: 'Notifications',
                onPressed: () => context.go('/notifications'),
              );
            },
          ),
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
            _greeting(
              fullName: profileName,
              displayAbbreviation: todayCard?.displayAbbreviation,
            ),
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
          const SizedBox(height: 16),
          // The one thing the Today card shows (Step 5). Everything else —
          // Breathe, Journal, Mood check-in, Library, Treasure Box — lives under
          // the Toolkit tab so this screen stays simple.
          const TodayCard(),
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
