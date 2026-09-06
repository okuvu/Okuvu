import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { computeWilsonCI, type WilsonCI } from '../../lib/wilson';
import { estimateSampleCostInr } from '../../lib/pricing';
import { invokeAgent } from '../../lib/agent-adapter';
import { TEST_USER_PREFIX } from '../../lib/mock-context';
import { withEnvironment } from '../../lib/prisma-rls';

/**
 * TH-S15 — Stochastic router: run N>=200 samples of an agent, classify each
 * pass/fail against a target metric, compute a Wilson score CI over the pass
 * count, and gate on the CI's lower bound. Cost is estimated in INR up front
 * and checked against a per-environment monthly budget before any sampling
 * happens.
 */

const testAgentIdSchema = z.enum([
  'A1',
  'A2',
  'A8',
  'A9-pre',
  'A9-post',
  'A10A',
  'A13',
  'A15',
]);

const testEnvironmentSchema = z.enum(['sandbox', 'staging', 'beta']);

// Sensible defaults when the caller doesn't supply expected token counts —
// rough single-turn therapy-agent-call sizes, used only for cost estimation.
const DEFAULT_AVG_INPUT_TOKENS = 200;
const DEFAULT_AVG_OUTPUT_TOKENS = 150;

function estimateTotalCostInr(
  model: string,
  n: number,
  avgInputTokens: number,
  avgOutputTokens: number,
): number {
  return n * estimateSampleCostInr(model, avgInputTokens, avgOutputTokens);
}

export interface BudgetCheckResult {
  allowed: boolean;
  capInr: number | null;
  spentInr: number;
  wouldExceedBy?: number;
}

/**
 * Shared budget-check logic, used both by the `checkBudget` procedure and
 * internally by `runSampling` before it invokes any agent. If no
 * `TestBudget` row exists yet for the environment, we treat that as "no cap
 * configured" (unlimited) rather than erroring — a missing budget row is a
 * setup gap, not a reason to block every test run in an environment nobody
 * has configured a cap for yet.
 */
async function checkBudgetInternal(
  environment: z.infer<typeof testEnvironmentSchema>,
  estimatedCostInr: number,
): Promise<BudgetCheckResult> {
  const budget = await withEnvironment(environment, (tx) => tx.testBudget.findUnique({ where: { environment } }));

  if (!budget) {
    return { allowed: true, capInr: null, spentInr: 0 };
  }

  const projectedSpend = budget.spent_inr + estimatedCostInr;
  const allowed = projectedSpend <= budget.monthly_cap_inr;

  return {
    allowed,
    capInr: budget.monthly_cap_inr,
    spentInr: budget.spent_inr,
    ...(allowed ? {} : { wouldExceedBy: projectedSpend - budget.monthly_cap_inr }),
  };
}

/**
 * Pass/fail classification for a single sample.
 *
 * `targetMetric` is a dot-separated path (e.g. "signal", "safetyState",
 * "fallbackUsed") resolved against the agent's `output` object. The
 * resolved value is treated as pass when it is truthy per plain JS
 * truthiness (non-empty string, non-zero number, true, non-null object,
 * etc.) and fail otherwise (including when the path doesn't resolve, i.e.
 * `undefined`). This is intentionally simple/pragmatic per the story's
 * scope — richer classification (numeric thresholds, deep equality against
 * an expected value, etc.) is out of scope for TH-S15 and can be layered on
 * later without changing this function's signature.
 */
export function classifySample(output: unknown, targetMetric: string): boolean {
  const path = targetMetric.split('.').filter(Boolean);
  let value: unknown = output;
  for (const key of path) {
    if (value === null || typeof value !== 'object') {
      return false;
    }
    value = (value as Record<string, unknown>)[key];
  }
  return Boolean(value);
}

export const stochasticRouter = router({
  computeWilsonCI: protectedProcedure
    .input(
      z.object({
        successes: z.number().int().min(0),
        n: z.number().int().min(1),
      }),
    )
    .query(({ input }): WilsonCI => {
      return computeWilsonCI(input.successes, input.n);
    }),

  estimateCost: protectedProcedure
    .input(
      z.object({
        model: z.string(),
        n: z.number().int().min(1),
        avgInputTokens: z.number().int().min(0).default(DEFAULT_AVG_INPUT_TOKENS),
        avgOutputTokens: z.number().int().min(0).default(DEFAULT_AVG_OUTPUT_TOKENS),
      }),
    )
    .query(({ input }) => {
      const estimatedCostInr = estimateTotalCostInr(
        input.model,
        input.n,
        input.avgInputTokens,
        input.avgOutputTokens,
      );
      return { estimatedCostInr };
    }),

  checkBudget: protectedProcedure
    .input(
      z.object({
        environment: testEnvironmentSchema,
        estimatedCostInr: z.number().min(0),
      }),
    )
    .query(async ({ input }): Promise<BudgetCheckResult> => {
      return checkBudgetInternal(input.environment, input.estimatedCostInr);
    }),

  runSampling: protectedProcedure
    .input(
      z.object({
        agentId: testAgentIdSchema,
        input: z.record(z.string(), z.unknown()).default({}),
        n: z.number().int().min(200, 'n must be at least 200 for a statistically meaningful Wilson CI'),
        targetMetric: z.string().min(1),
        threshold: z.number().min(0).max(1),
        environment: testEnvironmentSchema,
        model: z.string().default('gemini-2.5-flash'),
        avgInputTokens: z.number().int().min(0).default(DEFAULT_AVG_INPUT_TOKENS),
        avgOutputTokens: z.number().int().min(0).default(DEFAULT_AVG_OUTPUT_TOKENS),
      }),
    )
    .mutation(async ({ input }) => {
      const estimatedCostInr = estimateTotalCostInr(
        input.model,
        input.n,
        input.avgInputTokens,
        input.avgOutputTokens,
      );

      const budgetCheck = await checkBudgetInternal(input.environment, estimatedCostInr);
      if (!budgetCheck.allowed) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            `Sampling run refused: estimated cost ₹${estimatedCostInr.toFixed(2)} would push ` +
            `${input.environment} spend to ₹${(budgetCheck.spentInr + estimatedCostInr).toFixed(2)}, ` +
            `exceeding the ₹${budgetCheck.capInr?.toFixed(2)} monthly cap by ` +
            `₹${budgetCheck.wouldExceedBy?.toFixed(2)}.`,
        });
      }

      const results: Array<{
        sampleIndex: number;
        userId: string;
        output: unknown;
        latencyMs: number;
        passed: boolean;
        error?: string;
      }> = [];

      let successCount = 0;

      for (let i = 0; i < input.n; i++) {
        // Fresh synthetic user/session per sample for independence — each
        // sample must not share state with any other sample in the run.
        const userId = `${TEST_USER_PREFIX}${randomUUID()}`;
        try {
          const invocation = await invokeAgent(input.agentId, input.input, { userId });
          const passed = classifySample(invocation.output, input.targetMetric);
          if (passed) successCount++;
          results.push({
            sampleIndex: i,
            userId,
            output: invocation.output,
            latencyMs: invocation.latencyMs,
            passed,
          });
        } catch (err) {
          results.push({
            sampleIndex: i,
            userId,
            output: null,
            latencyMs: 0,
            passed: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const wilsonCI = computeWilsonCI(successCount, input.n);
      const gatePassed = wilsonCI.lower >= input.threshold;

      const run = await withEnvironment(input.environment, (tx) =>
        tx.testRun.create({
          data: {
            environment: input.environment,
            altitude: 1,
            agent: input.agentId,
            status: gatePassed ? 'pass' : 'halt',
            frozen_triple: {
              targetMetric: input.targetMetric,
              threshold: input.threshold,
              model: input.model,
            },
            // `results` entries carry `output: unknown` and an optional
            // `error` field, which don't structurally satisfy Prisma's
            // InputJsonValue index-signature requirement — round-trip through
            // JSON to get a plain, Prisma-safe JSON value.
            results: JSON.parse(
              JSON.stringify({
                samples: results,
                successCount,
                n: input.n,
                wilsonCI,
                estimatedCostInr,
              }),
            ),
            activated_agents: [input.agentId],
            manually_selected_agents: [input.agentId],
            dependency_graph: {},
            completed_at: new Date(),
          },
        }),
      );

      return {
        runId: run.id,
        n: input.n,
        successCount,
        wilsonCI,
        gatePassed,
      };
    }),
});
