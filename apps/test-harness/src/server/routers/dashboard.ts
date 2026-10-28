import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { withEnvironment } from '../../lib/prisma-rls';
import { resolveProvider } from '@okuvu/api/src/lib/generate-content';

const environmentSchema = z.enum(['sandbox', 'staging', 'beta']);

/**
 * "Current prod config" side of the config-drift comparison.
 *
 * apps/test-harness cannot read apps/api's live runtime env in a
 * serverless/separate-deploy setup, so this is a deliberately simple v1
 * (config-drift alerting is explicitly deferred per the sprint ADR — this
 * dashboard banner is read-only, no alerting infra).
 *
 * Keep these in sync with apps/api's lib/generate-content.ts dispatcher:
 *   - LLM_PROVIDER env var (bedrock | openrouter)
 *   - BEDROCK_MODEL_ID (default 'amazon.nova-pro-v1:0') / OPENROUTER_MODEL
 *     (default 'meta-llama/llama-3.1-8b-instruct'), whichever is active
 *   - hardcoded `temperature: 0.7` in both providers' default generationConfig
 */
// Widened to `string` on purpose: the provider union belongs to apps/api and
// narrows over time, and this banner must keep compiling against whichever
// backends that module currently supports.
const PROD_PROVIDER: string = resolveProvider();
const PROD_MODEL_VERSION =
  PROD_PROVIDER === 'bedrock'
    ? (process.env.BEDROCK_MODEL_ID ?? 'qwen.qwen3-32b-v1:0')
    : (process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.1-8b-instruct');
const PROD_TEMPERATURE = 0.7;

export const dashboardRouter = router({
  getOverview: protectedProcedure
    .input(z.object({ environment: environmentSchema }))
    .query(async ({ input }) => {
      const { environment } = input;

      const [statusGroups, mostRecentRun, recentRuns, gateSignOffs, latestPin] = await withEnvironment(
        environment,
        (tx) =>
          Promise.all([
            tx.testRun.groupBy({
              by: ['status'],
              where: { environment },
              _count: { _all: true },
            }),
            tx.testRun.findFirst({
              where: { environment },
              orderBy: { created_at: 'desc' },
              select: { created_at: true },
            }),
            tx.testRun.findMany({
              where: { environment },
              orderBy: { created_at: 'desc' },
              take: 10,
              select: {
                id: true,
                status: true,
                agent: true,
                created_at: true,
                altitude: true,
              },
            }),
            tx.gateSignOff.findMany({
              where: { environment },
              orderBy: { signed_at: 'desc' },
            }),
            tx.modelConfigPin.findFirst({
              where: { environment },
              orderBy: { created_at: 'desc' },
            }),
          ]),
      );

      const statusCounts: Record<string, number> = {};
      for (const group of statusGroups) {
        statusCounts[group.status] = group._count._all;
      }

      const gateMap = new Map<
        string,
        {
          gate: string;
          approvedCount: number;
          rejectedCount: number;
          mostRecentDecision: {
            decision: 'APPROVED' | 'REJECTED';
            signed_by: string;
            signed_at: Date;
          } | null;
        }
      >();
      for (const signOff of gateSignOffs) {
        let entry = gateMap.get(signOff.gate);
        if (!entry) {
          entry = {
            gate: signOff.gate,
            approvedCount: 0,
            rejectedCount: 0,
            mostRecentDecision: null,
          };
          gateMap.set(signOff.gate, entry);
        }
        if (signOff.decision === 'APPROVED') entry.approvedCount += 1;
        if (signOff.decision === 'REJECTED') entry.rejectedCount += 1;
        // gateSignOffs is ordered by signed_at desc, so the first one seen
        // per gate is the most recent.
        if (!entry.mostRecentDecision) {
          entry.mostRecentDecision = {
            decision: signOff.decision,
            signed_by: signOff.signed_by,
            signed_at: signOff.signed_at,
          };
        }
      }

      const configDrift = latestPin
        ? {
            hasPin: true as const,
            drifted:
              latestPin.model_version !== PROD_MODEL_VERSION ||
              latestPin.provider !== PROD_PROVIDER ||
              latestPin.temperature !== PROD_TEMPERATURE,
            prod: { provider: PROD_PROVIDER, modelVersion: PROD_MODEL_VERSION, temperature: PROD_TEMPERATURE },
            pinned: {
              provider: latestPin.provider,
              modelVersion: latestPin.model_version,
              temperature: latestPin.temperature,
              pinnedBy: latestPin.pinned_by,
              createdAt: latestPin.created_at,
            },
          }
        : {
            hasPin: false as const,
            drifted: false,
            prod: { provider: PROD_PROVIDER, modelVersion: PROD_MODEL_VERSION, temperature: PROD_TEMPERATURE },
            pinned: null,
          };

      const totalRuns = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

      return {
        environment,
        envStatus: {
          totalRuns,
          statusCounts,
          mostRecentRunAt: mostRecentRun?.created_at ?? null,
        },
        recentRuns,
        gateSummary: Array.from(gateMap.values()),
        configDrift,
      };
    }),

  signOffGate: protectedProcedure
    .input(
      z.object({
        gate: z.string().min(1),
        environment: environmentSchema,
        run_id: z.string().optional(),
        decision: z.enum(['APPROVED', 'REJECTED']),
        evidence: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'PI') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only PI role may sign off gates',
        });
      }
      if (!ctx.user.email) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Signing user has no email on record',
        });
      }

      // Gate sign-offs are append-only: every decision is recorded as a new
      // row, never mutated. This immutability is the core acceptance
      // criterion for this story — do not add update/upsert here.
      return withEnvironment(input.environment, (tx) =>
        tx.gateSignOff.create({
          data: {
            gate: input.gate,
            environment: input.environment,
            run_id: input.run_id,
            decision: input.decision,
            evidence: input.evidence,
            signed_by: ctx.user.email as string,
          },
        }),
      );
    }),
});
