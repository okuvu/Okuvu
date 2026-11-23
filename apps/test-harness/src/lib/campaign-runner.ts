/**
 * TH-S38 — the /campaign execution path.
 *
 * Everything here is server-side: it drives the SAME resumable state machine
 * the machine-triggered `/api/run-batch/{id}` tick drives (`advanceRunStep`),
 * one step per call, reading and writing the same durable columns. The UI never
 * calls that service-token route; the campaign router calls these functions.
 *
 * The one addition over the batch route is grading: when a group reaches a
 * terminal status, its sessions are judged against the persona's
 * `expectedBehavior` (one judge call per session, only when the campaign has
 * the judge on and the environment is not sandbox) and the verdicts are
 * written to `ConversationRun.judge_verdicts`. Verdict IDs are evidence: a
 * re-read of the campaign never re-spends on the judge.
 */

import type { PrismaClient } from '@okuvu/prisma';
import { prisma } from './prisma';
import {
  advanceRunStep,
  initializeRunState,
  reconstructStateFromRuns,
  type ConversationRunnerOptions,
  type ConversationRunnerState,
  type SessionRecord,
} from './conversation-runner';
import { judgeReply } from './judge';
import type { PerTurnTrace } from './trace-export';
import type { GroupEvidence, JudgeVerdictRecord } from './campaign-verdict';

export class CampaignError extends Error {}

function requireDb(): PrismaClient {
  if (!prisma) throw new CampaignError('Database not configured — DATABASE_URL is unset.');
  return prisma;
}

function extractSeedTurns(turns: unknown): string[] {
  if (!Array.isArray(turns)) return [];
  return turns
    .map((turn) =>
      turn && typeof turn === 'object' && typeof (turn as { text?: unknown }).text === 'string'
        ? (turn as { text: string }).text
        : null,
    )
    .filter((text): text is string => text !== null);
}

type GroupRow = {
  id: string;
  environment: string;
  persona_case_id: string;
  scheduler_mode: string;
  gap_plan_ms: number[];
  turns_min: number;
  turns_max: number;
  seed: number;
  cost_ceiling_usd: number;
  cost_so_far_usd: number;
  status: string;
  next_step: unknown;
  sessions: unknown;
  run_ids: string[];
  campaign_id: string | null;
  judge_verdicts: unknown;
  incomplete_reason: string | null;
  started_at: Date | null;
};

function runnerOptionsFromGroup(group: GroupRow, personaCase: { id: string; persona_meta: unknown; turns: unknown }): ConversationRunnerOptions {
  const meta = (personaCase.persona_meta ?? {}) as Record<string, unknown>;
  return {
    environment: group.environment === 'sandbox' ? 'sandbox' : 'staging',
    persona: {
      caseId: personaCase.id,
      personaId: String(meta.personaId ?? personaCase.id),
      personaVersion: String(meta.personaVersion ?? '0'),
      meta,
      seedTurns: extractSeedTurns(personaCase.turns),
    },
    plan: {
      sessions: group.gap_plan_ms.length,
      turnsPerSession: { min: group.turns_min, max: group.turns_max },
      gapPlanMs: group.gap_plan_ms,
    },
    schedulerMode: group.scheduler_mode === 'wall-clock' ? 'wall-clock' : 'story-time',
    seed: group.seed,
    costCeilingUsd: group.cost_ceiling_usd,
  };
}

export interface AdvanceGroupOutcome {
  groupId: string;
  personaId: string;
  stepped: boolean;
  done: boolean;
  groupStatus: string;
  turnsCompleted: number;
  costSoFarUsd: number;
  incompleteReason: string | null;
  newRunIds: string[];
  /** True when this tick graded the group (terminal + judge enabled + rubric). */
  graded: boolean;
}

const TERMINAL = new Set(['complete', 'incomplete', 'halt']);

/**
 * Advance ONE group by exactly one step (one turn, or a session close).
 * Idempotent: a terminal group returns immediately, and the step's state is
 * reconstructed from durable columns, so a crash loses at most one turn.
 */
export async function advanceCampaignGroup(groupId: string): Promise<AdvanceGroupOutcome> {
  const db = requireDb();
  const group = (await db.conversationRun.findUnique({ where: { id: groupId } })) as GroupRow | null;
  if (!group) throw new CampaignError(`No run group '${groupId}'.`);

  const personaCase = await db.corpusCase.findUnique({ where: { id: group.persona_case_id } });
  if (!personaCase) throw new CampaignError(`Persona case '${group.persona_case_id}' vanished — cannot advance.`);

  if (TERMINAL.has(group.status)) {
    return {
      groupId: group.id,
      personaId: String((personaCase.persona_meta as { personaId?: string } | null)?.personaId ?? group.persona_case_id),
      stepped: false,
      done: true,
      groupStatus: group.status,
      turnsCompleted: ((group.sessions ?? []) as SessionRecord[]).reduce((total, session) => total + session.turnsCompleted, 0),
      costSoFarUsd: group.cost_so_far_usd,
      incompleteReason: null,
      newRunIds: [],
      graded: false,
    };
  }

  const options = runnerOptionsFromGroup(group, personaCase);

  let state: ConversationRunnerState;
  const sessionsStored = (group.sessions ?? []) as SessionRecord[];
  const nextStep = (group.next_step ?? { sessionIndex: 1, turnNumber: 1 }) as {
    sessionIndex: number;
    turnNumber: number;
  };

  if (sessionsStored.length === 0 || !group.started_at) {
    state = await initializeRunState(options);
    state.costSoFarUsd = group.cost_so_far_usd;
    state.status = 'running';
  } else {
    state = await reconstructStateFromRuns(group.run_ids, sessionsStored, nextStep, options);
    state.costSoFarUsd = group.cost_so_far_usd;
  }

  const step = await advanceRunStep(options, state);

  const updated = await db.conversationRun.update({
    where: { id: group.id },
    data: {
      status: state.status,
      sessions: JSON.parse(JSON.stringify(state.sessions)),
      run_ids: { push: step.runIds },
      cost_so_far_usd: state.costSoFarUsd,
      started_at: group.started_at ?? new Date(),
      completed_at: state.status === 'complete' ? new Date() : null,
      incomplete_reason: state.incompleteReason,
      next_step:
        state.status === 'running'
          ? JSON.parse(JSON.stringify({ sessionIndex: state.sessionIndex, turnNumber: state.turnInSession }))
          : null,
    },
  });

  let graded = false;
  if (TERMINAL.has(state.status)) {
    graded = await gradeGroup(updated.id);
    await refreshCampaignStatus(group.campaign_id);
  }

  return {
    groupId: group.id,
    personaId: options.persona.personaId,
    stepped: step.stepped,
    done: state.status !== 'running',
    groupStatus: state.status,
    turnsCompleted: state.sessions.reduce((total, session) => total + session.turnsCompleted, 0),
    costSoFarUsd: state.costSoFarUsd,
    incompleteReason: state.incompleteReason,
    newRunIds: step.runIds,
    graded,
  };
}

/**
 * Judge one terminal group's sessions against the persona rubric and persist
 * the verdicts. Runs at most once per group: an existing non-empty
 * `judge_verdicts` array is left alone, so re-reading a campaign never
 * re-spends on the judge. A sandbox run is never judged — its replies are
 * canned, and grading them would produce a verdict about nothing.
 */
export async function gradeGroup(groupId: string): Promise<boolean> {
  const db = requireDb();
  const group = await db.conversationRun.findUnique({ where: { id: groupId } });
  if (!group) return false;

  const existing = (group.judge_verdicts ?? []) as unknown as JudgeVerdictRecord[];
  if (existing.length > 0) return false;
  if (group.environment === 'sandbox') return false;

  const campaign = group.campaign_id
    ? await db.campaign.findUnique({ where: { id: group.campaign_id } })
    : null;
  if (campaign && !campaign.judge_enabled) return false;

  const personaCase = await db.corpusCase.findUnique({ where: { id: group.persona_case_id } });
  const rubric = personaCase?.expected_output?.trim();
  if (!rubric) return false;

  const history = await loadTurns(group.run_ids);
  if (history.length === 0) return false;

  const lastReplyBySession = new Map<number, PerTurnTrace>();
  for (const turn of history) {
    if (turn.trace.response) lastReplyBySession.set(turn.sessionIndex, turn.trace);
  }

  const verdicts: JudgeVerdictRecord[] = [];
  for (const [sessionIndex, turn] of [...lastReplyBySession.entries()].sort((a, b) => a[0] - b[0])) {
    const judged = await judgeReply({
      caseType: 'persona',
      reply: turn.response ?? '',
      expectedOutput: rubric,
    });
    verdicts.push({
      sessionIndex,
      judged: judged.judged,
      passed: judged.passed,
      rationale: judged.rationale,
    });
  }

  await db.conversationRun.update({
    where: { id: groupId },
    data: { judge_verdicts: JSON.parse(JSON.stringify(verdicts)) },
  });
  return verdicts.length > 0;
}

interface LoadedTurn {
  sessionIndex: number;
  trace: PerTurnTrace;
}

/**
 * Rebuild a group's ordered turns from the per-turn TestRun rows it owns.
 * Session-close rows carry no new turn and are skipped. Ordering uses the
 * trace's own numbering (`(session-1)*1000 + turn`), not row creation order,
 * so a retried tick cannot interleave two histories.
 */
async function loadTurns(runIds: string[]): Promise<LoadedTurn[]> {
  if (runIds.length === 0) return [];
  const db = requireDb();
  const rows = await db.testRun.findMany({
    where: { id: { in: runIds } },
    select: { results: true },
  });

  const turns: LoadedTurn[] = [];
  for (const row of rows) {
    const results = row.results as
      | { turns?: PerTurnTrace[]; sessionIndex?: number; sessionClose?: boolean }
      | null;
    if (!results || results.sessionClose) continue;
    const trace = results.turns?.[0];
    if (!trace) continue;
    turns.push({ sessionIndex: results.sessionIndex ?? 1, trace });
  }
  turns.sort((a, b) => a.trace.turnNumber - b.trace.turnNumber);
  return turns;
}

/** Assemble the pure verdict input for one group (no model calls). */
export async function loadGroupEvidence(groupId: string): Promise<{
  evidence: GroupEvidence;
  turns: LoadedTurn[];
  costSoFarUsd: number;
  personaId: string;
  personaVersion: string;
} | null> {
  const db = requireDb();
  const group = await db.conversationRun.findUnique({ where: { id: groupId } });
  if (!group) return null;

  const personaCase = await db.corpusCase.findUnique({ where: { id: group.persona_case_id } });
  const campaign = group.campaign_id
    ? await db.campaign.findUnique({ where: { id: group.campaign_id } })
    : null;

  const turns = await loadTurns(group.run_ids);
  const sessions = ((group.sessions ?? []) as unknown as SessionRecord[]).map((session) => ({
    index: session.index,
    continuity: session.continuity ?? {},
  }));

  return {
    evidence: {
      environment: group.environment,
      groupStatus: group.status,
      incompleteReason: group.incomplete_reason ?? null,
      cannedLeak: group.canned && group.environment !== 'sandbox',
      sessions,
      turns: turns.map((turn) => turn.trace),
      judgeVerdicts: (group.judge_verdicts ?? []) as unknown as JudgeVerdictRecord[],
      rubricPresent: Boolean(personaCase?.expected_output?.trim()),
      judgeEnabled: campaign ? campaign.judge_enabled : true,
    },
    turns,
    costSoFarUsd: group.cost_so_far_usd,
    personaId: group.persona_id,
    personaVersion: group.persona_version,
  };
}

/** Recompute and persist the campaign's rollup status from its groups. */
export async function refreshCampaignStatus(campaignId: string | null): Promise<string | null> {
  if (!campaignId) return null;
  const db = requireDb();
  const groups = await db.conversationRun.findMany({
    where: { campaign_id: campaignId },
    select: { status: true },
  });
  const statuses = groups.map((group) => group.status);

  const { rollupCampaignStatus } = await import('./campaign-verdict');
  const status = rollupCampaignStatus(statuses);
  await db.campaign.update({ where: { id: campaignId }, data: { status } });
  return status;
}

/** The next group in a campaign that still has steps to run, or null. */
export async function nextRunnableGroup(campaignId: string): Promise<string | null> {
  const db = requireDb();
  const group = await db.conversationRun.findFirst({
    where: { campaign_id: campaignId, status: { in: ['planned', 'running'] } },
    orderBy: { created_at: 'asc' },
    select: { id: true },
  });
  return group?.id ?? null;
}
