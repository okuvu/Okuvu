'use server';

import { initTRPC } from '@trpc/server';
import { createTRPCContext } from '@/server/trpc';
import { resultsRouter } from '@/server/routers/results';
import type { TestEnvironment } from '@evia/shared-types';

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
