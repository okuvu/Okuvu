import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { invokeAgent } from '../../lib/agent-adapter';
import { buildMockSessionContext, TEST_USER_PREFIX, type MockSessionContext } from '../../lib/mock-context';
import { getAgentSchema } from '../../lib/agent-schemas';

// TestAgentId, spelled out as a zod enum so it can be used as tRPC input
// validation without re-exporting the type from @okuvu/shared-types.
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

// Partial mock-context overrides. Deliberately loose (each field optional,
// unknown-shaped nested values left to the adapter) — validation/merging
// against mock-context.ts defaults happens in agent-adapter.ts, not here.
const mockContextOverridesSchema = z
  .object({
    userId: z.string().optional(),
    message: z.string().optional(),
    safetyState: z.enum(['S0', 'S1', 'S2', 'S3', 'S4']).optional(),
    governanceState: z.enum(['Active', 'Restricted', 'Blocked']).optional(),
    carePlan: z.enum(['CP1', 'CP2', 'CP3']).optional(),
    sessionCount: z.number().optional(),
    turnNumber: z.number().optional(),
    sessionHistorySummary: z.string().nullable().optional(),
    perceivedIntensity: z.number().nullable().optional(),
    recentHistory: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
      .optional(),
    sessionSummary: z.string().nullable().optional(),
    toolResultContext: z.string().optional(),
    userMemoryContext: z.string().nullable().optional(),
    retrievedContext: z.string().nullable().optional(),
  })
  .partial();

export const singleAgentRouter = router({
  /**
   * Invoke a single therapy-pipeline agent in isolation with a mocked
   * session context. `input` is per-agent shaped (validated/merged against
   * mock-context.ts defaults inside agent-adapter.ts, not by zod here,
   * since each agent's input shape differs).
   */
  invokeAgent: protectedProcedure
    .input(
      z.object({
        agentId: testAgentIdSchema,
        input: z.record(z.string(), z.unknown()).default({}),
        contextOverrides: mockContextOverridesSchema.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await invokeAgent(
          input.agentId,
          input.input,
          input.contextOverrides ?? {},
        );
        return result;
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : `Agent invocation failed: ${String(err)}`,
        });
      }
    }),

  /**
   * Create/reuse a synthetic `test-user-*` Prisma User row (mirroring the
   * `load-test-vu-` bypass precedent in
   * apps/api/src/lib/session-handler.ts) and return the mock session
   * context bundle, merged with any overrides. Never touches Redis —
   * everything here is in-memory or via this synthetic Prisma row.
   */
  mockSessionContext: protectedProcedure
    .input(
      z.object({
        overrides: mockContextOverridesSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.prisma) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database not configured',
        });
      }

      const context: MockSessionContext = buildMockSessionContext(input.overrides ?? {});
      const firebaseUid = context.userId.startsWith(TEST_USER_PREFIX)
        ? context.userId
        : `${TEST_USER_PREFIX}${context.userId}`;

      const user = await ctx.prisma.user.upsert({
        where: { firebase_uid: firebaseUid },
        update: {},
        create: {
          firebase_uid: firebaseUid,
          phone_number: '+10000000000',
        },
      });

      return {
        ...context,
        userId: user.id,
        firebaseUid: user.firebase_uid,
      };
    }),

  /**
   * JSON-serializable description of an agent's expected input fields, so
   * the UI can render a dynamic form. Hand-written lookup table, fully
   * functional for A2 per acceptance criteria; other agents get a shorter
   * schema.
   */
  getAgentSchema: protectedProcedure
    .input(z.object({ agentId: testAgentIdSchema }))
    .query(({ input }) => getAgentSchema(input.agentId)),
});
