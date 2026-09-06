'use server';

import { initTRPC } from '@trpc/server';
import { createTRPCContext } from '@/server/trpc';
import { conversationRouter } from '@/server/routers/conversation';
import type { TestEnvironment } from '@evia/shared-types';
import type { PersonaId } from '@/lib/persona-scripts';

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// Same pattern as apps/test-harness/src/app/corpus/actions.ts: conversationRouter
// is intentionally *not* wired into the top-level appRouter/HTTP endpoint yet
// (per TH-S21's spec, a later story wires routers centrally), so this page
// talks to it directly via a server-side caller rather than the tRPC
// HTTP/react-query client.
const t = initTRPC.context<Context>().create();
const createCaller = t.createCallerFactory(conversationRouter);

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

export async function runPersonaScriptAction(input: {
  personaId: PersonaId;
  environment: TestEnvironment;
}) {
  return run(async () => {
    const caller = await getCaller();
    return caller.runPersonaScript(input);
  });
}

export async function getPerTurnTraceAction(input: { runId: string }) {
  return run(async () => {
    const caller = await getCaller();
    return caller.getPerTurnTrace(input);
  });
}

export async function exportTraceAction(input: { runId: string; format: 'json' | 'csv' }) {
  return run(async () => {
    const caller = await getCaller();
    return caller.exportTrace(input);
  });
}

export async function simulateSessionCloseAction(input: {
  sessionId: string;
  userId: string;
  srsScore?: number;
}) {
  return run(async () => {
    const caller = await getCaller();
    return caller.simulateSessionClose(input);
  });
}
