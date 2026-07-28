export type AgentMode = 'normal' | 'grounding-only' | 'alliance-building';

export type CarePlan = 'CP1' | 'CP2' | 'CP3';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface A2Input {
  userId: string;
  message: string;
  carePlan: CarePlan;
  safetyState: 'S0' | 'S1' | 'S2';
  sessionNumber: number;
  turnNumber: number;
  sessionHistorySummary: string | null;
  perceivedIntensity: number | null;
  mode: AgentMode;
  recentHistory: ConversationTurn[];
  sessionSummary?: string | null;
  toolResultContext?: string;
  userMemoryContext?: string | null;
}

export interface A2Output {
  response: string;
  userContent: string;
  signal: S06Signal | null;
  fallbackUsed: boolean;
}

export interface S06MoodInference {
  primary_emotion: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface S06SessionFlags {
  crisis_language_detected: boolean;
  validation_only_turn: boolean;
  technique_refused_by_user: boolean;
}

export interface S06Signal {
  signal: 'S-06';
  agent: 'A2';
  turn_number: number;
  technique_used: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | null;
  estimated_intensity: number | null;
  intensity_direction: 'rising' | 'falling' | 'stable' | 'unknown';
  mood_inference: S06MoodInference;
  session_flags: S06SessionFlags;
  care_plan_fit: 'well_matched' | 'uncertain' | 'possible_mismatch';
  tool_launch_recommended?: 'guided_breathing' | 'box_breathing' | 'grounding_5431';
  breathing_config?: {
    inhale_seconds?: number;
    hold_seconds?: number;
    exhale_seconds?: number;
    cycles?: number;
  };
}

export interface A2ParsedResponse {
  userContent: string;
  signal: S06Signal | null;
}

export interface OnboardingInferenceOutput {
  anxiety_score: number;
  depression_score: number;
  stress_score: number;
  confidence: number;
  reasoning_note: string;
}
