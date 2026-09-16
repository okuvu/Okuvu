import 'tool_card_config.dart';

/// Client-facing pace preset — always exactly one of these three, never a
/// free numeric edit (decisions doc round, 15 Sep 2026 §1). Clamped to the
/// safe band per exercise (§2); each exercise keeps its own identity guard
/// (physiological sigh's locked double-inhale, extended exhale's
/// exhale >= inhale+2, box breathing's locked symmetric square).
enum BreathingPace { slower, standard, faster }

BreathingPace breathingPaceFromJson(String? value) {
  switch (value) {
    case 'slower':
      return BreathingPace.slower;
    case 'faster':
      return BreathingPace.faster;
    default:
      return BreathingPace.standard;
  }
}

extension BreathingPaceX on BreathingPace {
  String get jsonValue {
    switch (this) {
      case BreathingPace.slower:
        return 'slower';
      case BreathingPace.standard:
        return 'standard';
      case BreathingPace.faster:
        return 'faster';
    }
  }

  String get label {
    switch (this) {
      case BreathingPace.slower:
        return 'Slower';
      case BreathingPace.standard:
        return 'Standard';
      case BreathingPace.faster:
        return 'Faster';
    }
  }
}

// Hardcoded per-exercise preset tables — these are clinically-specific
// numbers (decisions doc round, 15 Sep 2026 §2/§3), not algorithmically
// scaled from a generic formula.

const _boxBreathingPresets = {
  BreathingPace.slower: BreathingConfig(
    inhaleSeconds: 5, holdSeconds: 5, exhaleSeconds: 5, secondHoldSeconds: 5,
    cycles: 5, label: 'Box Breathing', isBoxVisual: true,
  ),
  BreathingPace.standard: BreathingConfig(
    inhaleSeconds: 4, holdSeconds: 4, exhaleSeconds: 4, secondHoldSeconds: 4,
    cycles: 5, label: 'Box Breathing', isBoxVisual: true,
  ),
  BreathingPace.faster: BreathingConfig(
    inhaleSeconds: 3, holdSeconds: 3, exhaleSeconds: 3, secondHoldSeconds: 3,
    cycles: 5, label: 'Box Breathing', isBoxVisual: true,
  ),
};

const _guidedBreathingPresets = {
  BreathingPace.slower: BreathingConfig(
    inhaleSeconds: 5, holdSeconds: 4, exhaleSeconds: 8,
    cycles: 3, label: 'Guided Breathing',
  ),
  BreathingPace.standard: BreathingConfig(
    inhaleSeconds: 4, holdSeconds: 2, exhaleSeconds: 6,
    cycles: 3, label: 'Guided Breathing',
  ),
  BreathingPace.faster: BreathingConfig(
    inhaleSeconds: 3, holdSeconds: 0, exhaleSeconds: 4,
    cycles: 3, label: 'Guided Breathing',
  ),
};

const _physiologicalSighPresets = {
  BreathingPace.slower: BreathingConfig(
    inhaleSeconds: 2, secondInhaleSeconds: 2, holdSeconds: 0, exhaleSeconds: 8,
    cycles: 7, label: 'Physiological Sigh',
  ),
  BreathingPace.standard: BreathingConfig(
    inhaleSeconds: 2, secondInhaleSeconds: 2, holdSeconds: 0, exhaleSeconds: 8,
    cycles: 5, label: 'Physiological Sigh',
  ),
  BreathingPace.faster: BreathingConfig(
    inhaleSeconds: 2, secondInhaleSeconds: 2, holdSeconds: 0, exhaleSeconds: 5,
    cycles: 3, label: 'Physiological Sigh',
  ),
};

const _extendedExhalePresets = {
  BreathingPace.slower: BreathingConfig(
    inhaleSeconds: 3, holdSeconds: 4, exhaleSeconds: 8,
    cycles: 3, label: 'Extended Exhale',
  ),
  BreathingPace.standard: BreathingConfig(
    inhaleSeconds: 4, holdSeconds: 2, exhaleSeconds: 8,
    cycles: 3, label: 'Extended Exhale',
  ),
  BreathingPace.faster: BreathingConfig(
    inhaleSeconds: 5, holdSeconds: 0, exhaleSeconds: 7,
    cycles: 3, label: 'Extended Exhale',
  ),
};

const Map<ToolCardType, Map<BreathingPace, BreathingConfig>> _presetTables = {
  ToolCardType.boxBreathing: _boxBreathingPresets,
  ToolCardType.guidedBreathing: _guidedBreathingPresets,
  ToolCardType.physiologicalSigh: _physiologicalSighPresets,
  ToolCardType.extendedExhale: _extendedExhalePresets,
};

/// Grounding has no timing at all — not tunable, so it's simply absent
/// from [_presetTables]; callers should check [isTunable] first.
bool isTunable(ToolCardType type) => _presetTables.containsKey(type);

BreathingConfig breathingConfigFor(ToolCardType type, BreathingPace pace) {
  final table = _presetTables[type];
  if (table == null) {
    throw ArgumentError('$type has no pace presets (not a tunable exercise)');
  }
  return table[pace]!;
}
