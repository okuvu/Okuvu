export interface StageTiming {
  stage: string
  elapsedMs: number
}

import type { OnboardingInferenceOutput } from '../agents/a2/types.js';
import type { ToolCardConfig, SafetyState, GovernanceState, RouterDecision, PipelineSignal } from '@okuvu/shared-types';

// ─── Test Hooks (TH-S10) ───────────────────────────────────────────
//
// `TestModeOptions` is consumed exclusively via the optional 5th argument
// (`opts.testMode`) of `processTurn`. It must never be read from environment
// variables. When `opts` (or `opts.testMode`) is absent, `processTurn`
// behaves identically to the pre-TH-S10 implementation.
export interface TestModeOptions {
  /** Skip classifySafety entirely and use this value directly as safetyState. */
  injectA1?: SafetyState
  /** Skip classifyGovernance entirely and use this value directly as governanceState. */
  injectA9?: GovernanceState
  /** Skip routeTurn entirely and use this decision directly. */
  injectRouter?: RouterDecision
  /** Skip the Layer 3 RAG retrieval entirely and use this string directly as retrievedContext. */
  injectRetrievedContext?: string
  /**
   * Shallow-merge `payload` onto a boundary's result object before it is read.
   * Only `boundary: 'a2_result'` is supported for this story: it merges onto
   * the object returned by `handleTurn` (A2) before `finalText`/`a2Fallback`/
   * signal fields are derived from it.
   */
  signalOverride?: { boundary: string; payload: unknown }
  /**
   * When true, capture an ordered array of PipelineSignal records — one per
   * boundary crossed (A1 result, A9-pre result, A8 decision, A2 result,
   * A9-post result) — and return it on the result under `signals`.
   */
  captureSignalBus?: boolean
  /**
   * Force the named boundary's underlying call to reject with a synthetic
   * Error instead of actually calling it. This routes through the existing
   * fallback/catch logic already present in processTurn — no new fallback
   * paths are introduced.
   */
  faults?: { boundary: 'A1' | 'A2' | 'A9_pre' | 'A9_post'; type: 'timeout' | 'api_error' }
}

export type PipelineResult =
  | {
      type: 'agent_turn'
      message: string
      turnCount: number
      turnId: string | null
      timing: StageTiming[]
      fallbackUsed: boolean
      failureReason?: 'timeout' | 'api_error'
      estimatedIntensity: number | null
      toolCard?: ToolCardConfig
      onboardingInference?: OnboardingInferenceOutput
      signals?: PipelineSignal[]
    }
  | {
      type: 'crisis'
      timing: StageTiming[]
      signals?: PipelineSignal[]
    }
  | {
      type: 'error'
      errorCode: string
      timing: StageTiming[]
      signals?: PipelineSignal[]
    }
