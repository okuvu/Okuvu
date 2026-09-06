import { TRPCError } from '@trpc/server';
import { ciRouter } from '@/server/routers/ci';
import { createCallerFactory, createTRPCContext } from '@/server/trpc';

// TH-S27 — dedicated REST-ish endpoint for the `ci` router.
//
// ciRouter is intentionally NOT wired into server/routers/_app.ts (per the
// TH-S27 story spec — that file is left for a follow-up wiring pass), so it
// isn't reachable through the standard /api/trpc/[trpc] catch-all. This
// route calls it directly via a tRPC server-side caller
// (createCallerFactory + createTRPCContext), giving the /ci page and its
// client components a real endpoint to hit today without touching _app.ts.
//
// GET  /api/ci?action=gate-status    -> ciRouter.getGateStatus
// GET  /api/ci?action=halt-failures  -> ciRouter.getHaltFailures
// POST /api/ci                       -> ciRouter.triggerRegression

const createCaller = createCallerFactory(ciRouter);

function errorResponse(error: unknown): Response {
  if (error instanceof TRPCError) {
    const statusMap: Record<string, number> = {
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      PRECONDITION_FAILED: 412,
      INTERNAL_SERVER_ERROR: 500,
    };
    const status = statusMap[error.code] ?? 500;
    return Response.json({ error: error.message, code: error.code }, { status });
  }
  return Response.json(
    { error: error instanceof Error ? error.message : 'Unknown error', code: 'INTERNAL_SERVER_ERROR' },
    { status: 500 },
  );
}

export async function GET(req: Request): Promise<Response> {
  const ctx = await createTRPCContext({ headers: req.headers });
  const caller = createCaller(ctx);
  const action = new URL(req.url).searchParams.get('action');

  try {
    if (action === 'halt-failures') {
      return Response.json(await caller.getHaltFailures());
    }
    return Response.json(await caller.getGateStatus());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request): Promise<Response> {
  const ctx = await createTRPCContext({ headers: req.headers });
  const caller = createCaller(ctx);

  try {
    return Response.json(await caller.triggerRegression());
  } catch (error) {
    return errorResponse(error);
  }
}
