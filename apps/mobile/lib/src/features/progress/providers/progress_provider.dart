import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../models/mood_data_point.dart';

final moodProgressProvider =
    FutureProvider.autoDispose<List<MoodDataPoint>>((ref) async {
  final dio = ref.read(dioClientProvider);

  final response = await dio.get(
    '/progress/mood',
    queryParameters: {'days': 14},
  );

  final responseData = response.data;

  final List<dynamic> items = responseData is Map<String, dynamic>
      ? (responseData['entries'] as List<dynamic>? ?? [])
      : (responseData as List<dynamic>? ?? []);

  return items
      .map((item) => MoodDataPoint.fromJson(item as Map<String, dynamic>))
      .toList();
});

/// Posts today's mood to `POST /progress/mood/checkin` (upserted by IST
/// day, so re-tapping a different number just overwrites today's value).
/// On success, invalidates [moodProgressProvider] so the Progress screen's
/// 14-day chart picks up the new entry without a manual refresh.
class MoodCheckinNotifier extends Notifier<void> {
  @override
  void build() {}

  Future<bool> checkIn(int moodValue) async {
    final dio = ref.read(dioClientProvider);

    try {
      await dio.post(
        '/progress/mood/checkin',
        data: {'mood_value': moodValue},
      );
      ref.invalidate(moodProgressProvider);
      return true;
    } catch (_) {
      return false;
    }
  }
}

final moodCheckinProvider = NotifierProvider<MoodCheckinNotifier, void>(
  MoodCheckinNotifier.new,
);
