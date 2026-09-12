import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { checkRateLimit } from '../rate-limit';

/**
 * F-07: previously the only way to onboard a therapist or assign a client
 * was a CLI script run against DATABASE_URL directly (scripts/seed-*.ts).
 * This gives the same two operations a first-party, audited UI — gated by
 * an env-configured admin allowlist, since there is no role field on
 * Therapist yet (see docs/audit/evia-therapist-portal-audit.md, §8 "Role
 * model"). Promoting/demoting admins is still an env-var change today;
 * that's an intentionally small surface for a capability this sensitive.
 */
function getAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && getAdminEmails().has(email.toLowerCase()));
}

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isAdminEmail(ctx.user.email)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  if (!ctx.prisma) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
  }
  return next({ ctx: { ...ctx, db: ctx.prisma } });
});

// F-11: onboarding/assignment writes get the same best-effort throttle as
// clinical mutations (see server/rate-limit.ts for the serverless caveat).
const adminMutation = adminProcedure.use(({ ctx, next }) => {
  const key = `admin:${ctx.user.email}`;
  if (!checkRateLimit(key, 20, 60_000)) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please wait a moment and try again.',
    });
  }
  return next();
});

export const adminRouter = router({
  amIAdmin: protectedProcedure.query(({ ctx }) => ({
    isAdmin: isAdminEmail(ctx.user.email),
  })),

  listTherapists: adminProcedure.query(async ({ ctx }) => {
    const therapists = await ctx.db.therapist.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        created_at: true,
        _count: { select: { client_assignments: true } },
      },
    });
    return therapists.map((t) => ({
      id: t.id,
      email: t.email,
      name: t.name,
      createdAt: t.created_at.toISOString(),
      clientCount: t._count.client_assignments,
    }));
  }),

  addTherapist: adminMutation
    .input(
      z.object({
        email: z.string().trim().email(),
        name: z.string().trim().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const therapist = await ctx.db.therapist.upsert({
        where: { email: input.email },
        update: input.name ? { name: input.name } : {},
        create: { email: input.email, name: input.name },
      });
      return { id: therapist.id, email: therapist.email, name: therapist.name };
    }),

  // okuvu-remaining-changes.md — Add-Client flow + consent capture. Captures
  // chat_access_granted and an optional language-mode default at assignment
  // time, since neither had any producer before this. `chatAccessGranted` is
  // an admin/therapist attestation that consent was obtained (e.g. verbally
  // or on an intake form) — there is still no client-facing UI for this, by
  // design (see docs/okuvu-v2.0/05-therapist-portal-spec-v0.4-amendments.md).
  assignClient: adminMutation
    .input(
      z.object({
        therapistId: z.string().min(1),
        clientPhoneNumber: z.string().trim().min(1),
        chatAccessGranted: z.boolean(),
        languageMode: z.enum(['english', 'mirror']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.user.findFirst({
        where: { phone_number: input.clientPhoneNumber },
        select: { id: true },
      });
      if (!client) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No client found with that phone number' });
      }

      const therapist = await ctx.db.therapist.findUnique({
        where: { id: input.therapistId },
        select: { id: true, email: true },
      });
      if (!therapist) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Therapist not found' });
      }

      const existing = await ctx.db.therapistClient.findUnique({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapist.id,
            client_user_id: client.id,
          },
        },
        select: { id: true },
      });

      // `update: {}` is deliberate: re-running this form against an
      // already-assigned client must never silently overwrite (or revoke)
      // previously-recorded consent. Consent is only ever set on first
      // assignment; changing it later needs its own dedicated action.
      await ctx.db.therapistClient.upsert({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapist.id,
            client_user_id: client.id,
          },
        },
        update: {},
        create: {
          therapist_id: therapist.id,
          client_user_id: client.id,
          chat_access_granted: input.chatAccessGranted,
        },
      });

      if (input.languageMode) {
        await ctx.db.user.update({
          where: { id: client.id },
          data: { language_mode: input.languageMode },
        });
      }

      return {
        success: true,
        therapistEmail: therapist.email,
        clientId: client.id,
        wasAlreadyAssigned: Boolean(existing),
      };
    }),
});
