import type { SafetyState } from '@okuvu/shared-types';
import type { MeaningValuesPayload } from '../shared/types.js';
import type { SpecialistOutput } from '../shared/specialist.js';

/**
 * Same turn shape A3 uses, declared locally rather than imported from
 * `../a3/types.js`. Specialists are siblings: making A6's input type depend on
 * another specialist's file means editing A3's history handling can break A6,
 * and a circular import the day A3 wants something back.
 */
export interface A6ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface A6Input {
  message: string;
  safetyState: SafetyState;
  recentHistory?: A6ConversationTurn[];
  /** Prior-session themes, already summarised by A15. Optional on first session. */
  userMemoryContext?: string | null;
  /**
   * Sessions completed so far. Optional here — A6 does not gate on it — but
   * passed through so the prompt can avoid implying long-term history the
   * client does not have.
   */
  sessionCount?: number;
}

export type A6Output = SpecialistOutput<MeaningValuesPayload>;
