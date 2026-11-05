import type { ToolCardConfig, ToolCardType, BreathingConfig } from '@okuvu/shared-types';

/// The server-side defaults for every tool card A2 can launch.
///
/// Timing is Dr Goswami's approved v2.0.0 set (3 Nov 2026): box 4-4-4-4,
/// physiological sigh 4 in + 1 top-up + 8 out, extended exhale 4 in / 8 out (no
/// hold), humming breath 4 in / 6 hum out. `cycles` is legacy — the player runs
/// rounds of ten breaths (five for the sigh) and ignores it — but it is kept
/// stable so an older build still plays something sensible.
///
/// guided_breathing is no longer offered in the app ("it and Extended exhale
/// are essentially the same exercise") but stays here because older turns and
/// older prompts can still reference it.
const DEFAULTS: Record<ToolCardType, ToolCardConfig> = {
  guided_breathing: {
    type: 'guided_breathing',
    breathing_config: {
      inhale_seconds: 4,
      hold_seconds: 2,
      exhale_seconds: 6,
      cycles: 3,
      label: 'Guided Breathing',
    },
  },
  box_breathing: {
    type: 'box_breathing',
    breathing_config: {
      inhale_seconds: 4,
      hold_seconds: 4,
      exhale_seconds: 4,
      second_hold_seconds: 4,
      cycles: 5,
      label: 'Box Breathing',
      is_box_visual: true,
    },
  },
  grounding_5431: {
    type: 'grounding_5431',
  },
  physiological_sigh: {
    type: 'physiological_sigh',
    breathing_config: {
      inhale_seconds: 4,
      second_inhale_seconds: 1,
      hold_seconds: 0,
      exhale_seconds: 8,
      cycles: 5,
      label: 'Physiological Sigh',
    },
  },
  extended_exhale: {
    type: 'extended_exhale',
    breathing_config: {
      inhale_seconds: 4,
      hold_seconds: 0,
      exhale_seconds: 8,
      cycles: 3,
      label: 'Extended Exhale',
    },
  },
  humming_breath: {
    type: 'humming_breath',
    breathing_config: {
      inhale_seconds: 4,
      hold_seconds: 0,
      exhale_seconds: 6,
      cycles: 10,
      label: 'Humming Breath',
    },
  },
};

export function buildToolCard(
  toolType: ToolCardType,
  config?: Partial<BreathingConfig>,
): ToolCardConfig {
  const base = DEFAULTS[toolType] ?? DEFAULTS['guided_breathing'];

  if (config && base.breathing_config) {
    return {
      ...base,
      breathing_config: {
        ...base.breathing_config,
        ...config,
      },
    };
  }

  return base;
}
