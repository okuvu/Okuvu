import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'models/mood_data_point.dart';
import 'providers/progress_provider.dart';

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
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/home'),
          ),
          title: const Text('Your Progress'),
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

            return Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Mood over the last 14 days',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Days without a check-in are shown as gaps.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 28),
                  Expanded(
                    child: _MoodChart(days: days),
                  ),
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
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 28,
              interval: 1,
              getTitlesWidget: (value, meta) {
                if (value < 1 || value > 5 || value != value.roundToDouble()) {
                  return const SizedBox.shrink();
                }

                return Text(
                  value.toInt().toString(),
                  style: Theme.of(context).textTheme.bodySmall,
                );
              },
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 36,
              interval: 1,
              getTitlesWidget: (value, meta) {
                final index = value.toInt();

                if (index < 0 || index >= days.length || index % 2 != 0) {
                  return const SizedBox.shrink();
                }

                final date = days[index].date;
                return Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    '${date.day}/${date.month}',
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
          dotData: const FlDotData(show: true),
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

class _EmptyProgressState extends StatelessWidget {
  const _EmptyProgressState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.insights_outlined,
              size: 64,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 20),
            Text(
              'No mood check-ins yet',
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Your mood trend will appear here after you start checking in.',
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
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
              Icons.cloud_off_outlined,
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
