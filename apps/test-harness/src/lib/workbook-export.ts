/**
 * TH-S38 — Simulated-Conversation Runner Spec v1.1: bulk output export.
 *
 * One workbook, three sheets (spec §5 TH-S38):
 *   Summary  — 1 row per run
 *   Turns    — 1 row per turn (the flat table that replaces hand-copying)
 *   Sessions — 1 row per session, with the C1–C5 continuity rollup
 *
 * Built on the `xlsx` library already in the repo (currently import-only —
 * no new dependency). This module is a PURE builder: it takes
 * already-fetched run rows and returns the workbook buffer, so it is
 * unit-testable without a DB, and the router owns scoping/bounding.
 *
 * Serverless constraint (spec TH-S38): large workbooks must not blow the
 * response limit — the caller bounds the export (MAX_EXPORT_ROWS) and the
 * router surfaces the row count before generating.
 */

import * as XLSX from 'xlsx';

export const MAX_EXPORT_ROWS = 20_000;

export interface ExportRunRow {
  id: string;
  environment: string;
  status: string;
  canned: boolean;
  created_at: Date;
  completed_at: Date | null;
  persona_id: string | null;
  persona_version: string | null;
  simulator_model: string | null;
  session_index: number | null;
  gap_before_ms: number | null;
  results: unknown;
}

interface TurnShape {
  turnNumber?: number;
  message?: string;
  response?: string | null;
  latencyMs?: number;
  resultType?: string;
  safetyState?: string | null;
  fallbackUsed?: boolean;
  invariantViolations?: { rule: string }[];
  signals?: unknown[];
}

interface ContinuityShape {
  C1?: string;
  C2?: string;
  C3?: string;
  C4?: string;
  C5?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function countFallback(turns: TurnShape[]): number {
  // A4 semantics: fallbackUsed:true OR a string fallbackSource marks a
  // substitute reply (older runs persisted blocked turns with
  // fallbackUsed:false — the source field is the second, honest witness,
  // same rule scorecard.ts's extractTurnLike applies).
  return turns.filter(
    (t) =>
      t.fallbackUsed === true ||
      typeof (t as { fallbackSource?: unknown }).fallbackSource === 'string',
  ).length;
}

function gateVerdict(status: string): string {
  return status === 'pass' ? 'PASS' : status === 'incomplete' ? 'INCOMPLETE (excluded)' : status.toUpperCase();
}

/** Extract the per-turn rows from any known `results` shape (mirrors scorecard.ts's defensive extraction). */
export function extractTurns(results: unknown): TurnShape[] {
  if (!isRecord(results)) return [];
  if (Array.isArray(results.turns)) return results.turns as TurnShape[];
  // pipeline/corpus single-turn shape: { result: { message, ... }, signals }
  if (isRecord(results.result) && typeof results.result.message === 'string') {
    return [
      {
        message: typeof results.result.message === 'string' ? (results.result as { message: string }).message : undefined,
        response: typeof (results.result as { message?: string }).message === 'string' ? (results.result as { message: string }).message : null,
        resultType: typeof (results.result as { type?: string }).type === 'string' ? (results.result as { type: string }).type : undefined,
        fallbackUsed: (results.result as { fallbackUsed?: boolean }).fallbackUsed === true,
      },
    ];
  }
  return [];
}

function extractContinuity(results: unknown): ContinuityShape | null {
  if (isRecord(results) && isRecord(results.continuity)) {
    return results.continuity as ContinuityShape;
  }
  return null;
}

export interface BuildWorkbookInput {
  runs: ExportRunRow[];
}

export function buildRunsWorkbook({ runs }: BuildWorkbookInput): {
  buffer: Buffer;
  rowCount: number;
  truncated: boolean;
  summaryRows: number;
  turnRows: number;
  sessionRows: number;
} {
  // Bound BEFORE building (serverless response limits).
  const bounded = runs.slice(0, MAX_EXPORT_ROWS);
  const truncated = runs.length > MAX_EXPORT_ROWS;

  const summaryRows: Record<string, unknown>[] = [];
  const turnRows: Record<string, unknown>[] = [];
  const sessionRows: Record<string, unknown>[] = [];

  for (const run of bounded) {
    const results = run.results;
    const turns = extractTurns(results);
    const continuity = extractContinuity(results);
    const isSessionClose = isRecord(results) && results.sessionClose === true;

    // ── Summary sheet: 1 row per run ──
    summaryRows.push({
      runId: run.id,
      persona: run.persona_id ?? '(n/a)',
      personaVersion: run.persona_version ?? '',
      environment: run.environment,
      sessionIndex: run.session_index ?? '',
      turns: isSessionClose ? turns.length : turns.length,
      status: run.status,
      canned: run.canned,
      fallbackCount: countFallback(turns),
      invariantViolations: turns.reduce(
        (acc, t) => acc + (t.invariantViolations?.length ?? 0),
        0,
      ),
      startedAt: run.created_at.toISOString(),
      completedAt: run.completed_at?.toISOString() ?? '',
      gateVerdict: gateVerdict(run.status),
    });

    // ── Turns sheet: 1 row per turn (session-close rows carry no turns) ──
    for (const t of turns) {
      turnRows.push({
        runId: run.id,
        persona: run.persona_id ?? '',
        sessionIndex: run.session_index ?? '',
        turnInSession: t.turnNumber ?? '',
        turnNumber: t.turnNumber ?? '',
        userMessage: t.message ?? '',
        okuvuResponse: t.response ?? '',
        safetyState: t.safetyState ?? '',
        resultType: t.resultType ?? '',
        latencyMs: t.latencyMs ?? '',
        fallbackUsed: t.fallbackUsed === true,
        failureReason: '',
        gapBeforeMs: run.gap_before_ms ?? '',
        invariantViolations: (t.invariantViolations ?? []).map((v) => v.rule).join('; '),
      });
    }

    // ── Sessions sheet: 1 row per session-close run ──
    if (isSessionClose || continuity) {
      sessionRows.push({
        runId: run.id,
        persona: run.persona_id ?? '',
        sessionIndex: run.session_index ?? '',
        gapBeforeMs: run.gap_before_ms ?? '',
        summaryWritten: isRecord(results) && results.summaryWritten === true ? true : continuity ? 'see continuity' : '',
        memoryWritten: isRecord(results) && results.memoryWritten === true ? true : '',
        C1: continuity?.C1 ?? '',
        C2: continuity?.C2 ?? '',
        C3: continuity?.C3 ?? '',
        C4: continuity?.C4 ?? '',
        C5: continuity?.C5 ?? '',
      });
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(turnRows), 'Turns');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessionRows), 'Sessions');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return {
    buffer,
    rowCount: bounded.length,
    truncated,
    summaryRows: summaryRows.length,
    turnRows: turnRows.length,
    sessionRows: sessionRows.length,
  };
}
