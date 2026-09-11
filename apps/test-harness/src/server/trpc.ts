import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * Audit-bot bypass — lets an automated script call the API directly (no
 * browser, no Google OAuth) by presenting a shared secret in the
 * `x-audit-token` header. Deliberately NOT a boolean env flag: unlike the
 * removed LOCAL_DEV_BYPASS_AUTH, a bare request to the URL gets nothing —
 * only a request that already has AUDIT_BYPASS_TOKEN authenticates. Set
 * AUDIT_BYPASS_TOKEN to enable; unset (the default) to disable entirely.
 */
function auditBypassSession(headers: Headers) {
  const configuredToken = process.env.AUDIT_BYPASS_TOKEN;
  if (!configuredToken) return null;
  if (headers.get('x-audit-token') !== configuredToken) return null;

  return {
    user: {
      id: 'audit-bot',
      email: 'audit-bot@okuvu.in',
      name: 'Audit Bot',
      role: 'PI' as const,
      environments: ['sandbox', 'staging', 'beta'] as const,
    },
  };
}

export async function createTRPCContext(opts: { headers: Headers }) {
  const session = auditBypassSession(opts.headers) ?? (await auth());
  return { session, prisma, ...opts };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;
export type ProtectedContext = Context & { user: NonNullable<Context['session']>['user'] };

const t = initTRPC.context<Context>().create();

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, user: ctx.session.user } });
});

export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const router = t.router;

// TH-S27 — exposed so routers that aren't (yet) wired into _app.ts /
// AppRouter (e.g. ci.ts) can still be invoked server-side via a direct
// caller (see app/api/ci/route.ts), without needing the full HTTP
// fetchRequestHandler + typed react-query client wiring.
export const createCallerFactory = t.createCallerFactory;
