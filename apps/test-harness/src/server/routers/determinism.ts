import { createHash } from 'node:crypto';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { invokeAgent } from '../../lib/agent-adapter';
import { enumerateA8Cells } from '../../lib/a8-state-space';
import { clearRetrievedContext } from '@evia/api/src/lib/retrieved-context-cache';
import { clearToolResult } from '@evia/api/src/lib/tool-result-store';

// TestAgentId, spelled out as a zod enum so it can be used as tRPC input
// validation without re-exporting the type from @evia/shared-types (same
// approach as singleAgent.ts).
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

const DEFAULT_RESTART_SESSION_ID = 'test-harness-determinism-session';

/**
 * Deterministic stringify: sorts object keys recursively so two
 * structurally-identical outputs whose keys happen to be produced in a
 * different order (plausible for LLM-adapter output assembled across
 * multiple async branches) hash the same, not different. Plain
 * `JSON.stringify` preserves insertion order, which would otherwise report
 * a spurious "changed" result for outputs that are actually identical —
 * directly undermining what `runNtimes`/`runAcrossRestarts` exist to test.
 */
function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`,
    );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashOutput(output: unknown): string {
  return createHash('sha256').update(canonicalStringify(output)).digest('hex');
}

export const determinismRouter = router({
  /**
   * TH-S13: enumerate the 15-cell A8 router decision table (5 safety states
   * x 3 governance states, fixed session_count=2/turn_count=2), calling the
   * real production routeTurn and comparing each cell against the verified
   * expected table.
   */
  enumerateA8StateSpace: protectedProcedure.query(() => {
    return enumerateA8Cells();
  }),

  /**
   * Run an agent N times with the same input, hash each run's output, and
   * report how many runs produced an exact (hash) match — a determinism
   * smoke test for agents that are supposed to be pure/deterministic given
   * fixed inputs (e.g. A8), or a variance probe for LLM-backed agents.
   */
  runNtimes: protectedProcedure
    .input(
      z.object({
        agentId: testAgentIdSchema,
        input: z.record(z.string(), z.unknown()).default({}),
        n: z.number().int().min(1).max(50),
      }),
    )
    .mutation(async ({ input }) => {
      const runs: Array<{ output: unknown; hash: string; latencyMs: number }> = [];

      for (let i = 0; i < input.n; i++) {
        const result = await invokeAgent(input.agentId, input.input);
        runs.push({
          output: result.output,
          hash: hashOutput(result.output),
          latencyMs: result.latencyMs,
        });
      }

      const firstHash = runs[0]?.hash;
      const exactMatchCount = runs.filter((r) => r.hash === firstHash).length;

      return { runs, exactMatchCount };
    }),

  /**
   * Run an agent once, clear the in-memory retrieved-context and
   * tool-result caches (apps/api/src/lib/retrieved-context-cache.ts and
   * tool-result-store.ts — both keyed by sessionId, simulating a process
   * restart which drops in-memory state), then run again and compare
   * outputs to check the agent doesn't silently depend on cache state that
   * wouldn't survive a real restart.
   */
  runAcrossRestarts: protectedProcedure
    .input(
      z.object({
        agentId: testAgentIdSchema,
        input: z.record(z.string(), z.unknown()).default({}),
        sessionId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const sessionId = input.sessionId ?? DEFAULT_RESTART_SESSION_ID;

      const beforeResult = await invokeAgent(input.agentId, input.input);

      clearRetrievedContext(sessionId);
      clearToolResult(sessionId);

      const afterResult = await invokeAgent(input.agentId, input.input);

      const before = {
        output: beforeResult.output,
        hash: hashOutput(beforeResult.output),
        latencyMs: beforeResult.latencyMs,
      };
      const after = {
        output: afterResult.output,
        hash: hashOutput(afterResult.output),
        latencyMs: afterResult.latencyMs,
      };

      return { before, after, changed: before.hash !== after.hash };
    }),
});
