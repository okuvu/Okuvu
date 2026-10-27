import type { SafetyState } from '@okuvu/shared-types';
import type { BehaviouralActivationPayload } from '../shared/types.js';
import type { SpecialistOutput } from '../shared/specialist.js';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface A4Input {
  message: string;
  safetyState: SafetyState;
  recentHistory?: ConversationTurn[];
  /** Prior-session themes, already summarised by A15. Optional on first session. */
  userMemoryContext?: string | null;
}

export type A4Output = SpecialistOutput<BehaviouralActivationPayload>;
