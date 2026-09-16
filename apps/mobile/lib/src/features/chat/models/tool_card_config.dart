enum ToolCardType {
  guidedBreathing,
  boxBreathing,
  grounding5431,
  physiologicalSigh,
  extendedExhale,
}

ToolCardType toolCardTypeFromJson(String value) {
  switch (value) {
    case 'guided_breathing':
      return ToolCardType.guidedBreathing;
    case 'box_breathing':
      return ToolCardType.boxBreathing;
    case 'grounding_5431':
      return ToolCardType.grounding5431;
    case 'physiological_sigh':
      return ToolCardType.physiologicalSigh;
    case 'extended_exhale':
      return ToolCardType.extendedExhale;
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
      case ToolCardType.physiologicalSigh:
        return 'physiological_sigh';
      case ToolCardType.extendedExhale:
        return 'extended_exhale';
    }
  }
}

class BreathingConfig {
  final int inhaleSeconds;
  final int holdSeconds;
  final int exhaleSeconds;
  final int? secondHoldSeconds;
  // Physiological sigh's double-inhale shape: a second inhale immediately
  // after the first, no exhale between them.
  final int? secondInhaleSeconds;
  final int cycles;
  final String label;
  final bool isBoxVisual;

  const BreathingConfig({
    required this.inhaleSeconds,
    required this.holdSeconds,
    required this.exhaleSeconds,
    this.secondHoldSeconds,
    this.secondInhaleSeconds,
    required this.cycles,
    required this.label,
    this.isBoxVisual = false,
  });

  factory BreathingConfig.fromJson(Map<String, dynamic> json) {
    return BreathingConfig(
      inhaleSeconds: (json['inhale_seconds'] as num?)?.toInt() ?? 4,
      holdSeconds: (json['hold_seconds'] as num?)?.toInt() ?? 2,
      exhaleSeconds: (json['exhale_seconds'] as num?)?.toInt() ?? 6,
      secondHoldSeconds: (json['second_hold_seconds'] as num?)?.toInt(),
      secondInhaleSeconds: (json['second_inhale_seconds'] as num?)?.toInt(),
      cycles: (json['cycles'] as num?)?.toInt() ?? 3,
      label: (json['label'] as String?) ?? 'Breathing Exercise',
      isBoxVisual: (json['is_box_visual'] as bool?) ?? false,
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
