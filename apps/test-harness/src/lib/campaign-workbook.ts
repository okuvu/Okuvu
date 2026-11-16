/**
 * The persona-campaign workbook: one file that answers "what happened in this
 * run" without the reviewer opening the screen.
 *
 * Six sheets, because the evidence a verdict rests on is genuinely in six
 * places and flattening them loses the thing being audited:
 *
 *   Run       — the frozen parameters (sessions, turns, gap plan, seed, judge,
 *               ceiling, estimate) so a transcript is attributable to a config.
 *   Summary   — one row per persona: verdict, reason, counters, cost.
 *   Sessions  — one row per session: C1–C5 continuity and that session's judge
 *               verdict. This is the sheet that shows *where* continuity broke.
 *   Turns     — one row per turn: the client message, the reply, safety state,
 *               routing, latency, and the technique A2 reported using.
 *   Findings  — one row per deterministic finding, with the turn it came from.
 *   Judge     — one row per graded session, with the rationale verbatim.
 *
 * Pure: takes already-loaded evidence, returns sheet specs. No DB, no model.
 */

import type { GroupVerdict, JudgeVerdictRecord, ContinuityKey } from './campaign-verdict';
import type { PerTurnTrace } from './trace-export';
import { cell, type SheetSpec } from './xlsx-export';

export interface CampaignExportMeta {
  id: string;
  label: string;
  environment: string;
  target: string;
  status: string;
  sessions: number;
  turnsMin: number;
  turnsMax: number;
  gapPlanMs: number[];
  seed: number;
  judgeEnabled: boolean;
  costCeilingUsd: number;
  costEstimateUsd: number;
  plannedTurns: number;
  createdAt: string;
}

export interface CampaignExportSession {
  index: number;
  continuity: Partial<Record<ContinuityKey, string>>;
}

export interface CampaignExportGroup {
  groupId: string;
  personaId: string;
  personaVersion: string;
  groupStatus: string;
  turnsCompleted: number;
  sessionsCompleted: number;
  costSoFarUsd: number;
  incompleteReason: string | null;
  verdict: GroupVerdict;
  sessions: CampaignExportSession[];
  turns: { sessionIndex: number; trace: PerTurnTrace }[];
  judgeVerdicts: JudgeVerdictRecord[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * A2 reports the technique it used on a signal payload (`technique_used`) and
 * sometimes the tool it actually launched (`tool_launched`). Both are read
 * defensively: a run recorded before those fields existed must export as
 * blank, not throw.
 */
export function techniqueFromSignals(signals: unknown[]): { technique: string; tool: string } {
  let technique = '';
  let tool = '';
  for (const signal of signals ?? []) {
    const record = asRecord(signal);
    if (!record) continue;
    if (record.agent !== 'A2') continue;
    const payload = asRecord(record.payload);
    if (!payload) continue;
    if (typeof payload.technique_used === 'string' && payload.technique_used) {
      technique = payload.technique_used;
    }
    if (typeof payload.tool_launched === 'string' && payload.tool_launched) {
      tool = payload.tool_launched;
    }
  }
  return { technique, tool };
}

export function buildCampaignWorkbook(
  meta: CampaignExportMeta,
  groups: CampaignExportGroup[],
): { sheets: SheetSpec[]; turnRows: number; findingRows: number; judgeRows: number } {
  const runRows: Record<string, unknown>[] = [
    { parameter: 'Campaign id', value: meta.id },
    { parameter: 'Label', value: meta.label },
    { parameter: 'Environment', value: meta.environment },
    { parameter: 'Target', value: meta.target },
    { parameter: 'Status', value: meta.status },
    { parameter: 'Personas', value: groups.length },
    { parameter: 'Sessions per persona', value: meta.sessions },
    { parameter: 'Turns per session', value: `${meta.turnsMin}–${meta.turnsMax}` },
    { parameter: 'Gap plan (ms)', value: meta.gapPlanMs.join(', ') },
    { parameter: 'Seed', value: meta.seed },
    { parameter: 'Judge', value: meta.judgeEnabled ? 'on' : 'off' },
    { parameter: 'Cost ceiling (USD)', value: meta.costCeilingUsd },
    { parameter: 'Cost estimate (USD)', value: meta.costEstimateUsd },
    { parameter: 'Planned turns', value: meta.plannedTurns },
    { parameter: 'Created at', value: meta.createdAt },
  ];

  const summaryRows: Record<string, unknown>[] = [];
  const sessionRows: Record<string, unknown>[] = [];
  const turnRows: Record<string, unknown>[] = [];
  const findingRows: Record<string, unknown>[] = [];
  const judgeRows: Record<string, unknown>[] = [];

  for (const group of groups) {
    summaryRows.push({
      persona: group.personaId,
      personaVersion: group.personaVersion,
      groupId: group.groupId,
      verdict: group.verdict.verdict,
      code: group.verdict.code,
      reason: group.verdict.reason,
      turnsCompleted: group.turnsCompleted,
      sessionsCompleted: group.sessionsCompleted,
      erroredTurns: group.verdict.checks.erroredTurns,
      fallbackTurns: group.verdict.checks.fallbackTurns,
      invariantViolations: group.verdict.checks.invariantViolations,
      continuityFailures: group.verdict.checks.continuityFailures.join('; '),
      judgedSessions: group.verdict.checks.judgedSessions,
      failedJudgeSessions: group.verdict.checks.failedJudgeSessions,
      ungradedSessions: group.verdict.checks.ungradedSessions,
      findings: group.verdict.findings.length,
      costUsd: group.costSoFarUsd,
      groupStatus: group.groupStatus,
      incompleteReason: group.incompleteReason ?? '',
    });

    for (const session of group.sessions) {
      const judge = group.judgeVerdicts.find((verdict) => verdict.sessionIndex === session.index);
      sessionRows.push({
        persona: group.personaId,
        groupId: group.groupId,
        sessionIndex: session.index,
        C1: session.continuity.C1 ?? '',
        C2: session.continuity.C2 ?? '',
        C3: session.continuity.C3 ?? '',
        C4: session.continuity.C4 ?? '',
        C5: session.continuity.C5 ?? '',
        judgeStatus: judge ? (judge.judged ? (judge.passed ? 'pass' : 'fail') : 'ungraded') : 'not graded',
        judgeRationale: judge?.rationale ?? '',
      });
    }

    for (const entry of group.turns) {
      const trace = entry.trace;
      const { technique, tool } = techniqueFromSignals(trace.signals);
      const turnFindings = group.verdict.findings.filter(
        (finding) => finding.turnNumber === trace.turnNumber,
      );
      turnRows.push({
        persona: group.personaId,
        groupId: group.groupId,
        sessionIndex: entry.sessionIndex,
        turnNumber: trace.turnNumber,
        clientMessage: cell(trace.message),
        agentReply: cell(trace.response ?? ''),
        resultType: trace.resultType,
        safetyState: trace.safetyState ?? '',
        fallbackUsed: trace.fallbackUsed,
        technique,
        tool,
        latencyMs: Math.round(trace.latencyMs),
        invariantViolations: (trace.invariantViolations ?? []).map((v) => v.rule).join('; '),
        findings: turnFindings.map((finding) => `${finding.rule} (${finding.severity})`).join('; '),
      });
    }

    for (const finding of group.verdict.findings) {
      findingRows.push({
        persona: group.personaId,
        groupId: group.groupId,
        turnNumber: finding.turnNumber,
        rule: finding.rule,
        severity: finding.severity,
        detail: finding.detail,
      });
    }

    for (const judge of group.judgeVerdicts) {
      judgeRows.push({
        persona: group.personaId,
        groupId: group.groupId,
        sessionIndex: judge.sessionIndex,
        judged: judge.judged,
        passed: judge.passed === null ? '' : judge.passed,
        rationale: judge.rationale,
      });
    }
  }

  const sheets: SheetSpec[] = [
    { name: 'Run', rows: runRows },
    { name: 'Summary', rows: summaryRows },
    { name: 'Sessions', rows: sessionRows },
    { name: 'Turns', rows: turnRows },
    { name: 'Findings', rows: findingRows },
    { name: 'Judge', rows: judgeRows },
  ];

  return {
    sheets,
    turnRows: turnRows.length,
    findingRows: findingRows.length,
    judgeRows: judgeRows.length,
  };
}
