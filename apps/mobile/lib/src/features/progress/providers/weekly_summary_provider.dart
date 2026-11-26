import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../models/weekly_mood_summary.dart';

/// The last seven days, written back in words.
///
/// One request, no parameters: the window is fixed at seven days so the
/// sentences can name it. The api decides what the week means; this provider
/// only carries the answer.
final weeklyMoodSummaryProvider =
    FutureProvider.autoDispose<WeeklyMoodSummary>((ref) async {
  final dio = ref.read(dioClientProvider);

  final response = await dio.get('/progress/mood/week');
  final data = response.data;

  if (data is! Map) {
    throw const FormatException('weekly mood summary: unexpected response');
  }

  return WeeklyMoodSummary.fromJson(Map<String, dynamic>.from(data));
});
