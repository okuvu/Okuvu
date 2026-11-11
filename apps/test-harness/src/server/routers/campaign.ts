/**
 * TH-S38 — the `campaign` router behind the /campaign screen.
 *
 * This is the UI's path to the simulated-conversation runner. It deliberately
 * does NOT call `/api/run-batch` (that route is service-token gated and states
 * that the UI must not use it); it calls the same library functions directly,
 * one resumable step at a time.
 *
 * Procedures, in the order the screen uses them:
 *   listPersonas   — the persona bank, summarised for the picker
 *   importPersonas — write uploaded sheet rows into the bank (per-row errors)
 *   estimate       — dry-run: planned turns, cost, and every start blocker.
 *                    Zero model calls, zero writes.
 *   start          — freeze the plan on a Campaign row + one group per persona
 *   advance        — run the next step(s); grading happens on the final step
 *   get            — campaign + one verdict row per conversation (no model calls)
 *   transcript     — one conversation's turns, annotated with quality findings
 *   list           — recent campaigns
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@okuvu/prisma';
import { protectedProcedure, router } from '../trpc';
import { personaMetaFromRow, seedTurnsFromRow } from '@/lib/persona-sheet';
import { campaignBlockers, canStart, estimateCampaign, gapPlanFor } from '@/lib/campaign-plan';
import { foldGroupVerdict, type GroupVerdict } from '@/lib/campaign-verdict';
import {
  advanceCampaignGroup,
  loadGroupEvidence,
  nextRunnableGroup,
  refreshCampaignStatus,
} from '@/lib/campaign-runner';
import { getWorkerUrl } from '@/lib/worker-health';
import { isCannedRunActive } from '@/lib/canned-mode';
import { resolveSimulatorModel, simulatorIsCanned } from '@/lib/user-simulator';

function requirePrisma(client: PrismaClient | null): PrismaClient {
  if (!client) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured — DATABASE_URL is unset.' });
  }
  return client;
}

const paramsSchema = z
  .object({
    environment: z.enum(['sandbox', 'staging']),
    target: z.enum(['in-process', 'live-websocket']).default('in-process'),
    sessions: z.number().int().min(1).max(10).default(3),
    turnsMin: z.number().int().min(1).max(40).default(6),
    turnsMax: z.number().int().min(1).max(40).default(12),
    gapPreset: z.enum(['immediate', 'day3-day7', 'weekly']).default('day3-day7'),
    seed: z.number().int().min(0).max(2_147_483_647).default(42),
    judgeEnabled: z.boolean().default(true),
    costCeilingUsd: z.number().min(0.01).max(1_000).default(25),
    personaIds: z.array(z.string().min(1)).default([]),
  })
  .refine((value) => value.turnsMax >= value.turnsMin, {
    message: 'turnsMax must be greater than or equal to turnsMin',
    path: ['turnsMax'],
  });

type CampaignParams = z.infer<typeof paramsSchema>;

const personaRowSchema = z.object({
  personaId: z.string().min(1),
  personaVersion: z.string().min(1).default('1'),
  expectedBehavior: z.string().nullable().optional(),
  demographics: z.string().nullable().optional(),
  profile: z.string().nullable().optional(),
  trajectory: z.enum(['stable', 'escalating', 'de-escalating']).nullable().optional(),
  goals: z.array(z.string()).default([]),
  secrets: z.array(z.string()).default([]),
  openerStyle: z.string().nullable().optional(),
  sampleStarters: z.array(z.string()).default([]),
  continuityCues: z
    .union([
      z.array(z.string()),
      z.object({ stable: z.array(z.string()).default([]), temporary: z.array(z.string()).default([]) }),
    ])
    .nullable()
    .optional(),
  determinismRules: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

type PersonaRowInput = z.infer<typeof personaRowSchema>;

const personaSummarySelect = {
  id: true,
  version: true,
  input: true,
  expected_output: true,
  tags: true,
  persona_meta: true,
  turns: true,
  created_at: true,
} as const;

function summarisePersona(row: {
  id: string;
  version: number;
  input: string;
  expected_output: string | null;
  tags: string[];
  persona_meta: unknown;
  turns: unknown;
  created_at: Date;
}) {
  const meta = (row.persona_meta ?? {}) as Record<string, unknown>;
  return {
    caseId: row.id,
    personaId: String(meta.personaId ?? row.input ?? row.id),
    personaVersion: String(meta.personaVersion ?? '0'),
    version: row.version,
    tags: row.tags,
    profile: typeof meta.profile === 'string' ? meta.profile : null,
    trajectory: typeof meta.trajectory === 'string' ? meta.trajectory : null,
    expectedBehavior: row.expected_output,
    hasRubric: Boolean(row.expected_output?.trim()),
    turnsCount: Array.isArray(row.turns) ? row.turns.length : 0,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Resolve the selected personas, the estimate, and every blocker, against the
 * same inputs `start` will re-check. Shared so a green preview and a working
 * Start can never disagree.
 */
async function buildPlan(db: PrismaClient, input: CampaignParams) {
  if (input.personaIds.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Select at least one persona.' });
  }

  const personaRows = await db.corpusCase.findMany({
    where: { id: { in: input.personaIds }, type: 'persona' },
    select: personaSummarySelect,
  });
  const found = new Set(personaRows.map((row) => row.id));
  const missing = input.personaIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown persona case id(s): ${missing.join(', ')}` });
  }

  const estimate = estimateCampaign({
    personaCount: personaRows.length,
    sessions: input.sessions,
    turnsMin: input.turnsMin,
    turnsMax: input.turnsMax,
    seed: input.seed,
    judgeEnabled: input.judgeEnabled,
    costCeilingUsd: input.costCeilingUsd,
  });

  let simulatorModel: string | null = null;
  let simulatorModelError: string | null = null;
  try {
    simulatorModel = resolveSimulatorModel();
  } catch (err) {
    simulatorModelError = err instanceof Error ? err.message : String(err);
  }

  const blockers = campaignBlockers({
    environment: input.environment,
    target: input.target,
    personaCount: personaRows.length,
    rubricMissing: personaRows.filter((row) => !row.expected_output?.trim()).length,
    estimate,
    workerConfigured: Boolean(getWorkerUrl()),
    cannedAmbient: isCannedRunActive(),
    simulatorModelError,
    simulatorCanned: simulatorIsCanned(),
  });

  return {
    personas: personaRows.map(summarisePersona),
    estimate,
    blockers,
    canStart: canStart(blockers),
    simulatorModel,
    gapPlanMs: gapPlanFor(input.sessions, input.gapPreset),
  };
}

/** One results row as the screen consumes it. */
interface CampaignResultRow extends GroupVerdict {
  groupId: string;
  personaId: string;
  personaVersion: string;
  personaCaseId: string;
  groupStatus: string;
  turnsCompleted: number;
  sessionsCompleted: number;
  costSoFarUsd: number;
  incompleteReason: string | null;
  judgeVerdicts: { sessionIndex: number; judged: boolean; passed: boolean | null; rationale: string }[];
}

async function collectResults(db: PrismaClient, campaignId: string): Promise<CampaignResultRow[]> {
  const groups = await db.conversationRun.findMany({
    where: { campaign_id: campaignId },
    orderBy: { created_at: 'asc' },
    select: { id: true, persona_case_id: true, status: true, incomplete_reason: true },
  });

  const rows: CampaignResultRow[] = [];
  for (const group of groups) {
    const loaded = await loadGroupEvidence(group.id);
    if (!loaded) continue;
    const verdict = foldGroupVerdict(loaded.evidence);
    rows.push({
      ...verdict,
      groupId: group.id,
      personaId: loaded.personaId,
      personaVersion: loaded.personaVersion,
      personaCaseId: group.persona_case_id,
      groupStatus: group.status,
      turnsCompleted: loaded.turns.length,
      sessionsCompleted: loaded.evidence.sessions.filter(
        (session) => session.continuity?.C1 === 'pass' || session.continuity?.C1 === 'fail',
      ).length,
      costSoFarUsd: loaded.costSoFarUsd,
      incompleteReason: group.incomplete_reason ?? null,
      judgeVerdicts: loaded.evidence.judgeVerdicts,
    });
  }
  return rows;
}

export const campaignRouter = router({
  /** The persona bank: latest version of every type='persona' case. */
  listPersonas: protectedProcedure.query(async ({ ctx }) => {
    const db = requirePrisma(ctx.prisma);

    const [rows, superseded] = await Promise.all([
      db.corpusCase.findMany({
        where: { type: 'persona' },
        orderBy: { created_at: 'desc' },
        select: personaSummarySelect,
      }),
      db.corpusCase.findMany({ where: { supersedes_id: { not: null } }, select: { supersedes_id: true } }),
    ]);
    const supersededIds = new Set(superseded.map((row) => row.supersedes_id).filter((id): id is string => Boolean(id)));

    return rows.filter((row) => !supersededIds.has(row.id)).map(summarisePersona);
  }),

  /**
   * Import persona sheet rows. Each row is validated independently: one bad
   * row never blocks the batch. A row whose personaId already exists at the
   * same version is rejected (it would duplicate the picker); a row with a
   * different version supersedes the existing one, so the bank shows one
   * current persona per id.
   */
  importPersonas: protectedProcedure
    .input(
      z.object({
        rows: z.array(personaRowSchema).min(1),
        tags: z.array(z.string()).default([]),
        /**
         * Testing-page behaviour: re-uploading a sheet must run, not be
         * rejected. With `replaceExisting`, an existing id at the same version
         * is superseded by the uploaded row instead of refused — the bank still
         * shows one current persona per id, and the old case row stays as
         * history behind `supersedes_id`.
         */
        replaceExisting: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = requirePrisma(ctx.prisma);

      const created: { caseId: string; personaId: string; personaVersion: string }[] = [];
      const rejected: { row: number; personaId: string; reason: string }[] = [];

      for (let index = 0; index < input.rows.length; index++) {
        const row = input.rows[index] as PersonaRowInput;

        const existing = await db.corpusCase.findFirst({
          where: { type: 'persona', persona_meta: { path: ['personaId'], equals: row.personaId } },
          orderBy: { created_at: 'desc' },
        });

        if (existing && !input.replaceExisting) {
          const existingMeta = (existing.persona_meta ?? {}) as { personaVersion?: string };
          if (String(existingMeta.personaVersion ?? '0') === row.personaVersion) {
            rejected.push({
              row: index + 1,
              personaId: row.personaId,
              reason: `already in the bank at version ${row.personaVersion} — bump personaVersion to import a change`,
            });
            continue;
          }
        }

        const personaMeta = personaMetaFromRow({
          personaId: row.personaId,
          personaVersion: row.personaVersion,
          demographics: row.demographics ?? null,
          profile: row.profile ?? null,
          trajectory: row.trajectory ?? null,
          goals: row.goals,
          secrets: row.secrets,
          openerStyle: row.openerStyle ?? null,
          sampleStarters: row.sampleStarters,
          continuityCues: row.continuityCues ?? null,
          determinismRules: row.determinismRules,
        });
        const tags = Array.from(new Set(['persona-bank', 'campaign-upload', ...input.tags, ...row.tags]));

        const saved = await db.corpusCase.create({
          data: {
            type: 'persona',
            input: row.profile ?? row.personaId,
            expected_output: row.expectedBehavior?.trim() || undefined,
            tags,
            data_origin: 'synthetic',
            turns: JSON.parse(JSON.stringify(seedTurnsFromRow({ sampleStarters: row.sampleStarters }))),
            persona_meta: JSON.parse(JSON.stringify(personaMeta)),
            supersedes_id: existing?.id ?? undefined,
          },
        });

        created.push({ caseId: saved.id, personaId: row.personaId, personaVersion: row.personaVersion });
      }

      return { created, rejected };
    }),

  /** Dry run: planned turns, cost estimate, and every start blocker. No writes. */
  estimate: protectedProcedure.input(paramsSchema).query(async ({ ctx, input }) => {
    const db = requirePrisma(ctx.prisma);
    return buildPlan(db, input);
  }),

  /** Freeze the plan on a Campaign row and create one run group per persona. */
  start: protectedProcedure
    .input(paramsSchema.extend({ label: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const db = requirePrisma(ctx.prisma);
      const plan = await buildPlan(db, input);
      if (!plan.canStart) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: plan.blockers.find((blocker) => blocker.severity === 'block')?.message ?? 'Campaign cannot start.',
        });
      }

      const campaign = await db.campaign.create({
        data: {
          label: input.label,
          environment: input.environment,
          target: input.target,
          personas: JSON.parse(
            JSON.stringify(
              plan.personas.map((persona) => ({
                caseId: persona.caseId,
                personaId: persona.personaId,
                personaVersion: persona.personaVersion,
                expectedBehavior: persona.expectedBehavior,
              })),
            ),
          ),
          sessions: input.sessions,
          turns_min: input.turnsMin,
          turns_max: input.turnsMax,
          gap_plan_ms: plan.gapPlanMs,
          scheduler_mode: 'story-time',
          seed: input.seed,
          language_mode: 'english',
          judge_enabled: input.judgeEnabled,
          cost_ceiling_usd: input.costCeilingUsd,
          cost_estimates_usd: plan.estimate.totalUsd,
          planned_turns: plan.estimate.plannedTurns,
          status: 'planned',
          created_by: ctx.user.email ?? ctx.user.id,
        },
      });

      const perPersonaEstimate = plan.estimate.totalUsd / Math.max(1, plan.personas.length);

      for (const persona of plan.personas) {
        await db.conversationRun.create({
          data: {
            environment: input.environment,
            persona_case_id: persona.caseId,
            persona_id: persona.personaId,
            persona_version: persona.personaVersion,
            model: null,
            prompt_version: null,
            scheduler_mode: 'story-time',
            gap_plan_ms: plan.gapPlanMs,
            turns_min: input.turnsMin,
            turns_max: input.turnsMax,
            seed: input.seed,
            cost_ceiling_usd: input.costCeilingUsd,
            cost_estimates_usd: perPersonaEstimate,
            status: 'planned',
            next_step: { sessionIndex: 1, turnNumber: 1 },
            sessions: [],
            run_ids: [],
            idempotency_key: `campaign:${campaign.id}:${persona.caseId}`,
            canned: false,
            campaign_id: campaign.id,
            judge_verdicts: [],
          },
        });
      }

      return {
        campaignId: campaign.id,
        personaCount: plan.personas.length,
        plannedTurns: plan.estimate.plannedTurns,
        estimate: plan.estimate,
        warnings: plan.blockers.filter((blocker) => blocker.severity === 'warn'),
      };
    }),

  /**
   * Run the next step(s). One step = one turn or one session close, so the
   * screen can show progress and stop. Grading happens on the terminal step.
   */
  advance: protectedProcedure
    .input(z.object({ campaignId: z.string().min(1), steps: z.number().int().min(1).max(5).default(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = requirePrisma(ctx.prisma);

      const campaign = await db.campaign.findUnique({ where: { id: input.campaignId } });
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: `No campaign '${input.campaignId}'.` });

      const outcomes = [];
      for (let step = 0; step < input.steps; step++) {
        const groupId = await nextRunnableGroup(input.campaignId);
        if (!groupId) break;
        outcomes.push(await advanceCampaignGroup(groupId));
      }

      const status = await refreshCampaignStatus(input.campaignId);
      const remaining = await db.conversationRun.count({
        where: { campaign_id: input.campaignId, status: { in: ['planned', 'running'] } },
      });

      return { outcomes, status, remaining, done: remaining === 0 };
    }),

  /** Campaign + one verdict row per conversation. Read-only: no model calls. */
  get: protectedProcedure
    .input(z.object({ campaignId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = requirePrisma(ctx.prisma);

      const campaign = await db.campaign.findUnique({ where: { id: input.campaignId } });
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: `No campaign '${input.campaignId}'.` });

      const results = await collectResults(db, input.campaignId);
      const counts: Record<string, number> = {};
      for (const row of results) counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;

      return {
        campaign: {
          id: campaign.id,
          label: campaign.label,
          environment: campaign.environment,
          target: campaign.target,
          status: campaign.status,
          sessions: campaign.sessions,
          turnsMin: campaign.turns_min,
          turnsMax: campaign.turns_max,
          gapPlanMs: campaign.gap_plan_ms,
          schedulerMode: campaign.scheduler_mode,
          seed: campaign.seed,
          languageMode: campaign.language_mode,
          judgeEnabled: campaign.judge_enabled,
          costCeilingUsd: campaign.cost_ceiling_usd,
          costEstimateUsd: campaign.cost_estimates_usd,
          plannedTurns: campaign.planned_turns,
          createdBy: campaign.created_by,
          createdAt: campaign.created_at.toISOString(),
        },
        results,
        counts,
      };
    }),

  /** One conversation's turns with the deterministic quality findings attached. */
  transcript: protectedProcedure
    .input(z.object({ groupId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      requirePrisma(ctx.prisma);
      const loaded = await loadGroupEvidence(input.groupId);
      if (!loaded) throw new TRPCError({ code: 'NOT_FOUND', message: `No run group '${input.groupId}'.` });

      const verdict = foldGroupVerdict(loaded.evidence);
      return {
        verdict: verdict.verdict,
        code: verdict.code,
        reason: verdict.reason,
        findings: verdict.findings,
        checks: verdict.checks,
        judgeVerdicts: loaded.evidence.judgeVerdicts,
        turns: loaded.turns.map(({ sessionIndex, trace }) => ({
          sessionIndex,
          turnNumber: trace.turnNumber,
          message: trace.message,
          response: trace.response,
          resultType: trace.resultType,
          safetyState: trace.safetyState,
          fallbackUsed: trace.fallbackUsed,
          latencyMs: trace.latencyMs,
          invariantViolations: trace.invariantViolations?.length ?? 0,
          findings: verdict.findings.filter((finding) => finding.turnNumber === trace.turnNumber),
        })),
      };
    }),

  /** Recent campaigns, with how far each has got. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = requirePrisma(ctx.prisma);
    const campaigns = await db.campaign.findMany({ orderBy: { created_at: 'desc' }, take: 25 });

    const withCounts = [];
    for (const campaign of campaigns) {
      const groups = await db.conversationRun.findMany({
        where: { campaign_id: campaign.id },
        select: { status: true },
      });
      withCounts.push({
        id: campaign.id,
        label: campaign.label,
        environment: campaign.environment,
        target: campaign.target,
        status: campaign.status,
        personaCount: groups.length,
        running: groups.filter((group) => group.status === 'planned' || group.status === 'running').length,
        createdAt: campaign.created_at.toISOString(),
      });
    }
    return withCounts;
  }),
});
