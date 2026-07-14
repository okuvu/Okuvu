class IntakeMessage {
  final String role;
  final String content;
  final DateTime? timestamp;

  const IntakeMessage({
    required this.role,
    required this.content,
    this.timestamp,
  });

  IntakeMessage copyWith({
    String? role,
    String? content,
    DateTime? timestamp,
  }) {
    return IntakeMessage(
      role: role ?? this.role,
      content: content ?? this.content,
      timestamp: timestamp ?? this.timestamp,
    );
  }

  Map<String, dynamic> toJson() => {
        'role': role,
        'content': content,
        if (timestamp != null)
          'timestamp': timestamp!.toUtc().toIso8601String(),
      };

  factory IntakeMessage.fromJson(Map<String, dynamic> json) => IntakeMessage(
        role: json['role'] as String,
        content: json['content'] as String,
        timestamp: json['timestamp'] != null
            ? DateTime.parse(json['timestamp'] as String)
            : null,
      );

  @override
  String toString() => 'IntakeMessage(role: $role, content: $content)';
}
