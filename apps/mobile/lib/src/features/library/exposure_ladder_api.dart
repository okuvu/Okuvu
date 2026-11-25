import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// One unlocked step. Only what the client's own screen uses: the label the
/// therapist wrote and its place in the ladder. The therapist's 0-100
/// `difficulty` is in the api's answer and is deliberately not read here — it is
/// the therapist's number, not the client's, and showing it would invite a
/// comparison the owner does not want.
class ExposureStep {
  const ExposureStep({
    required this.id,
    required this.label,
    required this.position,
  });

  final String id;
  final String label;
  final int position;
}

/// What `POST /exposure-ladder/:stepId/run` answered.
class ExposureRunResult {
  const ExposureRunResult({
    required this.pause,
    this.pauseMessage,
    this.groundingToolId,
  });

  final bool pause;
  final String? pauseMessage;
  final String? groundingToolId;

  factory ExposureRunResult.fromJson(Map<String, dynamic> json) {
    final message = json['pauseMessage'] as String?;
    final grounding = json['groundingToolId'] as String?;
    return ExposureRunResult(
      pause: json['pause'] == true,
      pauseMessage:
          message != null && message.trim().isNotEmpty ? message.trim() : null,
      groundingToolId:
          grounding != null && grounding.trim().isNotEmpty ? grounding.trim() : null,
    );
  }
}

/// The client's door to the ladder.
///
/// The api answers with the unlocked steps only and 404s anything else, so this
/// client does not filter, and it does not cache: [steps] is a request every
/// time the screen is opened, because a step the therapist has just unlocked
/// must appear without the client restarting the app.
class ExposureLadderApi {
  ExposureLadderApi(this._dio);

  final Dio _dio;

  Future<List<ExposureStep>> steps() async {
    final res = await _dio.get<Map<String, dynamic>>('/exposure-ladder');
    final raw = res.data?['steps'];
    if (raw is! List) return const [];
    return raw.whereType<Map<String, dynamic>>().map((row) {
      return ExposureStep(
        id: row['id'] as String? ?? '',
        label: row['label'] as String? ?? '',
        position: (row['position'] as num?)?.toInt() ?? 0,
      );
    }).toList();
  }

  /// Record the client's own numbers. `after` is absent when the run stopped at
  /// the before-rating — a pause is a real answer, not a missing one.
  Future<ExposureRunResult> run(
    String stepId, {
    required int before,
    int? after,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/exposure-ladder/$stepId/run',
      data: {
        'before': before,
        if (after != null) 'after': after,
      },
    );
    return ExposureRunResult.fromJson(res.data ?? const <String, dynamic>{});
  }
}

final exposureLadderApiProvider = Provider<ExposureLadderApi>((ref) {
  return ExposureLadderApi(ref.watch(dioClientProvider));
});
