import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/providers.dart';
import 'widgets/home_insight_card.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    const String insightMessage = "I'm here when you're ready to talk.";

    return Scaffold(
      appBar: AppBar(title: const Text('Evia')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            const _MoodCheckInSlot(),
            const SizedBox(height: 16),
            const HomeInsightCard(message: insightMessage),
            const SizedBox(height: 24),
            Text(
              'What would you like to do?',
              style: theme.textTheme.titleMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: () => context.go('/chat'),
              icon: const Icon(Icons.chat_bubble_outline),
              label: const Text('Check In'),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => context.go('/progress'),
                    icon: const Icon(Icons.trending_up),
                    label: const Text('Progress'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => context.go('/settings'),
                    icon: const Icon(Icons.settings_outlined),
                    label: const Text('Settings'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            TextButton(
              onPressed: () => ref.read(crisisOverlayProvider.notifier).show(),
              child: Text(
                'Crisis Support',
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MoodCheckInSlot extends StatelessWidget {
  const _MoodCheckInSlot();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(Icons.mood, size: 32, color: theme.colorScheme.primary),
          const SizedBox(height: 8),
          Text(
            'How are you feeling today?',
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            'Daily check-in coming soon',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
