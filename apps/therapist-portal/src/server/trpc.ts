import type { PrismaClient } from '@okuvu/prisma';
import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from './rate-limit';

export function isBypassEnabled(): boolean {
  return process.env.LOCAL_DEV_BYPASS_AUTH === 'true';
}

export async function createTRPCContext(opts: { headers: Headers }) {
  const session = isBypassEnabled()
    ? { user: { id: 'mock', email: 'bypass@okuvu.dev', name: 'Bypass' } }
    : await auth();
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

/**
 * Resolves the signed-in therapist exactly once and attaches `therapistId`
 * / `therapistEmail` / a non-null `db` to context. Every procedure that
 * needs "who is the therapist making this call" should build on this
 * instead of re-querying `Therapist.findUnique({ email })` itself — see
 * docs/audit/evia-therapist-portal-audit.md F-08 (this logic used to be
 * duplicated three times across clients.ts and notes.ts).
 */
export const therapistProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.prisma) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
  }
  const db: PrismaClient = ctx.prisma;

  const email = ctx.user.email;
  if (!email) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No email on session' });
  }

  const therapist = await db.therapist.findUnique({ where: { email } });

  if (!therapist) {
    if (isBypassEnabled()) {
      return next({
        ctx: { ...ctx, db, therapistId: 'th_bypass_mock', therapistEmail: email },
      });
    }
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Therapist not found' });
  }

  return next({
    ctx: { ...ctx, db, therapistId: therapist.id, therapistEmail: email },
  });
});

/**
 * therapistProcedure + a best-effort per-therapist rate limit (F-11).
 * Reserved for mutations — reads (list/detail) are left unlimited since the
 * sidebar and dashboard legitimately re-fetch them on normal navigation.
 */
export const therapistMutation = therapistProcedure.use(({ ctx, next }) => {
  const key = ctx.therapistEmail;
  const allowed = checkRateLimit(key, 20, 60_000);
  if (!allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please wait a moment and try again.',
    });
  }
  return next();
});

/** Throws FORBIDDEN unless the calling therapist is assigned to this client. */
export async function assertClientAssigned(
  db: PrismaClient,
  therapistId: string,
  clientUserId: string,
): Promise<void> {
  if (isBypassEnabled()) {
    return;
  }
  const assignment = await db.therapistClient.findUnique({
    where: {
      therapist_id_client_user_id: {
        therapist_id: therapistId,
        client_user_id: clientUserId,
      },
    },
  });
  if (!assignment) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Client is not assigned to this therapist' });
  }
}

/**
 * Records a therapist's read of a client's clinical data (F-05). Best-effort:
 * a logging failure must never block the read itself, so failures are
 * swallowed after being logged server-side.
 */
export async function logClinicalAccess(
  db: PrismaClient,
  therapistId: string,
  clientUserId: string,
  action: string,
): Promise<void> {
  if (isBypassEnabled()) {
    // The bypass therapist id has no real Therapist row to satisfy the FK.
    return;
  }
  try {
    await db.clinicalAccessLog.create({
      data: { therapist_id: therapistId, client_user_id: clientUserId, action },
    });
  } catch (err) {
    console.error('[ACCESS-LOG] failed to record clinical access', err);
  }
}
