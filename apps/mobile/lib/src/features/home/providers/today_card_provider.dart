import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';

class TodayCardReminder {
  final String id;
  final String scheduleNote;
  final String? toolLabel;

  const TodayCardReminder({
    required this.id,
    required this.scheduleNote,
    this.toolLabel,
  });

  factory TodayCardReminder.fromJson(Map<String, dynamic> json) {
    return TodayCardReminder(
      id: json['id'] as String,
      scheduleNote: json['scheduleNote'] as String,
      toolLabel: json['toolLabel'] as String?,
    );
  }
}

class PendingChatAccessRequest {
  final String therapistId;
  final String? therapistName;

  const PendingChatAccessRequest({required this.therapistId, this.therapistName});

  factory PendingChatAccessRequest.fromJson(Map<String, dynamic> json) {
    return PendingChatAccessRequest(
      therapistId: json['therapistId'] as String,
      therapistName: json['therapistName'] as String?,
    );
  }
}

class TodayCardData {
  final String? homeworkId;
  final String? homework;
  final List<TodayCardReminder> reminders;
  final String? quote;
  final PendingChatAccessRequest? pendingChatAccessRequest;

  const TodayCardData({
    required this.homeworkId,
    required this.homework,
    required this.reminders,
    required this.quote,
    required this.pendingChatAccessRequest,
  });

  factory TodayCardData.fromJson(Map<String, dynamic> json) {
    final rawReminders = json['reminders'] as List<dynamic>? ?? [];
    final rawPending = json['pendingChatAccessRequest'] as Map<String, dynamic>?;
    return TodayCardData(
      homeworkId: json['homeworkId'] as String?,
      homework: json['homework'] as String?,
      reminders: rawReminders
          .map((r) => TodayCardReminder.fromJson(r as Map<String, dynamic>))
          .toList(),
      // okuvu-remaining-changes.md O6: null unless the user opted in and has
      // a care plan assigned — see apps/api/src/lib/quote-of-day.ts.
      quote: json['quote'] as String?,
      // therapist-portal wireframes C-08 — null unless a therapist has
      // requested chat access and the client hasn't answered yet.
      pendingChatAccessRequest:
          rawPending != null ? PendingChatAccessRequest.fromJson(rawPending) : null,
    );
  }
}

/// GET /users/me/today — pull-based homework + active reminders for the
/// Home screen's Today card. No push/scheduler: the client fetches this
/// whenever the app is opened, same pattern as [moodProgressProvider].
final todayCardProvider = FutureProvider.autoDispose<TodayCardData>((ref) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get('/users/me/today');
  return TodayCardData.fromJson(response.data as Map<String, dynamic>);
});

/// Posts POST /users/me/homework/:id/complete — the user-confirmed half of
/// "completion is user-confirmed + chat-reported" (the chat-reported half
/// is Worker 05's homework_progress, surfaced to therapists via the portal
/// Report Card).
class HomeworkCompleteNotifier extends Notifier<void> {
  @override
  void build() {}

  Future<bool> markComplete(String homeworkId) async {
    final dio = ref.read(dioClientProvider);
    try {
      await dio.post('/users/me/homework/$homeworkId/complete');
      ref.invalidate(todayCardProvider);
      return true;
    } catch (_) {
      return false;
    }
  }
}

final homeworkCompleteProvider = NotifierProvider<HomeworkCompleteNotifier, void>(
  HomeworkCompleteNotifier.new,
);

/// PATCH /users/me/chat-access — therapist-portal wireframes C-08. The
/// first-ever client-facing write path for chat_access_granted; previously
/// only settable via the portal's own admin attestation.
class ChatAccessRequestNotifier extends Notifier<void> {
  @override
  void build() {}

  Future<bool> respond({required String therapistId, required bool granted}) async {
    final dio = ref.read(dioClientProvider);
    try {
      await dio.patch(
        '/users/me/chat-access',
        data: {'therapist_id': therapistId, 'granted': granted},
      );
      ref.invalidate(todayCardProvider);
      return true;
    } catch (_) {
      return false;
    }
  }
}

final chatAccessRequestProvider = NotifierProvider<ChatAccessRequestNotifier, void>(
  ChatAccessRequestNotifier.new,
);
