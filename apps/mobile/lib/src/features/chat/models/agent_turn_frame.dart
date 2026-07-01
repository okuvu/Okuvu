class AgentTurnFrame {
  final String content;
  final String? turnId;
  final String? timestamp;
  final bool isCrisis;

  const AgentTurnFrame({
    required this.content,
    this.turnId,
    this.timestamp,
    this.isCrisis = false,
  });

  factory AgentTurnFrame.fromJson(Map<String, dynamic> json) {
    final content = json['content'] as String?;
    if (content == null || content.isEmpty) {
      throw const FormatException('AGENT_TURN frame missing or empty content');
    }

    return AgentTurnFrame(
      content: content,
      turnId: json['turn_id'] as String?,
      timestamp: json['timestamp'] as String?,
      isCrisis: json['agent'] == 'crisis',
    );
  }
}
