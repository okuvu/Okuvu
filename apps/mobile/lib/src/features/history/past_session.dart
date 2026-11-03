/// A past conversation, as the server remembers it.
///
/// The Chat screen has always promised "Your conversation will be saved." —
/// these are the rows that promise was already writing (SessionLog + Turn),
/// finally readable back in the app.
class PastSession {
  final String id;
  final DateTime startedAt;

  /// Null when the session was never explicitly ended — the app was closed
  /// mid-chat. Such a session is still listed: the words are still there.
  final DateTime? endedAt;
  final int turnCount;

  /// Bubbles actually stored for this conversation (user + assistant rows).
  final int messageCount;

  /// First thing the user said, one line, trimmed by the server. Null when
  /// that opening turn was blank.
  final String? preview;

  const PastSession({
    required this.id,
    required this.startedAt,
    required this.endedAt,
    required this.turnCount,
    required this.messageCount,
    required this.preview,
  });

  factory PastSession.fromJson(Map<String, dynamic> json) {
    final turnCount = json['turn_count'] as int? ?? 0;
    return PastSession(
      id: json['id'] as String,
      startedAt: DateTime.parse(json['started_at'] as String).toLocal(),
      endedAt: json['ended_at'] == null
          ? null
          : DateTime.parse(json['ended_at'] as String).toLocal(),
      turnCount: turnCount,
      // Older API builds send no message_count; the transcript then shows one
      // user turn and one reply, so doubling turn_count is the honest
      // fallback rather than a zero.
      messageCount: json['message_count'] as int? ?? turnCount * 2,
      preview: json['preview'] as String?,
    );
  }

  bool get wasEndedCleanly => endedAt != null;
}

class TranscriptTurn {
  final String role;
  final String content;
  final int turnNumber;

  const TranscriptTurn({
    required this.role,
    required this.content,
    required this.turnNumber,
  });

  factory TranscriptTurn.fromJson(Map<String, dynamic> json) {
    return TranscriptTurn(
      role: json['role'] as String,
      content: json['content'] as String,
      turnNumber: json['turn_number'] as int? ?? 0,
    );
  }

  bool get isUser => role == 'user';
}

class SessionTranscript {
  final String id;
  final DateTime startedAt;
  final DateTime? endedAt;
  final List<TranscriptTurn> turns;

  const SessionTranscript({
    required this.id,
    required this.startedAt,
    required this.endedAt,
    required this.turns,
  });

  factory SessionTranscript.fromJson(Map<String, dynamic> json) {
    return SessionTranscript(
      id: json['id'] as String,
      startedAt: DateTime.parse(json['started_at'] as String).toLocal(),
      endedAt: json['ended_at'] == null
          ? null
          : DateTime.parse(json['ended_at'] as String).toLocal(),
      turns: (json['turns'] as List? ?? const [])
          .map((t) => TranscriptTurn.fromJson(t as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// "28 Oct 2026 · 2:05 PM" — the same shape the Journal list uses, so dates
/// read the same way across the app. Duplicated rather than shared because the
/// Journal's copy is a private method on its card widget.
String formatSessionDate(DateTime dt) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  final hour = dt.hour;
  final minute = dt.minute.toString().padLeft(2, '0');
  final period = hour >= 12 ? 'PM' : 'AM';
  final displayHour = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
  return '${dt.day} ${months[dt.month - 1]} ${dt.year} · $displayHour:$minute $period';
}

/// "6 messages" / "1 message" — the stored bubble count, said plainly.
String sessionMessageCountLabel(int messageCount) {
  return messageCount == 1 ? '1 message' : '$messageCount messages';
}
