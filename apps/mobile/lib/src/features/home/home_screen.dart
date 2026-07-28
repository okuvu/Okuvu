import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/providers.dart';
import 'breathing_screen.dart';
import 'widgets/affirmation_card.dart';
import 'widgets/home_insight_card.dart';
import 'widgets/home_bottom_nav.dart';
import 'widgets/mood_check_in.dart';
import 'widgets/progress_summary.dart';
import 'widgets/quick_access_tile.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
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

    const String insightMessage =
        'Your insights will appear here after your first check-in.';

    return Scaffold(
      appBar: AppBar(title: const Text('Evia')),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          Text(
            _greeting(),
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
          const MoodCheckIn(),
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
          const ProgressSummary(showData: false),
          const SizedBox(height: 16),
          const HomeInsightCard(message: insightMessage),
          const SizedBox(height: 16),
          const AffirmationCard(),
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
      bottomNavigationBar: const HomeBottomNav(),
    );
  }
}
