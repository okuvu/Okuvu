import 'tool_card_config.dart';

/// One normal pace per technique, fixed by Dr Goswami's review of 3 Nov 2026
/// (v2.0.0). The Slower / Standard / Faster picker is gone: three paces across
/// four techniques gave the client twelve choices and no guidance, and on the
/// handset the number and the shape ended up on different clocks, which read as
/// "the breathing count is wrong".
///
/// These are her numbers, not a generic scaling of one formula:
///  * Box breathing — 4 in, 4 hold, 4 out, 4 hold.
///  * Physiological sigh — 4 in, 1 top-up, 8 out, no hold. She describes it as
///    "roughly 4 seconds in, 1 for the top-up, 8 out", with the in-breath never
///    feeling rushed.
///  * Extended exhale — 4 in, 8 out, "No hold".
///  * Humming breath — 4 in, 6 hum out.
///
/// Guided breathing is no longer offered (it and Extended exhale were "the same
/// exercise") but is kept here so an older card still arriving from the server
/// plays the pace it was sent with instead of crashing.
const Map<ToolCardType, BreathingConfig> _normalPace = {
  ToolCardType.boxBreathing: BreathingConfig(
    inhaleSeconds: 4,
    holdSeconds: 4,
    exhaleSeconds: 4,
    secondHoldSeconds: 4,
    cycles: 1,
    label: 'Box Breathing',
    isBoxVisual: true,
  ),
  ToolCardType.physiologicalSigh: BreathingConfig(
    inhaleSeconds: 4,
    secondInhaleSeconds: 1,
    holdSeconds: 0,
    exhaleSeconds: 8,
    cycles: 1,
    label: 'Physiological Sigh',
  ),
  ToolCardType.extendedExhale: BreathingConfig(
    inhaleSeconds: 4,
    holdSeconds: 0,
    exhaleSeconds: 8,
    cycles: 1,
    label: 'Extended Exhale',
  ),
  ToolCardType.hummingBreath: BreathingConfig(
    inhaleSeconds: 4,
    holdSeconds: 0,
    exhaleSeconds: 6,
    cycles: 1,
    label: 'Humming Breath',
  ),
  // Legacy only — not offered in the chooser.
  ToolCardType.guidedBreathing: BreathingConfig(
    inhaleSeconds: 4,
    holdSeconds: 2,
    exhaleSeconds: 6,
    cycles: 1,
    label: 'Guided Breathing',
  ),
};

/// Grounding has no timing at all — not tunable, so it's simply absent from
/// [_normalPace]; callers should check [isTunable] first.
bool isTunable(ToolCardType type) => _normalPace.containsKey(type);

BreathingConfig breathingConfigFor(ToolCardType type) {
  final config = _normalPace[type];
  if (config == null) {
    throw ArgumentError('$type has no breathing pace (not a tunable exercise)');
  }
  return config;
}
