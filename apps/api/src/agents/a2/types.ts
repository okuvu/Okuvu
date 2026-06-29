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
  mode: AgentMode;
  recentHistory: ConversationTurn[];
  sessionSummary: string | null;
}

export interface A2Output {
  response: string;
  fallbackUsed: boolean;
}

export interface OnboardingInferenceOutput {
  anxiety_score: number;
  depression_score: number;
  stress_score: number;
  confidence: number;
  reasoning_note: string;
}
