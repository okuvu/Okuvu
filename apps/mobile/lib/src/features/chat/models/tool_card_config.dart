enum ToolCardType { guidedBreathing, boxBreathing, grounding5431 }

ToolCardType toolCardTypeFromJson(String value) {
  switch (value) {
    case 'guided_breathing':
      return ToolCardType.guidedBreathing;
    case 'box_breathing':
      return ToolCardType.boxBreathing;
    case 'grounding_5431':
      return ToolCardType.grounding5431;
    default:
      return ToolCardType.guidedBreathing;
  }
}

extension ToolCardTypeX on ToolCardType {
  String get jsonValue {
    switch (this) {
      case ToolCardType.guidedBreathing:
        return 'guided_breathing';
      case ToolCardType.boxBreathing:
        return 'box_breathing';
      case ToolCardType.grounding5431:
        return 'grounding_5431';
    }
  }
}

class BreathingConfig {
  final int inhaleSeconds;
  final int holdSeconds;
  final int exhaleSeconds;
  final int cycles;
  final String label;

  const BreathingConfig({
    required this.inhaleSeconds,
    required this.holdSeconds,
    required this.exhaleSeconds,
    required this.cycles,
    required this.label,
  });

  factory BreathingConfig.fromJson(Map<String, dynamic> json) {
    return BreathingConfig(
      inhaleSeconds: (json['inhale_seconds'] as num?)?.toInt() ?? 4,
      holdSeconds: (json['hold_seconds'] as num?)?.toInt() ?? 2,
      exhaleSeconds: (json['exhale_seconds'] as num?)?.toInt() ?? 6,
      cycles: (json['cycles'] as num?)?.toInt() ?? 3,
      label: (json['label'] as String?) ?? 'Breathing Exercise',
    );
  }
}

class ToolCardConfig {
  final ToolCardType type;
  final BreathingConfig? breathingConfig;

  const ToolCardConfig({
    required this.type,
    this.breathingConfig,
  });

  factory ToolCardConfig.fromJson(Map<String, dynamic> json) {
    final typeStr = json['type'] as String? ?? 'guided_breathing';
    return ToolCardConfig(
      type: toolCardTypeFromJson(typeStr),
      breathingConfig: json['breathing_config'] != null
          ? BreathingConfig.fromJson(
              json['breathing_config'] as Map<String, dynamic>)
          : null,
    );
  }
}