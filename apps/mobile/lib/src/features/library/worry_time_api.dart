import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// One parked worry, exactly as the client typed it.
class ParkedWorry {
  const ParkedWorry({
    required this.id,
    required this.text,
    this.createdAt,
  });

  final String id;
  final String text;
  final DateTime? createdAt;
}

/// The daily window: a time in IST (`HH:MM`), a length in minutes and whether
/// the reminder is on.
class WorryTimeSetting {
  const WorryTimeSetting({
    required this.time,
    required this.minutes,
    required this.active,
  });

  /// `HH:MM`, 24-hour — the same string the api stores.
  final String time;
  final int minutes;
  final bool active;

  factory WorryTimeSetting.fromJson(Map<String, dynamic> json) {
    return WorryTimeSetting(
      time: json['time'] as String? ?? '',
      minutes: (json['minutes'] as num?)?.toInt() ?? 10,
      active: json['active'] as bool? ?? true,
    );
  }

  WorryTimeSetting copyWith({String? time, int? minutes, bool? active}) {
    return WorryTimeSetting(
      time: time ?? this.time,
      minutes: minutes ?? this.minutes,
      active: active ?? this.active,
    );
  }
}

/// What `GET /worry-time` answered: the setting (absent until the client makes
/// one) and the worries still parked.
class WorryTimeState {
  const WorryTimeState({required this.setting, required this.parked});

  final WorryTimeSetting? setting;
  final List<ParkedWorry> parked;
}

/// The client's half of worry time.
///
/// Nothing here counts, scores or compares worries: the list is the client's
/// own words and a review answer is a record of what they said, not a result.
class WorryTimeApi {
  WorryTimeApi(this._dio);

  final Dio _dio;

  Future<WorryTimeState> load() async {
    final res = await _dio.get<Map<String, dynamic>>('/worry-time');
    final body = res.data ?? const <String, dynamic>{};
    final rawSetting = body['setting'];
    final rawParked = body['parked'];

    return WorryTimeState(
      setting: rawSetting is Map<String, dynamic>
          ? WorryTimeSetting.fromJson(rawSetting)
          : null,
      parked: rawParked is List
          ? rawParked.whereType<Map<String, dynamic>>().map((row) {
              final createdAt = row['createdAt'] as String?;
              return ParkedWorry(
                id: row['id'] as String? ?? '',
                text: row['text'] as String? ?? '',
                createdAt: createdAt == null ? null : DateTime.tryParse(createdAt),
              );
            }).toList()
          : const [],
    );
  }

  Future<WorryTimeSetting> saveSettings({
    required String time,
    required int minutes,
    required bool active,
  }) async {
    final res = await _dio.put<Map<String, dynamic>>(
      '/worry-time/settings',
      data: {
        'time': time,
        'minutes': minutes,
        'active': active,
      },
    );
    final setting = res.data?['setting'];
    if (setting is! Map<String, dynamic>) {
      throw StateError('worry-time settings answered without a setting');
    }
    return WorryTimeSetting.fromJson(setting);
  }

  /// Park a worry. The api screens the text on the way in and answers with the
  /// help flags, exactly as a journal entry does.
  Future<({String id, bool showHelp, bool helpOffer})> park(String text) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/worry-time/parked',
      data: {'text': text},
    );
    final body = res.data ?? const <String, dynamic>{};
    final safety = body['safety'];
    return (
      id: body['id'] as String? ?? '',
      showHelp: safety is Map && safety['showHelp'] == true,
      helpOffer: safety is Map && safety['helpOffer'] == true,
    );
  }

  /// `still` = still bothering me, `released` = not anymore.
  Future<void> resolve(String id, String status) async {
    await _dio.post<Map<String, dynamic>>(
      '/worry-time/parked/$id/resolve',
      data: {'status': status},
    );
  }

  Future<void> remove(String id) async {
    await _dio.delete<Map<String, dynamic>>('/worry-time/parked/$id');
  }
}

final worryTimeApiProvider = Provider<WorryTimeApi>((ref) {
  return WorryTimeApi(ref.watch(dioClientProvider));
});
