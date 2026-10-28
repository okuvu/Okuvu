import type { LlmFailureKind } from '../../lib/llm-failure.js';

export type CarePlan = 'CP1' | 'CP2' | 'CP3';
export type LanguageMode = 'english' | 'mirror';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface A2Input {
  userId: string;
  message: string;
  carePlan: CarePlan;
  safetyState: 'S0' | 'S1' | 'S2';
  sessionHistorySummary: string | null;
  perceivedIntensity: number | null;
  recentHistory: ConversationTurn[];
  sessionSummary?: string | null;
  toolResultContext?: string;
  userMemoryContext?: string | null;
  retrievedContext?: string | null;
  /**
   * OKUVU v2.0 additions. All optional and degrade gracefully to a safe
   * default (see prompts.ts's buildConversationalPrompt) — the
   * therapist-portal integration, homework schema, and tool-id registry
   * that would fully populate these are separate, not-yet-built
   * workstreams (docs/okuvu-v2.0/02-master-handoff.md §4).
   */
  therapistName?: string | null;
  carePlanFocus?: string | null;
  homework?: string | null;
  toolkit?: string[];
  languageMode?: LanguageMode;
}

export interface A2Output {
  response: string;
  userContent: string;
  signal: S07Signal | null;
  fallbackUsed: boolean;
  failureReason?: 'timeout' | 'api_error';
  /** E17-S4 — see GenerateContentResult.failureKind: 'timeout' | 'throttled' | 'unavailable'. */
  failureKind?: LlmFailureKind;
  /** The model that would produce/produced `response` (e.g. 'gemini-2.5-flash') — see `canned` before treating this as real provenance. */
  modelVersion: string;
  /** The A2 conversational prompt's version (see prompts/index.ts's A2_PROMPT_VERSION). */
  promptVersion: string;
  /** True when `response` is canned/test-hook text, not a real model call — callers persisting modelVersion/promptVersion as provenance must treat both as null when this is true. */
  canned: boolean;
}

export interface S07MoodInference {
  primary_emotion: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export type TaperState = 'none' | 'solution_reached' | 'pacifying' | 'nowhere';

/**
 * OKUVU v2.0 signal — supersedes S-06. Continuous chat has no turn_number;
 * crisis_language_detected moves to A1 (the authoritative source, see
 * orchestrator.ts); care_plan_fit moves to Worker 05 (session-summary,
 * not yet built); technique_used/tool_launched become free-form tool-id
 * strings (the T1-T8 codes and the fixed breathing_config shape are
 * retired — a real tool-id registry is a separate, not-yet-built
 * workstream, so these are opaque strings until then).
 */
export interface S07Signal {
  signal: 'S-07';
  agent: 'A2';
  technique_used: string | null;
  tool_launched: string | null;
  taper_state: TaperState;
  closure_offered: boolean;
  frustration_event: boolean;
  homework_referenced: boolean;
  therapist_referral: boolean;
  intensity: number | null;
  mood_inference: S07MoodInference;
  /**
   * OKUVU v2.0 — chat→journal handoff (okuvu-remaining-changes.md §C.4).
   * Null unless this turn surfaces something genuinely worth the user
   * holding onto; when set, the actual suggested prompt text, not a
   * boolean. Transient only — never persisted onto Turn, only forwarded
   * to the client over the websocket (see orchestrator.ts).
   */
  journal_prompt_suggested: string | null;
}

export interface A2ParsedResponse {
  userContent: string;
  signal: S07Signal | null;
}
