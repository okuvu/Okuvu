import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/routers/_app';
import { createTRPCContext } from '@/server/trpc';

// Default Vercel serverless timeout (10s) is too short for procedures that
// run multiple sequential real LLM calls — e.g. conversation.runPersonaScript
// (up to 5 turns) or the Simulator's "Run all scenarios" battery (4 of those
// in parallel). 60s was enough under canned-mode/degraded-fallback latency
// (14-38s for a full battery run) but not under real Bedrock latency
// (~18s/turn observed live) — a 5-turn script alone can exceed 90s.
// Confirmed live: 60 produced a hard FUNCTION_INVOCATION_TIMEOUT on the
// 5-turn "anxious" persona once real model calls were wired up. 300s is
// Vercel's documented serverless ceiling for this plan tier.
export const maxDuration = 300;

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
  });

export { handler as GET, handler as POST };
