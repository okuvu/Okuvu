import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'models/mood_data_point.dart';
import 'providers/progress_provider.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';

const _carePhaseLabels = [
  'Getting to know each other',
  'Building tools',
  'Practising',
  'Settling in',
  'Maintaining',
];

class ProgressScreen extends ConsumerWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final moodProgress = ref.watch(moodProgressProvider);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/home');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () => context.go('/home'),
          ),
          title: const OkuvuAppBarTitle('Your Progress'),
        ),
        body: moodProgress.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => _ProgressErrorState(
            onRetry: () => ref.invalidate(moodProgressProvider),
          ),
          data: (entries) {
            final days = _buildLast14Days(entries);

            if (days.every((day) => day.mood == null)) {
              return const _EmptyProgressState();
            }

            return SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _CarePhaseCard(),
                  const SizedBox(height: 24),
                  Text(
                    'Mood over the last 14 days',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Days without a check-in are shown as gaps.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 300,
                    child: _MoodChart(days: days),
                  ),
                  const SizedBox(height: 8),
                  const _ChartCaption(),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

List<MoodDataPoint> _buildLast14Days(List<MoodDataPoint> entries) {
  final today = DateUtils.dateOnly(DateTime.now());

  return List.generate(14, (index) {
    final date = today.subtract(Duration(days: 13 - index));

    MoodDataPoint? matchingEntry;
    for (final entry in entries) {
      if (DateUtils.isSameDay(entry.date, date)) {
        matchingEntry = entry;
        break;
      }
    }

    return MoodDataPoint(
      date: date,
      mood: matchingEntry?.mood,
    );
  });
}

class _CarePhaseCard extends StatelessWidget {
  const _CarePhaseCard();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Your care journey',
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(5, (index) {
              const isActive = false;
              final phase = _carePhaseLabels[index];
              return _PhaseDot(
                index: index,
                total: 5,
                label: phase,
                isActive: isActive,
              );
            }),
          ),
          const SizedBox(height: 12),
          Text(
            'Current stage information will be available here once your care plan progresses.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _PhaseDot extends StatelessWidget {
  const _PhaseDot({
    required this.index,
    required this.total,
    required this.label,
    required this.isActive,
  });

  final int index;
  final int total;
  final String label;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Tooltip(
      message: label,
      child: Container(
        width: 40,
        height: 4,
        decoration: BoxDecoration(
          color: isActive
              ? theme.colorScheme.primary
              : theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.25),
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

class _MoodChart extends StatelessWidget {
  const _MoodChart({required this.days});

  final List<MoodDataPoint> days;

  @override
  Widget build(BuildContext context) {
    final segments = _buildSegments(days);

    return LineChart(
      LineChartData(
        minX: 0,
        maxX: 13,
        minY: 1,
        maxY: 5,
        gridData: const FlGridData(show: true),
        borderData: FlBorderData(show: false),
        lineBarsData: segments,
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          rightTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          leftTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 36,
              interval: 1,
              getTitlesWidget: (value, meta) {
                final index = value.toInt();

                if (index < 0 || index >= days.length) {
                  return const SizedBox.shrink();
                }

                final date = days[index].date;
                const weekdayNames = [
                  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
                ];
                return Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    weekdayNames[date.weekday - 1],
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  List<LineChartBarData> _buildSegments(List<MoodDataPoint> days) {
    final segments = <LineChartBarData>[];
    var currentSpots = <FlSpot>[];

    void addCurrentSegment() {
      if (currentSpots.isEmpty) return;

      segments.add(
        LineChartBarData(
          spots: List.of(currentSpots),
          isCurved: false,
          barWidth: 3,
          color: AppColors.violet,
          dotData: FlDotData(
            show: true,
            getDotPainter: (spot, percent, barData, index) {
              return FlDotCirclePainter(
                radius: 4,
                color: AppColors.violet,
                strokeWidth: 0,
              );
            },
          ),
        ),
      );

      currentSpots = [];
    }

    for (var index = 0; index < days.length; index++) {
      final mood = days[index].mood;

      if (mood == null) {
        addCurrentSegment();
        continue;
      }

      currentSpots.add(FlSpot(index.toDouble(), mood.toDouble()));
    }
    addCurrentSegment();
    return segments;
  }
}

class _ChartCaption extends StatelessWidget {
  const _ChartCaption();

  @override
  Widget build(BuildContext context) {
    return const Text(
      'Each dot is a mood you logged.',
      style: TextStyle(
        fontSize: 13,
        fontStyle: FontStyle.italic,
        color: AppColors.inkSoft,
      ),
    );
  }
}

class _EmptyProgressState extends StatelessWidget {
  const _EmptyProgressState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              LucideIcons.lineChart,
              size: 64,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(height: 20),
            Text(
              'Start checking in to see your progress here.',
              style: theme.textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Your care journey',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: List.generate(5, (index) {
                      return Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.onSurfaceVariant
                              .withValues(alpha: 0.25),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Start your journey to see your care phase.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProgressErrorState extends StatelessWidget {
  const _ProgressErrorState({required this.onRetry});

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
              'Could not load your mood trend',
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
