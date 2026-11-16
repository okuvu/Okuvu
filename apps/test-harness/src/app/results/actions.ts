'use server';

import { initTRPC } from '@trpc/server';
import { createTRPCContext } from '@/server/trpc';
import { resultsRouter } from '@/server/routers/results';
import { resultsExportRouter } from '@/server/routers/results-export';
import type { TestEnvironment } from '@okuvu/shared-types';

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// resultsRouter is intentionally *not* wired into the top-level appRouter
// yet (per TH-S25's scope — several sibling stories are registering routers
// there in parallel, and a later story does that centrally; see
// apps/test-harness/src/app/corpus/actions.ts for the identical pattern
// used by TH-S-corpus's page). This page talks to it via a server-side
// caller instead of the tRPC HTTP/react-query client.
const t = initTRPC.context<Context>().create();
const createCaller = t.createCallerFactory(resultsRouter);

async function getCaller() {
  const ctx = await createTRPCContext({ headers: new Headers() });
  return createCaller(ctx);
}

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function listRunsAction(input: { environment?: TestEnvironment }) {
  return run(async () => {
    const caller = await getCaller();
    return caller.listRuns(input);
  });
}

export async function archiveRunAction(input: { runId: string }) {
  return run(async () => {
    const caller = await getCaller();
    return caller.archiveRun(input);
  });
}

export async function getRunAction(input: { runId: string }) {
  return run(async () => {
    const caller = await getCaller();
    return caller.getRun(input);
  });
}

export async function compareRunsAction(input: { runIdA: string; runIdB: string }) {
  return run(async () => {
    const caller = await getCaller();
    return caller.compareRuns(input);
  });
}

export async function getAuditArtifactAction(input: { runId: string }) {
  return run(async () => {
    const caller = await getCaller();
    return caller.getAuditArtifact(input);
  });
}

/**
 * Bulk `.xlsx` of stored `TestRun` rows (Summary / Turns / Sessions). Thin
 * wrapper over `results-export.ts`, which already owned the workbook builder
 * but had no caller in the UI — the export existed and was unreachable.
 *
 * `environment` is optional: omitted means every environment, which is what
 * the screen shows when no filter is picked.
 */
export async function exportRunsXlsxAction(input: { environment?: TestEnvironment }) {
  return run(async () => {
    const ctx = await createTRPCContext({ headers: new Headers() });
    const caller = t.createCallerFactory(resultsExportRouter)(ctx);
    const result = await caller.exportRuns({ environment: input.environment, dryRun: false });
    // `dryRun` is typed as a boolean, so the router's return type stays a union
    // even though this call always asks for the workbook. Narrow it here rather
    // than letting every caller re-check the discriminant.
    if (result.dryRun) {
      throw new Error('Export returned a dry-run row count instead of a workbook.');
    }
    return result;
  });
}

/** Row count only, for the confirmation line before generating a workbook. */
export async function countExportRunsAction(input: { environment?: TestEnvironment }) {
  return run(async () => {
    const ctx = await createTRPCContext({ headers: new Headers() });
    const caller = t.createCallerFactory(resultsExportRouter)(ctx);
    return caller.exportRuns({ environment: input.environment, dryRun: true });
  });
}
