import type { SafetyState } from '@okuvu/shared-types';
import type { SpecialistPayload } from '../shared/types.js';

/**
 * A12 input. Two modes, deliberately separate:
 *
 *  - `compile`: payloads only, no model call. Deterministic templates from an
 *    approved copy library. This is the safe default and the only mode that
 *    can run in tests, in sandbox, or in an outage.
 *  - `assemble`: a dialogue draft (A2's prose) plus at most one compiled
 *    specialist block. A2 remains the conversational voice; A12 owns the final
 *    string that reaches the client and is the only agent allowed to emit it.
 */
export type A12Mode = 'compile' | 'assemble';

export type ToneProfile = 'warm' | 'neutral' | 'direct';

export interface A12Input {
  mode: A12Mode;
  payloads: SpecialistPayload[];
  /** Required in `assemble` mode; ignored in `compile`. */
  dialogueDraft?: string | null;
  safetyState: SafetyState;
  toneProfile?: ToneProfile;
  languageMode?: 'english' | 'mirror';
}

export interface CompiledText {
  text: string;
  mode: A12Mode;
  usedPayloads: string[];
  /** Payload types with no approved template — never rendered speculatively. */
  droppedPayloads: string[];
  /** Lint findings that were repaired by truncation or removal. */
  repairs: string[];
}

export interface A12Output {
  ok: boolean;
  compiled: CompiledText | null;
  errors: string[];
}
