import type { ToolCardConfig, ToolCardType, BreathingConfig } from '@okuvu/shared-types';

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
      cycles: 3,
      label: 'Box Breathing',
    },
  },
  grounding_5431: {
    type: 'grounding_5431',
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
