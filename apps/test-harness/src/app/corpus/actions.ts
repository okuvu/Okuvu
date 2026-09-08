'use server';

import { initTRPC } from '@trpc/server';
import { createTRPCContext } from '@/server/trpc';
import { corpusRouter } from '@/server/routers/corpus';
import type { CorpusCaseType, TestEnvironment } from '@okuvu/shared-types';

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// A local `t` instance is sufficient to build a caller factory for
// corpusRouter — it only needs to operate on the router's already-built
// procedures (same pattern used in the router's own tests). corpusRouter is
// intentionally *not* wired into the top-level appRouter/HTTP endpoint yet
// (several sibling stories are registering routers there in parallel; a
// later story wires them all centrally), so this page talks to it directly
// via a server-side caller rather than the tRPC HTTP/react-query client.
const t = initTRPC.context<Context>().create();
const createCaller = t.createCallerFactory(corpusRouter);

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

export async function listCasesAction(input: {
  type?: CorpusCaseType;
  tags?: string[];
  environment: TestEnvironment;
  includeHistory?: boolean;
}) {
  return run(async () => {
    const caller = await getCaller();
    return caller.listCases(input);
  });
}

export async function createCaseAction(input: {
  type: CorpusCaseType;
  input: string;
  expected_output?: string;
  tags: string[];
  data_origin: 'synthetic' | 'paraphrased' | 'real';
  environment: TestEnvironment;
}) {
  return run(async () => {
    const caller = await getCaller();
    return caller.createCase(input);
  });
}

export async function versionCaseAction(input: {
  caseId: string;
  updates: {
    input?: string;
    expectedOutput?: string;
    tags?: string[];
    dataOrigin?: 'synthetic' | 'paraphrased' | 'real';
  };
  environment: TestEnvironment;
}) {
  return run(async () => {
    const caller = await getCaller();
    return caller.versionCase(input);
  });
}

export async function exportPairedComparisonAction(input: { caseIds: string[] }) {
  return run(async () => {
    const caller = await getCaller();
    return caller.exportPairedComparison(input);
  });
}

export async function bulkImportCasesAction(input: {
  environment: TestEnvironment;
  rows: Array<{
    type: string;
    input: string;
    expected_output?: string;
    tags: string[];
    data_origin?: string;
  }>;
}) {
  return run(async () => {
    const caller = await getCaller();
    return caller.bulkImportCases(input);
  });
}

export async function runCaseAction(input: { caseId: string; environment: TestEnvironment }) {
  return run(async () => {
    const caller = await getCaller();
    return caller.runCase(input);
  });
}

export async function listAdjudicationQueueAction(input?: { type?: CorpusCaseType }) {
  return run(async () => {
    const caller = await getCaller();
    return caller.listAdjudicationQueue(input);
  });
}

export async function resolveAdjudicationAction(input: { caseId: string; approved: boolean }) {
  return run(async () => {
    const caller = await getCaller();
    return caller.resolveAdjudication(input);
  });
}

export async function generateVariationsAction(input: {
  seedCaseId: string;
  kinds?: Array<
    'rephrasing' | 'persona_shift' | 'intensity_shift' | 'disguised_crisis' | 'injection' | 'edge_case'
  >;
  environment: TestEnvironment;
}) {
  return run(async () => {
    const caller = await getCaller();
    return caller.generateVariations(input);
  });
}
