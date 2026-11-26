import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../widgets/okuvu_app_bar_title.dart';
import 'models/weekly_mood_summary.dart';
import 'providers/weekly_summary_provider.dart';

/// The last seven days, in the client's own words.
///
/// The owner asked for this in words and nothing else: no chart, no average, no
/// band, no "your mood this week was…". The sentences come from the api (which
/// composes them from the days the client actually saved), and the list below
/// repeats the word they picked each day. A day with no word is not shown with
/// a placeholder — the screen repeats what they wrote or says nothing about it.
class WeeklyMoodSummaryScreen extends ConsumerWidget {
  const WeeklyMoodSummaryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(weeklyMoodSummaryProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/progress'),
        ),
        title: const OkuvuAppBarTitle('Your week'),
      ),
      body: summary.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => _WeeklySummaryErrorState(
          onRetry: () => ref.invalidate(weeklyMoodSummaryProvider),
        ),
        data: (week) => _WeeklySummaryBody(week: week),
      ),
    );
  }
}

class _WeeklySummaryBody extends StatelessWidget {
  const _WeeklySummaryBody({required this.week});

  final WeeklyMoodSummary week;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var index = 0; index < week.sentences.length; index += 1) ...[
            Text(
              week.sentences[index],
              key: Key('weekly_summary_sentence_$index'),
              style: theme.textTheme.bodyLarge?.copyWith(height: 1.6),
            ),
            const SizedBox(height: 12),
          ],
          if (week.days.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Divider(),
            const SizedBox(height: 12),
            for (final day in week.days) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${day.dayLabel} · ${day.moodLabel}',
                      style: theme.textTheme.bodyMedium,
                    ),
                    if (day.feelingWords.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        day.feelingWords.join(', '),
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _WeeklySummaryErrorState extends StatelessWidget {
  const _WeeklySummaryErrorState({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              LucideIcons.cloudOff,
              size: 64,
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(height: 20),
            Text(
              'Could not load your week',
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text(
              'Please check your connection and try again.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
