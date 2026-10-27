import type { SafetyState } from '@okuvu/shared-types';

/**
 * A13 — Delivery / Speaking Agent. Writes audio, and nothing else.
 *
 * Two invariants, both structural rather than documented:
 *
 *  1. It cannot synthesise text that A12 did not write. `compiledBy` is typed
 *     as the literal `'A12'`, so passing an unfiltered draft is a type error,
 *     not a review comment.
 *  2. It cannot invent audio. With no provider configured it returns
 *     `unavailable` and null audio — a silent fallback that returns an empty
 *     buffer, or a fake duration, would be indistinguishable from a working
 *     voice path in monitoring.
 */

export type SpeechLanguage = 'en-IN' | 'hi-IN';

export interface SpeechRequest {
  text: string;
  voice: string;
  language: SpeechLanguage;
}

export interface SpeechResult {
  audio: Uint8Array;
  mimeType: string;
}

export interface SpeechProvider {
  name: string;
  synthesise(request: SpeechRequest): Promise<SpeechResult>;
}

export interface A13Input {
  text: string;
  /** Provenance. Only A12-compiled text may be spoken. */
  compiledBy: 'A12';
  language?: SpeechLanguage;
  voice?: string;
  safetyState?: SafetyState;
}

export type A13Status = 'ready' | 'unavailable' | 'refused';

export interface A13Output {
  status: A13Status;
  audio: Uint8Array | null;
  mimeType: string | null;
  reason: string | null;
  provider: string | null;
  characters: number;
}

export const MAX_SPEECH_CHARS = 1200;
export const DEFAULT_LANGUAGE: SpeechLanguage = 'en-IN';
