'use server';

import { initTRPC } from '@trpc/server';
import { createTRPCContext } from '@/server/trpc';
import { consentRouter } from '@/server/routers/consent';

/**
 * TH-S31 — local server-action caller for the not-yet-registered
 * `consentRouter`, mirroring `apps/test-harness/src/app/corpus/actions.ts`'s
 * pattern for `corpusRouter` (see that file's comment for the full
 * rationale: several sibling stories are adding routers in parallel, and a
 * later story wires them all into the top-level `appRouter` centrally).
 */
type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create();
const createCaller = t.createCallerFactory(consentRouter);

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

export async function captureConsentAction(input: {
  corpusCaseId?: string;
  userRef: string;
  scope: string;
  expiresAt?: string;
}) {
  return run(async () => {
    const caller = await getCaller();
    return caller.captureConsent(input);
  });
}

export async function getConsentStatusAction(input: { userRef?: string; corpusCaseId?: string }) {
  return run(async () => {
    const caller = await getCaller();
    return caller.getConsentStatus(input);
  });
}
