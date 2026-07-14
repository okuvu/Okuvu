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
      ? (responseData['data'] as List<dynamic>? ?? [])
      : (responseData as List<dynamic>? ?? []);

  return items
      .map((item) => MoodDataPoint.fromJson(item as Map<String, dynamic>))
      .toList();
});
