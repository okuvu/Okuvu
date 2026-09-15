import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { randomInt } from 'node:crypto';
import { protectedProcedure, router } from '../trpc';
import { checkRateLimit } from '../rate-limit';
import { sendInviteEmail } from '@/lib/email';

const CARE_PLANS = ['CP1', 'CP2', 'CP3'] as const;
const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easy to read aloud/type
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function generateInviteCode(): string {
  return Array.from({ length: 8 }, () => INVITE_CODE_CHARS[randomInt(INVITE_CODE_CHARS.length)]).join('');
}

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

  // Therapist-portal wireframes C-07 — dashboard "Resend" for Pending
  // clients. System-wide (across all therapists), lives on the admin
  // page rather than the per-therapist dashboard: resendInvite below is
  // admin-gated (matching the rest of the invite/assignment surface), so
  // this is the one place that already has both clientId AND therapistId
  // for every row without needing to derive "whose dashboard is this."
  listPendingInvites: adminProcedure.query(async ({ ctx }) => {
    const pending = await ctx.db.therapistClient.findMany({
      where: { activated_at: null, ended_at: null },
      orderBy: { created_at: 'desc' },
      select: {
        therapist_id: true,
        client_user_id: true,
        created_at: true,
        therapist: { select: { name: true, email: true } },
        client: { select: { full_name: true, email: true, phone_number: true } },
      },
    });
    return pending
      .filter((p) => p.client.email) // only wizard-created clients have an invite email to resend to
      .map((p) => ({
        therapistId: p.therapist_id,
        clientUserId: p.client_user_id,
        invitedAt: p.created_at.toISOString(),
        therapistLabel: p.therapist.name ?? p.therapist.email,
        clientLabel: p.client.full_name ?? p.client.phone_number,
        clientEmail: p.client.email,
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

  // Therapist-portal wireframes C-01..C-06 — the Add-Client wizard. A
  // second, additive provisioning path alongside assignClient above:
  // this one creates a brand-new client (placeholder User, no
  // firebase_uid yet) and invites them, rather than attaching an
  // already-self-signed-up one. Steps 2 (history)/4 (welcome note +
  // abbreviation)/5 (tools/reminders) are all optional per the wireframe
  // ("fill it now, later, or never") — step 5's tool/reminder setup is
  // deliberately NOT duplicated here; the therapist can add those via the
  // client's own Tools tab once the client exists, using the reminders
  // router's existing create path.
  createClientWithInvite: adminMutation
    .input(
      z.object({
        therapistId: z.string().min(1),
        fullName: z.string().trim().min(1),
        phoneNumber: z.string().trim().min(1),
        email: z.string().trim().email(),
        dateOfBirth: z.string().optional(),
        gender: z.string().trim().optional(),
        presentingIssues: z.array(z.string()).default([]),
        carePlanId: z.enum(CARE_PLANS),
        welcomeNote: z.string().trim().optional(),
        displayAbbreviation: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const therapist = await ctx.db.therapist.findUnique({
        where: { id: input.therapistId },
        select: { id: true, email: true, name: true },
      });
      if (!therapist) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Therapist not found' });
      }

      const existing = await ctx.db.user.findFirst({
        where: { OR: [{ phone_number: input.phoneNumber }, { email: input.email }] },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A client with this phone number or email already exists',
        });
      }

      const inviteCode = generateInviteCode();

      const { client, invite } = await ctx.db.$transaction(async (tx) => {
        const client = await tx.user.create({
          data: {
            phone_number: input.phoneNumber,
            email: input.email,
            full_name: input.fullName,
            date_of_birth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
            gender: input.gender || null,
          },
          select: { id: true },
        });

        await tx.clinicalConfig.create({
          data: {
            user_id: client.id,
            care_plan_id: input.carePlanId,
            assignment_state: 'confirmed',
            presenting_issues: input.presentingIssues,
            welcome_note: input.welcomeNote || null,
            display_abbreviation: input.displayAbbreviation || null,
          },
        });

        await tx.therapistClient.create({
          data: { therapist_id: therapist.id, client_user_id: client.id },
        });

        const invite = await tx.inviteToken.create({
          data: {
            token: inviteCode,
            therapist_id: therapist.id,
            client_user_id: client.id,
            expires_at: new Date(Date.now() + INVITE_TTL_MS),
          },
          select: { token: true },
        });

        return { client, invite };
      });

      const emailResult = await sendInviteEmail({
        to: input.email,
        therapistName: therapist.name ?? therapist.email,
        clientName: input.fullName,
        inviteCode: invite.token,
      });

      return {
        success: true,
        clientId: client.id,
        inviteCode: invite.token,
        emailSent: emailResult.sent,
      };
    }),

  // Dashboard "Resend" for a still-Pending client (wireframes C-07) —
  // regenerates a fresh code (the old one, if any, is simply superseded;
  // InviteToken rows aren't deleted) and re-sends via Brevo.
  resendInvite: adminMutation
    .input(z.object({ clientUserId: z.string().min(1), therapistId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [client, therapist] = await Promise.all([
        ctx.db.user.findUnique({
          where: { id: input.clientUserId },
          select: { email: true, full_name: true },
        }),
        ctx.db.therapist.findUnique({
          where: { id: input.therapistId },
          select: { email: true, name: true },
        }),
      ]);
      if (!client || !client.email) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found or has no email on file' });
      }
      if (!therapist) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Therapist not found' });
      }

      const inviteCode = generateInviteCode();
      await ctx.db.inviteToken.create({
        data: {
          token: inviteCode,
          therapist_id: input.therapistId,
          client_user_id: input.clientUserId,
          expires_at: new Date(Date.now() + INVITE_TTL_MS),
        },
      });

      const emailResult = await sendInviteEmail({
        to: client.email,
        therapistName: therapist.name ?? therapist.email,
        clientName: client.full_name,
        inviteCode,
      });

      return { success: true, inviteCode, emailSent: emailResult.sent };
    }),
});
