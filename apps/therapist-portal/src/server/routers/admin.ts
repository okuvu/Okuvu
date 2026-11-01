import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { randomInt } from 'node:crypto';
import { protectedProcedure, router } from '../trpc';
import { checkRateLimit } from '../rate-limit';
import { sendInviteEmail } from '@/lib/email';
import { hashInviteToken } from '@/lib/invite-token-hash';
import { isAdminEmail } from '@/lib/admin-allowlist';
import { maskPhone } from '@/lib/format';

const CARE_PLANS = ['CP1', 'CP2', 'CP3'] as const;
const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easy to read aloud/type
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Mirrors AddClientWizard.tsx's ISSUE_OPTIONS — the only values the wizard
// can actually send, but the backend shouldn't take that on faith.
const PRESENTING_ISSUES = ['Anxiety', 'Low mood', 'Stress', 'Sleep', 'Grief'] as const;
const MAX_NAME_LENGTH = 200;
const MAX_GENDER_LENGTH = 100;
const MAX_WELCOME_NOTE_LENGTH = 2000;
const MAX_DISPLAY_ABBREVIATION_LENGTH = 50;
const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

function generateInviteCode(): string {
  return Array.from({ length: 8 }, () => INVITE_CODE_CHARS[randomInt(INVITE_CODE_CHARS.length)]).join('');
}

/**
 * F-07: previously the only way to onboard a therapist or assign a client
 * was a CLI script run against DATABASE_URL directly (scripts/seed-*.ts).
 * This gives the same two operations a first-party, audited UI — gated by
 * the env-configured admin allowlist, since there is no role field on
 * Therapist yet (see docs/audit/evia-therapist-portal-audit.md, §8 "Role
 * model"). Promoting/demoting admins is still an env-var change today;
 * that's an intentionally small surface for a capability this sensitive.
 *
 * The allowlist itself now lives in `lib/admin-allowlist.ts`, because
 * `lib/auth.ts` has to ask the same question: admin@okuvu.in is an operator
 * account, not a therapist row, so without a shared answer it could sign in
 * successfully and then be rejected by every procedure on this page.
 */
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

  // ── Beta console: read-only views ────────────────────────────────────
  //
  // Everything below is derived from tables that already exist. Nothing is
  // estimated and nothing is presented as money, because no billing code
  // exists yet (see docs/product/admin-console-spec.md §7): `paymentsStatus`
  // is the one procedure that will change shape when billing lands, and it
  // is the only place the console asks about payin/payout.
  //
  // Deliberately no conversation content here. An operator can see that a
  // client talked this week and how much; reading *what* they said needs the
  // break-glass path on the clinical side, not a business dashboard. That is
  // the line the console exists to hold.

  overview: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

    const [
      therapistCount,
      clientCount,
      activeAssignments,
      pendingAssignments,
      upcomingAppointments,
      heldAppointments,
      moodCheckinsWeek,
      conversationsWeek,
      crisisFlaggedWeek,
      waitlistCount,
      lastConversation,
    ] = await Promise.all([
      ctx.db.therapist.count(),
      ctx.db.user.count({ where: { deleted_at: null } }),
      ctx.db.therapistClient.count({ where: { ended_at: null, activated_at: { not: null } } }),
      ctx.db.therapistClient.count({ where: { ended_at: null, activated_at: null } }),
      ctx.db.appointment.count({
        where: { cancelled_at: null, scheduled_at: { gte: now, lte: weekAhead } },
      }),
      ctx.db.appointment.count({ where: { cancelled_at: null, scheduled_at: { lt: now } } }),
      ctx.db.moodLog.count({ where: { created_at: { gte: weekAgo } } }),
      ctx.db.sessionLog.count({ where: { session_started_at: { gte: weekAgo } } }),
      ctx.db.sessionLog.count({
        where: { session_started_at: { gte: weekAgo }, crisis_flag_detected: true },
      }),
      ctx.db.waitlistEntry.count(),
      ctx.db.sessionLog.findFirst({
        orderBy: { session_started_at: 'desc' },
        select: { session_started_at: true },
      }),
    ]);

    return {
      therapistCount,
      clientCount,
      activeAssignments,
      pendingAssignments,
      upcomingAppointments,
      heldAppointments,
      moodCheckinsWeek,
      conversationsWeek,
      crisisFlaggedWeek,
      waitlistCount,
      lastConversationAt: lastConversation?.session_started_at.toISOString() ?? null,
      generatedAt: now.toISOString(),
    };
  }),

  // One row per client, with the therapist(s) currently holding them. This is
  // the "users and their mapping" view the operator asked for; `listAssignments`
  // is the same data pivoted the other way, one row per pairing, so an ended
  // or duplicated mapping is visible instead of being collapsed away.
  listClients: adminProcedure
    .input(z.object({ search: z.string().trim().max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const search = input?.search?.trim();
      const clients = await ctx.db.user.findMany({
        where: {
          deleted_at: null,
          ...(search
            ? {
                OR: [
                  { full_name: { contains: search, mode: 'insensitive' as const } },
                  { email: { contains: search, mode: 'insensitive' as const } },
                  { phone_number: { contains: search } },
                ],
              }
            : {}),
        },
        orderBy: { created_at: 'desc' },
        take: 200,
        select: {
          id: true,
          full_name: true,
          email: true,
          phone_number: true,
          created_at: true,
          language_mode: true,
          clinical_config: { select: { care_plan_id: true, assignment_state: true } },
          assigned_therapists: {
            select: {
              activated_at: true,
              ended_at: true,
              chat_access_granted: true,
              therapist: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });

      return clients.map((c) => {
        const current = c.assigned_therapists.filter((a) => a.ended_at === null);
        return {
          id: c.id,
          name: c.full_name,
          email: c.email,
          phoneMasked: maskPhone(c.phone_number),
          joinedAt: c.created_at.toISOString(),
          languageMode: c.language_mode,
          carePlan: c.clinical_config?.care_plan_id ?? null,
          assignmentState: c.clinical_config?.assignment_state ?? null,
          therapists: current.map((a) => ({
            id: a.therapist.id,
            label: a.therapist.name ?? a.therapist.email,
            activated: a.activated_at !== null,
            chatAccess: a.chat_access_granted,
          })),
          therapyState:
            current.length === 0
              ? ('unassigned' as const)
              : current.some((a) => a.activated_at !== null)
                ? ('active' as const)
                : ('invited' as const),
        };
      });
    }),

  listAssignments: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.therapistClient.findMany({
      orderBy: { created_at: 'desc' },
      take: 500,
      select: {
        id: true,
        created_at: true,
        activated_at: true,
        ended_at: true,
        chat_access_granted: true,
        therapist: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, full_name: true, email: true, phone_number: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      therapistId: row.therapist.id,
      therapistLabel: row.therapist.name ?? row.therapist.email,
      clientId: row.client.id,
      clientLabel: row.client.full_name ?? maskPhone(row.client.phone_number),
      clientEmail: row.client.email,
      createdAt: row.created_at.toISOString(),
      activatedAt: row.activated_at?.toISOString() ?? null,
      endedAt: row.ended_at?.toISOString() ?? null,
      chatAccess: row.chat_access_granted,
      state: row.ended_at
        ? ('ended' as const)
        : row.activated_at
          ? ('active' as const)
          : ('invited' as const),
    }));
  }),

  // "How is therapy progressing" without reading anyone's conversation: how
  // much a client has engaged, when they were last heard from, and how many
  // appointments actually happened. Aggregate counts only — no turn text.
  listProgress: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

    const [clients, turnStats, recentTurnStats, moodStats, sessionStats, appointmentStats] =
      await Promise.all([
        ctx.db.user.findMany({
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          take: 200,
          select: { id: true, full_name: true, email: true, phone_number: true },
        }),
        ctx.db.turn.groupBy({
          by: ['user_id'],
          _count: { _all: true },
          _max: { created_at: true },
        }),
        ctx.db.turn.groupBy({
          by: ['user_id'],
          where: { created_at: { gte: weekAgo } },
          _count: { _all: true },
        }),
        ctx.db.moodLog.groupBy({
          by: ['user_id'],
          _count: { _all: true },
          _max: { date_ist: true },
        }),
        ctx.db.sessionLog.groupBy({
          by: ['user_id'],
          _count: { _all: true },
          _max: { session_started_at: true },
        }),
        ctx.db.appointment.groupBy({
          by: ['client_user_id'],
          where: { cancelled_at: null },
          _count: { _all: true },
        }),
      ]);

    const turns = new Map(turnStats.map((t) => [t.user_id, t]));
    const recentTurns = new Map(recentTurnStats.map((t) => [t.user_id, t._count._all]));
    const moods = new Map(moodStats.map((m) => [m.user_id, m]));
    const sessions = new Map(sessionStats.map((s) => [s.user_id, s]));
    const appointments = new Map(appointmentStats.map((a) => [a.client_user_id, a._count._all]));

    return clients.map((c) => {
      const turn = turns.get(c.id);
      const mood = moods.get(c.id);
      const session = sessions.get(c.id);
      const lastActivityAt = [turn?._max.created_at, session?._max.session_started_at]
        .filter((d): d is Date => Boolean(d))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        id: c.id,
        name: c.full_name,
        email: c.email,
        phoneMasked: maskPhone(c.phone_number),
        totalTurns: turn?._count._all ?? 0,
        turnsThisWeek: recentTurns.get(c.id) ?? 0,
        conversations: session?._count._all ?? 0,
        moodCheckins: mood?._count._all ?? 0,
        lastMoodDate: mood?._max.date_ist?.toISOString() ?? null,
        appointments: appointments.get(c.id) ?? 0,
        lastActivityAt: lastActivityAt?.toISOString() ?? null,
      };
    });
  }),

  // Money, honestly. There is no Payment table, no gateway, no invoice and no
  // therapist payout run in this repo — so this returns the shape the console
  // needs to render "not enabled" together with the one number that is real
  // and would later become billable: appointments that already happened.
  // It must never return a zero that reads as "revenue was ₹0 this month".
  paymentsStatus: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const [heldAppointments, upcomingAppointments] = await Promise.all([
      ctx.db.appointment.count({ where: { cancelled_at: null, scheduled_at: { lt: now } } }),
      ctx.db.appointment.count({ where: { cancelled_at: null, scheduled_at: { gte: now } } }),
    ]);
    return {
      enabled: false as const,
      reason:
        'No billing code exists in this build. Pay-in, pay-out, invoices and therapist settlement are not implemented, so the console shows no amounts rather than placeholder figures.',
      heldAppointments,
      upcomingAppointments,
      payIn: null,
      payOut: null,
    };
  }),

  // The landing page's only call to action. Visible here because a waitlist
  // nobody reads is a promise the page should not make.
  listWaitlist: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.waitlistEntry.findMany({
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      phone: row.phone_number,
      createdAt: row.created_at.toISOString(),
    }));
  }),

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
      // Normalise on write. `Therapist.email` is compared against whatever
      // Google hands back, and an address typed into /admin as `Name@Gmail.com`
      // used to create a row that no sign-in could ever match (the symptom is
      // the generic "not set up yet" bounce, with nothing in the logs to say
      // why). Matching is also case-insensitive on read now, so either half
      // alone would be enough — both, because rows written before this are
      // already in the table.
      const email = input.email.trim().toLowerCase();
      const existing = await ctx.db.therapist.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      });
      const therapist = existing
        ? await ctx.db.therapist.update({
            where: { id: existing.id },
            data: { email, ...(input.name ? { name: input.name } : {}) },
          })
        : await ctx.db.therapist.create({ data: { email, name: input.name } });
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
        clientPhoneNumber: z.string().trim().regex(PHONE_REGEX, 'clientPhoneNumber must be in E.164 format (e.g. +1234567890)'),
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
        // The operator reaches this form with a number off an intake sheet, so
        // "No client found" alone leaves them guessing whether the number is
        // wrong or the person simply has not signed up. Name the number and the
        // one path that does work for someone who has not installed the app.
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No client found with ${input.clientPhoneNumber} — nobody has signed up with that number yet. Check it, or use "Invite a new client" to create them and send an invite.`,
        });
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
  // auth_subject yet) and invites them, rather than attaching an
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
        fullName: z.string().trim().min(1).max(MAX_NAME_LENGTH),
        phoneNumber: z.string().trim().regex(PHONE_REGEX, 'phoneNumber must be in E.164 format (e.g. +1234567890)'),
        email: z.string().trim().email(),
        dateOfBirth: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), {
          message: 'dateOfBirth must be a valid date',
        }).optional(),
        gender: z.string().trim().max(MAX_GENDER_LENGTH).optional(),
        presentingIssues: z.array(z.enum(PRESENTING_ISSUES)).default([]),
        carePlanId: z.enum(CARE_PLANS),
        welcomeNote: z.string().trim().max(MAX_WELCOME_NOTE_LENGTH).optional(),
        displayAbbreviation: z.string().trim().max(MAX_DISPLAY_ABBREVIATION_LENGTH).optional(),
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

      const { client } = await ctx.db.$transaction(async (tx) => {
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

        await tx.inviteToken.create({
          data: {
            token_hash: hashInviteToken(inviteCode),
            therapist_id: therapist.id,
            client_user_id: client.id,
            expires_at: new Date(Date.now() + INVITE_TTL_MS),
          },
        });

        return { client };
      });

      const emailResult = await sendInviteEmail({
        to: input.email,
        therapistName: therapist.name ?? therapist.email,
        clientName: input.fullName,
        inviteCode,
      });

      return {
        success: true,
        clientId: client.id,
        inviteCode,
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
          token_hash: hashInviteToken(inviteCode),
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

  // ── Removing a client ─────────────────────────────────────────────────
  //
  // The console's only destructive action, and the one operation that used to
  // mean an in-VPC psql session against private RDS
  // (`scripts/in-vpc-db-task.sh`). Every other mutation in this router is
  // additive, so "take that person off the list" needed an engineer for what
  // is everyday cleanup.
  //
  // A real delete, not a `deleted_at` stamp. `listClients`/`overview` already
  // filter tombstoned rows, so a stamp looks identical in the console while
  // leaving the name, the email and every clinical row in the table — the
  // operator has no way to tell "hidden" from "gone", and the two differ for a
  // data-subject erasure request (DPDP Act 2023 §12).
  //
  // Every relation to `User` is `onDelete: Cascade` (migration
  // 20261029120000_deletion_cascade_on_user), so the FK graph goes with the
  // `user.delete`. The three tables that reference a subject by a bare string
  // rather than by FK — GovernanceLog (session_id), BetaConsent (user_ref),
  // WaitlistEntry (email/phone) — are swept explicitly first, because the
  // database cascade cannot reach them. `apps/api/src/lib/account.ts` defines
  // the same subject for the client-initiated erasure path; the console test
  // parses schema.prisma so a relation that later stops cascading fails the
  // build instead of silently surviving a removal.
  //
  // Deliberately NOT touched: the `Therapist` row. One address, two identity
  // surfaces — a clinician who also has a client account keeps portal access,
  // and nothing here can take a therapist's sign-in away as a side effect.
  removeClient: adminMutation
    .input(z.object({ clientUserId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.user.findUnique({
        where: { id: input.clientUserId },
        select: { id: true, email: true, phone_number: true, full_name: true, auth_subject: true },
      });
      if (!client) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No client with that id' });
      }

      // Same precondition as the client-initiated erasure path: an ended
      // session is a finished record, an open one is still being written, and
      // deleting it mid-conversation would leave the app holding a session id
      // whose rows no longer exist.
      const openSession = await ctx.db.sessionLog.findFirst({
        where: { user_id: client.id, session_ended_at: null },
        select: { id: true },
      });
      if (openSession) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'This client has a conversation open right now. Ask them to close the app, then try again — removing an account mid-session deletes a transcript that is still being written.',
        });
      }

      const erased = await ctx.db.$transaction(
        async (tx) => {
          const counts: Record<string, number> = {};
          const record = (key: string, result: { count: number }) => {
            counts[key] = result.count;
          };

          // String-keyed references first: these die with the session ids and
          // identifiers, which is why they cannot be left to the cascade.
          const sessions = await tx.sessionLog.findMany({
            where: { user_id: client.id },
            select: { id: true },
          });
          const sessionIds = sessions.map((s) => s.id);

          if (sessionIds.length > 0) {
            record(
              'governanceEvents',
              await tx.governanceLog.deleteMany({ where: { session_id: { in: sessionIds } } }),
            );
          }

          // Only identifiers that actually exist. An empty value turned into
          // `IS NULL` would match rows belonging to everybody else.
          const subjectRefs = [client.id, client.email, client.auth_subject].filter(
            (v): v is string => typeof v === 'string' && v.length > 0,
          );
          record(
            'betaConsents',
            await tx.betaConsent.deleteMany({ where: { user_ref: { in: subjectRefs } } }),
          );

          const waitlistIdentifiers = [
            client.email ? { email: client.email } : null,
            client.phone_number ? { phone_number: client.phone_number } : null,
          ].filter((v): v is { email: string } | { phone_number: string } => v !== null);
          if (waitlistIdentifiers.length > 0) {
            record(
              'waitlistEntries',
              await tx.waitlistEntry.deleteMany({ where: { OR: waitlistIdentifiers } }),
            );
          }

          // Counts before the delete — afterwards there is nothing left to
          // count, and the operator's confirmation should name what went.
          const [turns, moodCheckins, appointments, notes, assignments, journalEntries, homework, invites] =
            await Promise.all([
              tx.turn.count({ where: { user_id: client.id } }),
              tx.moodLog.count({ where: { user_id: client.id } }),
              tx.appointment.count({ where: { client_user_id: client.id } }),
              tx.therapistNote.count({ where: { client_user_id: client.id } }),
              tx.therapistClient.count({ where: { client_user_id: client.id } }),
              tx.journalEntry.count({ where: { user_id: client.id } }),
              tx.homework.count({ where: { client_user_id: client.id } }),
              tx.inviteToken.count({ where: { client_user_id: client.id } }),
            ]);

          await tx.user.delete({ where: { id: client.id } });

          return {
            ...counts,
            turns,
            sessions: sessionIds.length,
            moodCheckins,
            appointments,
            notes,
            assignments,
            journalEntries,
            homework,
            invites,
          };
        },
        // Same reasoning as the erasure path: 5s is not enough for a subject
        // with a long chat history (Turn is the big table), and a half-applied
        // delete is worse than a retry.
        { maxWait: 10_000, timeout: 60_000 },
      );

      return {
        removed: true as const,
        clientId: client.id,
        label: client.full_name ?? client.email ?? 'this client',
        erased,
      };
    }),
});
