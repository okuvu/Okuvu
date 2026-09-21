/**
 * TH-S21 — TH-08 Conversation Driver: clinician-review trace export.
 *
 * `PerTurnTrace` schema (decided/documented here per this story's explicit
 * note — no external spec exists for this shape):
 *
 *   - turnNumber:   1-based index of this turn within the persona script.
 *   - message:      the synthetic user message sent this turn.
 *   - response:     the agent's reply text for this turn, or `null` when the
 *                    turn ended the conversation without a spoken reply (the
 *                    crisis silence path — `PipelineResult.type === 'crisis'`
 *                    has no `message` field).
 *   - latencyMs:    total wall-clock time for this turn's `processTurn` call.
 *   - resultType:   the underlying `PipelineResult['type']` for this turn
 *                    ('agent_turn' | 'crisis' | 'error'), so a reviewer can
 *                    see routing outcome per turn without decoding signals.
 *   - safetyState:  best-effort A1 safety-state label for this turn, read
 *                    from the captured signal bus when present, else null.
 *   - fallbackUsed: whether this turn's agent_turn result silently degraded
 *                    to a fallback response (false for 'crisis'/'error' turns,
 *                    which have no A2 reply to fall back on).
 *   - invariantViolations: deterministic pipeline-invariant violations for
 *                    this turn (signal ordering, suppression — see
 *                    pipeline-invariants.ts), empty when clean.
 *   - signals:      the raw `PipelineSignal[]` captured for this turn (via
 *                    `captureSignalBus`), kept for full traceability.
 *
 * (`InvariantViolation` is a type-only import — pipeline-invariants.ts is
 * itself dependency-light, so this stays a pure data transformation with no
 * new runtime dependency.)
 *
 * This module is a PURE data transformation: it takes an already-fetched
 * `PerTurnTrace[]` (assembled by the `conversation` router from a stored
 * `TestRun.results`) and formats it. No DB reads happen here, per the
 * story's explicit note, so this stays fast to unit test.
 */

import type { InvariantViolation } from './pipeline-invariants';

export interface PerTurnTrace {
  turnNumber: number;
  message: string;
  response: string | null;
  latencyMs: number;
  resultType: 'agent_turn' | 'crisis' | 'error';
  safetyState: string | null;
  fallbackUsed: boolean;
  invariantViolations: InvariantViolation[];
  signals: unknown[];
}

/**
 * Escape a value for a single CSV field per RFC 4180: wrap in double quotes
 * if it contains a comma, quote, or newline, doubling any embedded quotes.
 * Mirrors `paired-export.ts`'s `csvField` helper (TH-S? precedent).
 */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CSV_HEADER = [
  'turn_number',
  'message',
  'response',
  'latency_ms',
  'result_type',
  'safety_state',
  'fallback_used',
  'invariant_violations',
];

/**
 * B3 (OKUVU — Plumbing Fixes & Rationale v1.0): "Enforce that probe exports
 * always include the user input before a case enters the review queue.
 * Reviewers must score the pair, not the reply in isolation."
 *
 * Returns the turn numbers whose stored trace is missing the user stimulus.
 * The export boundary (`conversation.exportTrace`) refuses to produce a
 * review artifact while this returns anything non-empty — a blind review
 * queue is worse than no export. (Legacy runs stored before A7 may lack
 * `message`; they fail loudly here instead of exporting reply-only rows.)
 */
export function missingStimulusTurns(turns: PerTurnTrace[]): number[] {
  return turns
    .filter((t) => typeof t.message !== 'string' || t.message.trim() === '')
    .map((t) => t.turnNumber);
}

/**
 * Format an already-assembled per-turn trace array into the two
 * clinician-review export formats: a full structured JSON array, and a flat
 * one-row-per-turn CSV (the `signals` field is intentionally omitted from
 * CSV — it's not flat/reviewer-friendly — but is present in full in JSON).
 */
export function exportTraceToClinicianFormat(turns: PerTurnTrace[]): { json: string; csv: string } {
  const json = JSON.stringify(turns, null, 2);

  const lines = [CSV_HEADER.join(',')];
  for (const turn of turns) {
    const row = [
      csvField(String(turn.turnNumber)),
      csvField(turn.message),
      csvField(turn.response ?? ''),
      csvField(String(turn.latencyMs)),
      csvField(turn.resultType),
      csvField(turn.safetyState ?? ''),
      csvField(String(turn.fallbackUsed)),
      csvField(turn.invariantViolations.map((v) => v.rule).join('; ')),
    ];
    lines.push(row.join(','));
  }
  const csv = lines.join('\r\n');

  return { json, csv };
}
