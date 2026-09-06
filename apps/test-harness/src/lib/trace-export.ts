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
 *   - signals:      the raw `PipelineSignal[]` captured for this turn (via
 *                    `captureSignalBus`), kept for full traceability.
 *
 * This module is a PURE data transformation: it takes an already-fetched
 * `PerTurnTrace[]` (assembled by the `conversation` router from a stored
 * `TestRun.results`) and formats it. No DB reads happen here, per the
 * story's explicit note, so this stays fast to unit test.
 */

export interface PerTurnTrace {
  turnNumber: number;
  message: string;
  response: string | null;
  latencyMs: number;
  resultType: 'agent_turn' | 'crisis' | 'error';
  safetyState: string | null;
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
];

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
    ];
    lines.push(row.join(','));
  }
  const csv = lines.join('\r\n');

  return { json, csv };
}
