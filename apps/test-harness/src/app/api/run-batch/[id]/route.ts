/**
 * TH-S35 — status + advance endpoints for one run-batch group.
 *
 *   GET  /api/run-batch/{id}        → { status, progress, costSoFar, resultsRef }
 *   POST /api/run-batch/{id}/advance → process the next due step (idempotent)
 *
 * The advance tick reconstructs the runner state from durable
 * ConversationRun columns (spec: "Any tick reconstructs exactly where the
 * thread left off, purely from durable ConversationRun state. A crash
 * mid-run loses at most one turn.") — the group row IS the state machine:
 * status/next_step/sessions/run_ids are read and written back after each
 * single step. Idempotency of the tick itself: an advance on a group whose
 * status is not 'planned'/'running' returns the current state unchanged;
 * a step whose outcome was already persisted (run_ids contains the step's
 * marker) is not re-executed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@okuvu/prisma';
import { prisma } from '@/lib/prisma';
import {
  advanceRunStep,
  initializeRunState,
  reconstructStateFromRuns,
  type ConversationRunnerOptions,
  type ConversationRunnerState,
  type SessionRecord,
} from '@/lib/conversation-runner';

type RouteContext = { params: Promise<{ id: string }> };

function authorized(req: NextRequest): boolean {
  const token = process.env.RUN_BATCH_TOKEN || process.env.AUDIT_BYPASS_TOKEN;
  if (!token) return false;
  return req.headers.get('x-run-batch-token') === token;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!prisma) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });

  const group = await prisma.conversationRun.findUnique({ where: { id } });
  if (!group) {
    return NextResponse.json({ error: `No run-batch group '${id}'` }, { status: 404 });
  }

  const sessions = (group.sessions ?? []) as unknown as SessionRecord[];
  const totalTurns = sessions.reduce((acc, s) => acc + s.turnsCompleted, 0);

  return NextResponse.json({
    id: group.id,
    status: group.status,
    progress: {
      sessionsCompleted: sessions.filter((s) => s.summaryWritten).length,
      sessionsPlanned: group.gap_plan_ms.length,
      turnsCompleted: totalTurns,
      turnRollup: sessions.map((s) => ({ index: s.index, turnsCompleted: s.turnsCompleted, turnsPlanned: s.turnsPlanned })),
    },
    costSoFar: group.cost_so_far_usd,
    costCeilingUsd: group.cost_ceiling_usd,
    costEstimateUsd: group.cost_estimates_usd,
    nextStep: group.next_step,
    resultsRef: { runIds: group.run_ids, count: group.run_ids.length },
  });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized — set the RUN_BATCH_TOKEN header.' }, { status: 401 });
  }
  if (!prisma) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });

  const group = await prisma.conversationRun.findUnique({ where: { id } });
  if (!group) {
    return NextResponse.json({ error: `No run-batch group '${id}'` }, { status: 404 });
  }

  // Idempotent tick: a finished/failed group never re-advances.
  if (group.status !== 'planned' && group.status !== 'running') {
    return NextResponse.json({
      stepped: false,
      done: true,
      status: group.status,
      note: `Group is '${group.status}' — advance is a no-op (idempotent tick).`,
    });
  }

  const personaCase = await prisma.corpusCase.findUnique({ where: { id: group.persona_case_id } });
  if (!personaCase) {
    return NextResponse.json({ error: `Persona case '${group.persona_case_id}' vanished — cannot advance.` }, { status: 410 });
  }

  const meta = (personaCase.persona_meta ?? {}) as Record<string, unknown>;
  const options: ConversationRunnerOptions = {
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

  // Reconstruct the state machine from durable columns. The session-boundary
  // fields live in next_step; the per-session rollup in sessions.
  let state: ConversationRunnerState;
  const sessionsStored = (group.sessions ?? []) as unknown as SessionRecord[];
  const nextStep = (group.next_step ?? { sessionIndex: 1, turnNumber: 1 }) as {
    sessionIndex: number;
    turnNumber: number;
  };

  if (sessionsStored.length === 0 || !group.started_at) {
    // First tick: create the synthetic thread + session 1.
    state = await initializeRunState(options);
    state.costSoFarUsd = group.cost_so_far_usd;
    state.status = 'running';
  } else {
    state = await reconstructStateFromRuns(group.run_ids, sessionsStored, nextStep, options);
    state.costSoFarUsd = group.cost_so_far_usd;
  }

  // Advance exactly ONE step.
  const step = await advanceRunStep(options, state);

  // Persist the (possibly advanced) state back to the durable columns.
  const updated = await prisma.conversationRun.update({
    where: { id: group.id },
    data: {
      status: state.status === 'running' ? 'running' : state.status,
      sessions: JSON.parse(JSON.stringify(state.sessions)),
      run_ids: { push: step.runIds },
      cost_so_far_usd: state.costSoFarUsd,
      started_at: group.started_at ?? new Date(),
      completed_at: state.status === 'complete' ? new Date() : null,
      next_step:
        state.status === 'running'
          ? JSON.parse(JSON.stringify({ sessionIndex: state.sessionIndex, turnNumber: state.turnInSession }))
          : Prisma.JsonNull,
    },
  });

  return NextResponse.json({
    stepped: step.stepped,
    done: step.done,
    status: updated.status,
    nextStep: updated.next_step,
    turnsCompleted: state.sessions.reduce((acc, s) => acc + s.turnsCompleted, 0),
    incompleteReason: state.incompleteReason,
    newRunIds: step.runIds,
  });
}

function extractSeedTurns(turns: unknown): string[] {
  if (!Array.isArray(turns)) return [];
  return turns
    .map((t) => (t && typeof t === 'object' && typeof (t as { text?: unknown }).text === 'string' ? (t as { text: string }).text : null))
    .filter((t): t is string => t !== null);
}
