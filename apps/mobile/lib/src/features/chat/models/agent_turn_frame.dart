class AgentTurnFrame {
  final String content;
  final String? turnId;
  final String? timestamp;
  final int turnCount;

  const AgentTurnFrame({
    required this.content,
    this.turnId,
    this.timestamp,
    this.turnCount = 0,
  });

  factory AgentTurnFrame.fromJson(Map<String, dynamic> json) {
    final payload = json['payload'] as Map<String, dynamic>?;

    final content = (payload?['message'] as String?) ?? (json['content'] as String?);
    if (content == null || content.isEmpty) {
      throw const FormatException('AGENT_TURN frame missing or empty content');
    }

    return AgentTurnFrame(
      content: content,
      turnId: (payload?['turn_id'] as String?) ?? (json['turn_id'] as String?),
      timestamp: (payload?['timestamp'] as String?) ?? (json['timestamp'] as String?),
      turnCount: (payload?['turn_count'] as int?) ?? (json['turn_count'] as int?) ?? 0,
    );
  }
}
