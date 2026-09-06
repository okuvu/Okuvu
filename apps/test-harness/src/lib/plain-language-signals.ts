/**
 * Simulator page — translates a turn's raw `PipelineSignal[]` (the same
 * boundary events every other harness screen already captures via
 * `testMode.captureSignalBus`) into short, clinician-readable status rows.
 * No agent codenames (A1/A8/A9-post), no raw payload dumps — this is the
 * one place in the app that owns that translation, so the Simulator's right
 * pane stays a thin renderer over this module's output.
 *
 * Payload shapes below are read directly off `apps/api/src/pipeline/orchestrator.ts`'s
 * `signals.push(...)` call sites, not guessed:
 *   - A1_result: SafetyState string ('S0'..'S4')
 *   - A9_pre_result: GovernanceState string ('Active'|'Restricted'|'Blocked')
 *   - A8_decision: RouterDecision { agent: 'crisis'|'A2', mode?: string }
 *   - A2_result: { userContent, fallbackUsed, signal? , ... }
 *   - A9_post_result: { decision: 'APPROVED'|'BLOCKED', violation_type, confidence }
 */

import type { PipelineSignal } from '@evia/shared-types';
import type { PerTurnTrace } from './trace-export';

export type SignalRowStatus = 'ok' | 'warning' | 'blocked';

export interface PlainLanguageRow {
  label: string;
  status: SignalRowStatus;
  detail: string;
}

const ROW_COLOR_CLASS: Record<SignalRowStatus, string> = {
  ok: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  warning: 'text-amber-700 bg-amber-50 border-amber-200',
  blocked: 'text-red-700 bg-red-50 border-red-200',
};

export function getRowColorClass(status: SignalRowStatus): string {
  return ROW_COLOR_CLASS[status];
}

function findSignal(signals: PipelineSignal[], boundary: string): PipelineSignal | undefined {
  return signals.find((s) => s.boundary === boundary);
}

function describeSafetyCheck(signals: PipelineSignal[]): PlainLanguageRow | null {
  const signal = findSignal(signals, 'A1_result');
  if (!signal) return null;
  const state = typeof signal.payload === 'string' ? signal.payload : null;

  switch (state) {
    case 'S0':
    case 'S1':
      return { label: 'Safety check', status: 'ok', detail: `Cleared (${state})` };
    case 'S2':
      return { label: 'Safety check', status: 'warning', detail: 'Elevated concern noted (S2)' };
    case 'S3':
      return { label: 'Safety check', status: 'warning', detail: 'Significant concern noted (S3)' };
    case 'S4':
      return { label: 'Safety check', status: 'blocked', detail: 'Crisis pathway triggered (S4)' };
    default:
      return { label: 'Safety check', status: 'ok', detail: state ?? 'Completed' };
  }
}

function describePreResponseReview(signals: PipelineSignal[]): PlainLanguageRow | null {
  const signal = findSignal(signals, 'A9_pre_result');
  if (!signal) return null;
  const state = typeof signal.payload === 'string' ? signal.payload : null;

  switch (state) {
    case 'Active':
      return { label: 'Pre-response review', status: 'ok', detail: 'Cleared' };
    case 'Restricted':
      return { label: 'Pre-response review', status: 'warning', detail: 'Flagged for review' };
    case 'Blocked':
      return { label: 'Pre-response review', status: 'blocked', detail: 'Response held for review' };
    default:
      return { label: 'Pre-response review', status: 'ok', detail: state ?? 'Completed' };
  }
}

function describeRouting(signals: PipelineSignal[]): PlainLanguageRow | null {
  const signal = findSignal(signals, 'A8_decision');
  if (!signal) return null;
  const decision = signal.payload as { agent?: string; mode?: string } | null;

  if (decision?.agent === 'crisis') {
    return { label: 'Routing', status: 'blocked', detail: 'Routed to the crisis pathway' };
  }
  return { label: 'Routing', status: 'ok', detail: 'Message routed correctly' };
}

function describeResponse(signals: PipelineSignal[], resultType: PerTurnTrace['resultType']): PlainLanguageRow | null {
  const signal = findSignal(signals, 'A2_result');
  if (!signal) {
    if (resultType === 'crisis') {
      return { label: 'Response generated', status: 'blocked', detail: 'No reply generated (crisis pathway)' };
    }
    return null;
  }
  const payload = signal.payload as { fallbackUsed?: boolean } | null;
  if (payload?.fallbackUsed) {
    return { label: 'Response generated', status: 'warning', detail: 'Reply drafted using a fallback response' };
  }
  return { label: 'Response generated', status: 'ok', detail: 'Reply drafted' };
}

function describePostResponseReview(signals: PipelineSignal[]): PlainLanguageRow | null {
  const signal = findSignal(signals, 'A9_post_result');
  if (!signal) return null;
  const payload = signal.payload as { decision?: string } | null;

  if (payload?.decision === 'BLOCKED') {
    return { label: 'Post-response review', status: 'blocked', detail: 'Reply held and replaced with a safe fallback' };
  }
  return { label: 'Post-response review', status: 'ok', detail: 'Reply cleared for delivery' };
}

/**
 * Ordered rows for the right pane — fixed pipeline order regardless of the
 * signal array's own order, and rows are simply omitted when a boundary
 * never fired for this turn (e.g. A8/A2/A9-post never run on the crisis
 * silence path once A1 short-circuits).
 */
export function getPlainLanguageRows(
  signals: PipelineSignal[],
  resultType: PerTurnTrace['resultType'],
): PlainLanguageRow[] {
  return [
    describeSafetyCheck(signals),
    describePreResponseReview(signals),
    describeRouting(signals),
    describeResponse(signals, resultType),
    describePostResponseReview(signals),
  ].filter((row): row is PlainLanguageRow => row !== null);
}

/**
 * One-line plain-language summary of a whole scripted persona run, for the
 * Simulator's "Run all scenarios" report card. Checks turns in order:
 * crisis short-circuit and errors are always the most important thing to
 * surface; short of that, a fallback reply anywhere in the run is a
 * warning; otherwise the run is clean.
 */
export function summarizePersonaRun(
  turns: PerTurnTrace[],
  endedInCrisis: boolean,
): { status: SignalRowStatus; summary: string } {
  if (endedInCrisis) {
    const lastTurn = turns[turns.length - 1];
    return {
      status: 'blocked',
      summary: `Reached the crisis pathway on turn ${lastTurn?.turnNumber ?? turns.length}`,
    };
  }

  const errorTurns = turns.filter((t) => t.resultType === 'error');
  if (errorTurns.length > 0) {
    return { status: 'blocked', summary: `${errorTurns.length} turn(s) errored` };
  }

  const fallbackCount = turns.filter((turn) => {
    const signal = (turn.signals as PipelineSignal[]).find((s) => s.boundary === 'A2_result');
    const payload = signal?.payload as { fallbackUsed?: boolean } | null;
    return Boolean(payload?.fallbackUsed);
  }).length;

  if (fallbackCount > 0) {
    return {
      status: 'warning',
      summary: `${fallbackCount} repl${fallbackCount === 1 ? 'y' : 'ies'} used a fallback response`,
    };
  }

  return { status: 'ok', summary: `${turns.length} turns, no concerns` };
}
