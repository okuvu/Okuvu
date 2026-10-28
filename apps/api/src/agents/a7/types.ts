import type { SafetyState } from '@okuvu/shared-types';
import type { MaintenanceTransitionPayload } from '../shared/types.js';
import type { SpecialistOutput } from '../shared/specialist.js';

/** Locally declared for the same reason as A6ConversationTurn — siblings do not import each other's types. */
export interface A7ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface A7Input {
  message: string;
  safetyState: SafetyState;
  recentHistory?: A7ConversationTurn[];
  /** Prior-session themes, already summarised by A15. */
  userMemoryContext?: string | null;
  /**
   * Sessions completed so far. Required, not optional: A7's whole purpose is
   * to prepare someone for *reduced* contact, and that judgement is only
   * coherent once there is enough history to reduce. A default here would let
   * a caller silently prepare a first-session client for the end of support.
   */
  sessionCount: number;
}

export type A7Output = SpecialistOutput<MaintenanceTransitionPayload>;
