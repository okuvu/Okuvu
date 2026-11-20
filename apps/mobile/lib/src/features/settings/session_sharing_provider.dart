import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// One past session, as the client's sharing screen sees it.
///
/// No summary text: the client is not shown the therapist's reading of their
/// own session here. The list exists so a client can say "not that one".
class SharedSession {
  final String sessionId;
  final DateTime startedAt;
  final String status;
  final bool shared;

  const SharedSession({
    required this.sessionId,
    required this.startedAt,
    required this.status,
    required this.shared,
  });

  factory SharedSession.fromJson(Map<String, dynamic> json) {
    return SharedSession(
      sessionId: json['sessionId'] as String,
      startedAt: DateTime.parse(json['startedAt'] as String).toLocal(),
      status: json['status'] as String? ?? 'PENDING',
      shared: json['shared'] as bool? ?? false,
    );
  }
}

class SessionSharingData {
  final String? therapistName;

  /// Null when the relationship switch is off — nothing is shared, whatever
  /// the per-session switches say.
  final DateTime? expiresAt;
  final List<SharedSession> sessions;

  const SessionSharingData({
    this.therapistName,
    this.expiresAt,
    required this.sessions,
  });

  bool get relationshipOpen => expiresAt != null;

  factory SessionSharingData.fromJson(Map<String, dynamic> json) {
    final rawSessions = json['sessions'] as List<dynamic>? ?? const [];
    return SessionSharingData(
      therapistName: json['therapistName'] as String?,
      expiresAt: json['expiresAt'] != null
          ? DateTime.parse(json['expiresAt'] as String).toLocal()
          : null,
      sessions: rawSessions
          .map((e) => SharedSession.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// GET /users/me/sessions/sharing — the sessions a client can share or
/// withhold individually, under the Privacy & Data switch.
final sessionSharingProvider = FutureProvider.autoDispose<SessionSharingData>((ref) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get('/users/me/sessions/sharing');
  return SessionSharingData.fromJson(response.data as Map<String, dynamic>);
});

/// PATCH /users/me/sessions/:id/summary-share — the only write path for
/// SessionSummary.share_with_therapist. There is no therapist-side equivalent.
class SessionShareNotifier extends Notifier<void> {
  @override
  void build() {}

  Future<bool> setShared({required String sessionId, required bool shared}) async {
    final dio = ref.read(dioClientProvider);
    try {
      await dio.patch(
        '/users/me/sessions/$sessionId/summary-share',
        data: {'shared': shared},
      );
      ref.invalidate(sessionSharingProvider);
      return true;
    } catch (_) {
      return false;
    }
  }
}

final sessionShareProvider = NotifierProvider<SessionShareNotifier, void>(
  SessionShareNotifier.new,
);
