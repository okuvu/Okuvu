/**
 * A10 — Insight Generator.
 *
 * Therapist-facing only. A10 reads session summaries that a human (or A15) has
 * already written and returns *descriptive* patterns for the treating
 * clinician. Nothing A10 produces is ever rendered into client-facing text,
 * and A10 never writes to a client record: its only output artefact is the
 * `insight` entry the therapist workspace reads.
 *
 * The contract therefore has two properties the client-facing agents do not
 * need:
 *
 *  - every `evidence` string is a verbatim substring of a supplied summary.
 *    A pattern the therapist cannot trace back to notes is a pattern they
 *    cannot rely on, and a summariser that paraphrases is a summariser that
 *    invents.
 *  - `source_session_ids` only ever references sessions that were supplied for
 *    this call, so the therapist UI can link an insight to real notes and a
 *    stale or fabricated reference cannot be rendered as a citation.
 */

export interface A10Input {
  clientId: string;
  sessionSummaries: Array<{ sessionId: string; date: string; summary: string }>;
  /** Self-reported 0–10 scores. Context for confidence, never for evidence. */
  moodSeries?: Array<{ date: string; score: number }>;
  /** Sessions required before A10 will call the model at all. Default 3. */
  minSessions?: number;
}

export interface Insight {
  id: string;
  theme: string;
  /** Verbatim fragments of supplied summaries, one per supporting observation. */
  evidence: string[];
  confidence: 'low' | 'medium' | 'high';
  source_session_ids: string[];
}

export interface A10Output {
  insights: Insight[];
  /** True when there are fewer usable summaries than `minSessions`; no model call was made. */
  insufficientData: boolean;
  fallbackUsed: boolean;
  failureReason: string | null;
  notes: string | null;
}
