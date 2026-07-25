export interface StageTiming {
  stage: string
  elapsedMs: number
}

import type { OnboardingInferenceOutput } from '../agents/a2/types.js';
import type { ToolCardConfig } from '@evia/shared-types';

export type PipelineResult =
  | {
      type: 'agent_turn'
      message: string
      turnCount: number
      turnId: string | null
      timing: StageTiming[]
      fallbackUsed: boolean
      estimatedIntensity: number | null
      toolCard?: ToolCardConfig
      onboardingInference?: OnboardingInferenceOutput
    }
  | {
      type: 'crisis'
      timing: StageTiming[]
    }
  | {
      type: 'error'
      errorCode: string
      timing: StageTiming[]
    }
