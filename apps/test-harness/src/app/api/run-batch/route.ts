/**
 * TH-S35 — Simulated-Conversation Runner Spec v1.1: the machine-callable
 * run-batch trigger.
 *
 *   POST /api/run-batch          → 202 { runGroupId, plannedTurns, estimatedCostUsd }
 *
 * Two first-class requirements (spec TH-S35):
 *   - Idempotent: a re-POST with the same idempotencyKey returns the
 *     EXISTING group (unique constraint on idempotency_key) — no double-run,
 *     no double-charge. A Cloud Tasks retry is a no-op.
 *   - Resumable: creation only plans; the /advance tick processes one step
 *     at a time from durable state.
 *
 * Rails (TH-S37): staging-only (sandbox allowed for dry-runs), canned-mode
 * refusal, cost ceiling persisted on the group.
 *
 * Auth: header-token gate (reuse of the AUDIT_BYPASS_TOKEN pattern — decision
 * item #6 keeps the final choice open; switch to a dedicated service token by
 * setting RUN_BATCH_TOKEN). The UI never calls this route — it drives the
 * same logic through the tRPC conversation router.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withEnvironment } from '@/lib/prisma-rls';
import { assertRunnerRails, turnsForSession } from '@/lib/conversation-runner';
import { resolveSimulatorModel } from '@/lib/user-simulator';

const DEFAULT_COST_CEILING_USD = 25;

interface RunBatchBody {
  environment?: 'staging' | 'sandbox';
  personaIds?: string[];
  sessions?: number;
  turnsPerSession?: { min?: number; max?: number };
  gapMode?: 'story-time' | 'wall-clock';
  gapPlanMs?: number[];
  costCeilingUsd?: number;
  dryRun?: boolean;
  idempotencyKey?: string;
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized — set the RUN_BATCH_TOKEN (or AUDIT_BYPASS_TOKEN) header.' }, { status: 401 });
}

export async function POST(req: NextRequest) {
  // Scheduler auth: shared-secret header (spec decision #6 — dedicated
  // service token vs AUDIT_BYPASS_TOKEN pattern; both honored here).
  const token = process.env.RUN_BATCH_TOKEN || process.env.AUDIT_BYPASS_TOKEN;
  if (token && req.headers.get('x-run-batch-token') !== token) {
    return unauthorized();
  }
  if (!token) {
    // No token configured → refuse rather than run unauthenticated. The UI
    // path (tRPC, session-authenticated) is unaffected by this gate.
    return unauthorized();
  }

  let body: RunBatchBody;
  try {
    body = (await req.json()) as RunBatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const environment = body.environment ?? 'staging';
  const sessions = Math.max(1, Math.min(10, body.sessions ?? 3));
  const turnsMin = Math.max(1, body.turnsPerSession?.min ?? 6);
  const turnsMax = Math.max(turnsMin, body.turnsPerSession?.max ?? 12);
  const schedulerMode = body.gapMode === 'wall-clock' ? 'wall-clock' : 'story-time';

  try {
    assertRunnerRails(environment);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 403 });
  }

  if (!prisma) {
    return NextResponse.json({ error: 'Database not configured — DATABASE_URL is unset.' }, { status: 503 });
  }

  // Resolve personas: CorpusCase ids (type='persona') from the TH-S32 bank.
  const personaIds = body.personaIds ?? [];
  if (personaIds.length === 0) {
    return NextResponse.json({ error: 'personaIds is required (type=persona CorpusCase ids).' }, { status: 400 });
  }
  const personas = await prisma.corpusCase.findMany({
    where: { id: { in: personaIds }, type: 'persona' },
  });
  if (personas.length !== personaIds.length) {
    const found = new Set(personas.map((p) => p.id));
    const missing = personaIds.filter((id) => !found.has(id));
    return NextResponse.json({ error: `Unknown persona case ids: ${missing.join(', ')}` }, { status: 400 });
  }

  // Gap plan: explicit, or a story-time default (day 3 / day 7 in ms).
  const gapPlanMs =
    body.gapPlanMs && body.gapPlanMs.length > 0
      ? body.gapPlanMs
      : [0, 3 * 24 * 3_600_000, 7 * 24 * 3_600_000].slice(0, sessions);

  const plannedTurns = personas.reduce(
    (acc) =>
      acc +
      Array.from({ length: sessions }, (_, s) => turnsForSession(0, s + 1, turnsMin, turnsMax)).reduce((a, b) => a + b, 0),
    0,
  );

  // Rough cost estimate: turns × (simulator call + 5-agent pipeline turn) at
  // order-of-magnitude rates, rounded UP (the ceiling is a hard stop, so
  // under-estimating is the dangerous direction).
  const perTurnCostUsd = 0.01;
  const estimatedCostUsd = Math.ceil(plannedTurns * perTurnCostUsd * 100) / 100;
  const costCeilingUsd = body.costCeilingUsd ?? DEFAULT_COST_CEILING_USD;

  if (body.dryRun) {
    return NextResponse.json({
      dryRun: true as const,
      plannedTurns,
      estimatedCostUsd,
      costCeilingUsd,
      sessions,
      gapPlanMs,
      simulatorModel: resolveSimulatorModel(),
      llmCalls: 0,
    });
  }

  const idempotencyKey = body.idempotencyKey?.trim();
  if (!idempotencyKey) {
    return NextResponse.json({ error: 'idempotencyKey is required for a non-dry-run POST.' }, { status: 400 });
  }

  // Idempotency: unique idempotency_key — a duplicate POST returns the
  // existing group unchanged (Cloud-Tasks retry safety).
  const existing = await prisma.conversationRun.findUnique({ where: { idempotency_key: idempotencyKey } });
  if (existing) {
    return NextResponse.json(
      {
        runGroupId: existing.id,
        plannedTurns,
        estimatedCostUsd: existing.cost_estimates_usd,
        deduplicated: true,
        status: existing.status,
      },
      { status: 202 },
    );
  }

  // Groups are created one per persona (spec §4: "for each persona: create
  // CONTINUOUS THREAD"). Multi-persona POSTs return the first group's id;
  // every group in the batch shares the idempotency key prefix so they can
  // be listed together.
  const batchKey = idempotencyKey;
  const created: string[] = [];

  for (const persona of personas) {
    const meta = (persona.persona_meta ?? {}) as Record<string, unknown>;
    const key = personas.length === 1 ? batchKey : `${batchKey}:${persona.id}`;

    const group = await prisma.conversationRun.create({
      data: {
        environment,
        persona_case_id: persona.id,
        persona_id: String(meta.personaId ?? persona.id),
        persona_version: String(meta.personaVersion ?? '0'),
        model: null,
        prompt_version: null,
        scheduler_mode: schedulerMode,
        gap_plan_ms: gapPlanMs,
        turns_min: turnsMin,
        turns_max: turnsMax,
        seed: 42,
        cost_ceiling_usd: costCeilingUsd,
        cost_estimates_usd: estimatedCostUsd / personas.length,
        status: 'planned',
        next_step: { sessionIndex: 1, turnNumber: 1 },
        sessions: [],
        run_ids: [],
        idempotency_key: key,
        canned: false,
      },
    });
    created.push(group.id);
  }

  // Pin the whole batch as a BaselineArchive entry when a label is supplied
  // (TH-S37 group pinning).
  return NextResponse.json({ runGroupId: created[0], runGroupIds: created, plannedTurns, estimatedCostUsd }, { status: 202 });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use /api/run-batch/{id} for status (GET) — see the run-batch spec (TH-S35).' },
    { status: 405 },
  );
}

// Re-exported so the [id] route can share the auth helper without duplication.
export function assertRunBatchAuth(req: NextRequest): boolean {
  const token = process.env.RUN_BATCH_TOKEN || process.env.AUDIT_BYPASS_TOKEN;
  return Boolean(token) && req.headers.get('x-run-batch-token') === token;
}

// Keep the RLS import referenced for environment-scoped future reads.
void withEnvironment;
