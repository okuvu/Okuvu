import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  CHAT_ACCESS_WINDOW_MS as CHAT_ACCESS_WINDOW_MS_SHARED,
  chatAccessWindow,
} from "@okuvu/shared-types";
import { sendAdminTesterRequestEmail, sendClientInviteEmail } from "@/lib/email";
import {
  assertClientAssigned,
  isBypassEnabled,
  logClinicalAccess,
  router,
  therapistMutation,
  therapistProcedure,
} from "../trpc";

const CARE_PLANS = ["CP1", "CP2", "CP3"] as const;

export type ClientStatus =
  | "waiting_app_access"
  | "invited"
  | "active"
  | "ended"
  | "age_blocked";

/**
 * Therapist-portal wireframes (C-07/C-08): status is DERIVED from timestamps,
 * never stored as its own field, so it can never drift from them.
 *
 * Order matters and is the whole point of this function:
 *   ended wins over everything (an ended client stays ended even if a
 *   later sign-in raced it);
 *   age_blocked wins over active, because a client who declined the 18+
 *   attestation must never show as an active client even if some other
 *   write stamped activated_at;
 *   active needs activated_at (apps/api's markClientActivatedIfNeeded);
 *   invited needs invite_sent_at — the operator added them to the tester
 *   list AND the email went out;
 *   everything else is waiting_app_access: the row exists and the client
 *   cannot install the app yet.
 *
 * `invited` deliberately keys on invite_sent_at rather than
 * tester_access_added_at: tester access added with a failed send leaves the
 * client with no way in, and telling the therapist "invited" would hide that.
 */
export function deriveClientStatus(row: {
  activated_at: Date | null;
  ended_at: Date | null;
  age_declined_at?: Date | null;
  invite_sent_at?: Date | null;
  tester_access_added_at?: Date | null;
}): ClientStatus {
  if (row.ended_at) return "ended";
  if (row.age_declined_at) return "age_blocked";
  if (row.activated_at) return "active";
  if (row.invite_sent_at) return "invited";
  return "waiting_app_access";
}

/**
 * E16-S9 / Portal P0 — the read window for a client's raw conversation.
 *
 * The window exists ONLY because the client approved it. It runs 30 days
 * from that approval (`chat_access_granted_at`), never from the therapist's
 * request: a request nobody answered opens nothing, and no approval means no
 * read access, ever. `chat_access_closed_at` (a revocation, or the migration
 * that closed ask-only windows) ends it immediately, whatever the 30 days say.
 *
 * This replaced the earlier ask-only rule, which let a therapist read a
 * transcript the client had never agreed to share. That was a consent bug,
 * not a labelling question.
 */
export const CHAT_ACCESS_WINDOW_MS = CHAT_ACCESS_WINDOW_MS_SHARED;

export const CHAT_ACCESS_UNAVAILABLE_MESSAGE =
  'Chat access is not available for this client';

/** One agent/client turn, as the portal renders it. No author identity. */
export interface ConversationTurn {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

/** One page of a client's conversation, oldest→newest within the page. */
export interface ConversationPage {
  window: { grantedAt: string; expiresAt: string };
  turns: ConversationTurn[];
  nextCursor: string | null;
}

/**
 * Null unless the client has approved and that approval is still open.
 *
 * The implementation lives in `@okuvu/shared-types` so the client's mobile
 * switch and this gate cannot drift: both read the same 30-day rule, and the
 * app shows "Shared" only when this returns a window. Re-exported here so
 * existing callers and tests keep their import path.
 */
export { chatAccessWindow };

/**
 * What the therapist is told about chat access, in one value — the Overview
 * page's consent line renders exactly this, so the sentence and the gate can
 * never disagree.
 *
 *   not_requested · waiting_for_client · open (until …) · closed
 */
export type ChatAccessState =
  | { state: 'not_requested' }
  | { state: 'waiting_for_client'; requestedAt: string }
  | { state: 'open'; grantedAt: string; expiresAt: string }
  | { state: 'closed'; grantedAt: string | null; closedAt: string };

export function chatAccessState(
  assignment: {
    chat_access_requested_at: Date | null;
    chat_access_granted_at: Date | null;
    chat_access_closed_at: Date | null;
  } | null,
  now: number = Date.now(),
): ChatAccessState {
  if (!assignment) return { state: 'not_requested' };
  const window = chatAccessWindow(assignment, now);
  if (window) {
    return {
      state: 'open',
      grantedAt: window.grantedAt.toISOString(),
      expiresAt: window.expiresAt.toISOString(),
    };
  }
  if (assignment.chat_access_granted_at) {
    return {
      state: 'closed',
      grantedAt: assignment.chat_access_granted_at.toISOString(),
      closedAt: (
        assignment.chat_access_closed_at ??
        new Date(assignment.chat_access_granted_at.getTime() + CHAT_ACCESS_WINDOW_MS)
      ).toISOString(),
    };
  }
  if (assignment.chat_access_requested_at) {
    return {
      state: 'waiting_for_client',
      requestedAt: assignment.chat_access_requested_at.toISOString(),
    };
  }
  return { state: 'not_requested' };
}

/** Wire size of one page of the transcript view. */
const CONVERSATION_PAGE_SIZE = 50;
const CONVERSATION_MAX_PAGE_SIZE = 100;

/**
 * Keyset cursor for the transcript: `<created_at ISO>|<turn id>`. Encoded
 * rather than Prisma's `cursor` so the page (a plain <Link>) can carry it
 * as a query param and so a deleted/rotated row can never shift the window
 * onto a turn the therapist already read.
 */
function encodeConversationCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

function decodeConversationCursor(cursor: string): { createdAt: Date; id: string } | null {
  const separator = cursor.lastIndexOf('|');
  if (separator <= 0) return null;
  const createdAt = new Date(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  if (Number.isNaN(createdAt.getTime()) || id.length === 0) return null;
  return { createdAt, id };
}

export const clientsRouter = router({
  /**
   * Portal P0 — the therapist's own "Add client" (Dashboard, Page 1).
   *
   * Distinct from admin.createClient, which is the operator console's wizard:
   * this one is scoped to the signed-in therapist, asks for three fields and
   * an 18+ attestation, and deliberately sends NOTHING. The client cannot
   * install the app until the operator has added their address to the Play
   * internal-testing group, so an email here would be a link that does not
   * open. The operator is notified instead (see lib/email.ts), and the invite
   * goes out from the console's "Mark tester access added".
   *
   * No phone number: email is the identity (apps/api's resolveGoogleAccount
   * binds the Google subject to a User row by email on first sign-in).
   */
  create: therapistMutation
    .input(
      z.object({
        clientLabel: z.string().trim().min(1).max(120),
        email: z.string().trim().email(),
        carePlanId: z.enum(CARE_PLANS),
        /** The therapist's attestation. Required, and must be literally true —
         * a client added without it is a safeguarding gap, not a default. */
        adultConfirmed: z.literal(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;
      const email = input.email.trim().toLowerCase();

      const therapist = await db.therapist.findUnique({
        where: { id: therapistId },
        select: { name: true, email: true },
      });

      const existing = await db.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A client with ${email} already exists. Find them in your client list instead of adding them again.`,
        });
      }

      const client = await db.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email },
          select: { id: true },
        });
        await tx.clinicalConfig.create({
          data: {
            user_id: created.id,
            care_plan_id: input.carePlanId,
            assignment_state: "confirmed",
          },
        });
        await tx.therapistClient.create({
          data: {
            therapist_id: therapistId,
            client_user_id: created.id,
            client_label: input.clientLabel,
            age_confirmed_by_therapist_at: new Date(),
            age_confirmed_by_therapist_id: therapistId,
          },
        });
        return created;
      });

      // The operator has to add this address to the tester group by hand.
      // Best-effort by design: the client row exists and the console shows
      // them as "waiting for app access" whether or not this email lands, so
      // a mail failure must not fail the therapist's add.
      const notify = await sendAdminTesterRequestEmail({
        clientEmail: email,
        clientLabel: input.clientLabel,
        therapistName: therapist?.name ?? therapist?.email ?? "A therapist",
        therapistEmail: therapist?.email ?? "",
      });

      return {
        success: true,
        clientId: client.id,
        email,
        status: "waiting_app_access" as const,
        adminNotified: notify.sent,
      };
    }),

  /**
   * "Resend invite" on a row that reads Invited — the explicit re-send the
   * spec allows, and the only path that emails a client after registration.
   * Idempotent from the therapist's point of view: a second click sends a
   * second identical email, which is the point of the button.
   */
  resendInvite: therapistMutation
    .input(z.object({ clientUserId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);

      const assignment = await db.therapistClient.findUnique({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapistId,
            client_user_id: input.clientUserId,
          },
        },
        select: { tester_access_added_at: true, ended_at: true },
      });
      if (!assignment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      }
      if (assignment.ended_at) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This client's care has ended." });
      }
      if (!assignment.tester_access_added_at) {
        // Sending now would be a link the client cannot use: their address is
        // not on the Play tester list yet.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Waiting for app access — the invite goes out once the address is on the tester list.",
        });
      }

      const client = await db.user.findUnique({
        where: { id: input.clientUserId },
        select: { email: true },
      });
      if (!client?.email) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client has no sign-in address on file" });
      }

      const therapist = await db.therapist.findUnique({
        where: { id: therapistId },
        select: { name: true, email: true },
      });

      const result = await sendClientInviteEmail({
        to: client.email,
        therapistName: therapist?.name ?? therapist?.email ?? "Your therapist",
      });

      if (result.sent) {
        await db.therapistClient.update({
          where: {
            therapist_id_client_user_id: {
              therapist_id: therapistId,
              client_user_id: input.clientUserId,
            },
          },
          data: { invite_sent_at: new Date() },
        });
      }

      return { success: true, emailSent: result.sent };
    }),

  /**
   * The client's name and record number, and nothing else.
   *
   * Every client sub-page renders a breadcrumb ("Dashboard / <name> / Notes")
   * that used to read "Client" because it had no way to fetch a label. This is
   * that way: two fields, the same two the Dashboard shows, so a therapist
   * reading a paper file against the screen matches on the number.
   */
  header: therapistProcedure
    .input(z.object({ clientUserId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (isBypassEnabled()) {
        return { clientLabel: 'Client', clientCode: null as string | null };
      }
      await assertClientAssigned(ctx.db, ctx.therapistId, input.clientUserId);
      const assignment = await ctx.db.therapistClient.findUnique({
        where: {
          therapist_id_client_user_id: {
            therapist_id: ctx.therapistId,
            client_user_id: input.clientUserId,
          },
        },
        select: { client_label: true, client: { select: { client_code: true } } },
      });
      return {
        clientLabel: assignment?.client_label ?? 'Client',
        clientCode: assignment?.client.client_code ?? null,
      };
    }),

  list: therapistProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    const therapistId = ctx.therapistId;

    const assignments = await db.therapistClient.findMany({
      where: { therapist_id: therapistId },
      include: {
        client: {
          include: {
            clinical_config: true,
            safety_state: true,
            session_logs: {
              orderBy: { session_started_at: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    return assignments.map((assignment) => ({
      id: assignment.client.id,
      // The therapist's own label — the only name this portal shows. There
      // is deliberately no phone number and no user id in this payload: the
      // masked phone and the "User #E7D8" fallback were the two identifiers
      // the redesign removes, and omitting them from the wire type is what
      // stops them reappearing in a third surface.
      clientLabel: assignment.client_label,
      // The client's record number — `SG88F0001`. Null only for a row that has
      // no birth year or gender on file yet (see admin.completeClientProfile).
      clientCode: assignment.client.client_code,
      carePlan: assignment.client.clinical_config
        ? {
            care_plan_id: assignment.client.clinical_config.care_plan_id,
            assignment_state: assignment.client.clinical_config.assignment_state,
          }
        : null,
      lastSessionDate:
        assignment.client.session_logs[0]?.session_started_at.toISOString() ??
        null,
      safetyState:
        assignment.client.safety_state?.safety_state_current ?? null,
      // wireframes C-07 — kept alongside carePlan.assignment_state, not
      // conflated with it: this is the invite/relationship lifecycle,
      // that's the care-plan-confidence state.
      status: deriveClientStatus({
        activated_at: assignment.activated_at,
        ended_at: assignment.ended_at,
        age_declined_at: assignment.client.age_declined_at,
        invite_sent_at: assignment.invite_sent_at,
        tester_access_added_at: assignment.tester_access_added_at,
      }),
    }));
  }),

  detail: therapistProcedure
    .input(z.object({ clientUserId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (isBypassEnabled()) {
        return {
          id: input.clientUserId,
          clientLabel: "Client",
          clientCode: null as string | null,
          carePlan: null,
          reasoningNote: null,
          safetyState: null,
          summary: { status: "not_available_yet" as const, summary_text: null, session_id: null },
          careReviewFlagged: false,
          status: "waiting_app_access" as const,
          moodShared: false,
          chatAccess: { state: "not_requested" as const },
          email: null as string | null,
          ageConfirmedByTherapistAt: null as string | null,
          ageConfirmedByClientAt: null as string | null,
          ageDeclinedAt: null as string | null,
        };
      }

      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);
      await logClinicalAccess(db, therapistId, input.clientUserId, "VIEW_CLIENT_DETAIL");

      // §C.3/C.5: care_plan_review_flagged is summary-derived (Worker 05
      // judges it from the raw chat), so it's gated on chat_access_granted
      // the same way report-card.ts's richer summary-derived data already
      // is — unlike reasoningNote/summary above, which predate that gating
      // and stay ungated for now (a known inconsistency, not introduced here).
      const assignment = await db.therapistClient.findUnique({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapistId,
            client_user_id: input.clientUserId,
          },
        },
        select: {
          client_label: true,
          chat_access_granted: true,
          chat_access_requested_at: true,
          chat_access_granted_at: true,
          chat_access_closed_at: true,
          age_confirmed_by_therapist_at: true,
          tester_access_added_at: true,
          invite_sent_at: true,
          activated_at: true,
          ended_at: true,
        },
      });

      const client = await db.user.findUnique({
        where: { id: input.clientUserId },
        include: {
          clinical_config: true,
          safety_state: true,
          engagement_profile: { select: { consent_1: true, consent_2: true } },
          session_summaries: {
            orderBy: { last_updated_at: "desc" },
            take: 1,
            include: { session: true },
          },
        },
      });

      if (!client) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Client not found",
        });
      }

      const latestSummary = client.session_summaries[0] ?? null;
      let summaryStatus: "available" | "generating" | "not_available_yet";
      if (
        latestSummary?.status === "COMPLETED" &&
        latestSummary.summary_text !== null
      ) {
        summaryStatus = "available";
      } else if (latestSummary?.status === "PENDING") {
        summaryStatus = "generating";
      } else if (latestSummary?.status === "FAILED") {
        summaryStatus = "not_available_yet";
      } else if (latestSummary?.status === "SKIPPED_TRIVIAL") {
        summaryStatus = "not_available_yet";
      } else {
        summaryStatus = "not_available_yet";
      }

      return {
        id: client.id,
        clientLabel: assignment?.client_label ?? client.full_name ?? "Client",
        clientCode: client.client_code,
        carePlan: client.clinical_config
          ? {
              care_plan_id: client.clinical_config.care_plan_id,
              assignment_state: client.clinical_config.assignment_state,
            }
          : null,
        reasoningNote: client.clinical_config?.reasoning_note ?? null,
        safetyState: client.safety_state?.safety_state_current ?? null,
        summary: {
          status: summaryStatus,
          summary_text: latestSummary?.summary_text ?? null,
          session_id: latestSummary?.session_id ?? null,
        },
        careReviewFlagged: Boolean(
          assignment?.chat_access_granted && client.clinical_config?.care_plan_review_flagged,
        ),
        status: assignment
          ? deriveClientStatus({
              activated_at: assignment.activated_at,
              ended_at: assignment.ended_at,
              age_declined_at: client.age_declined_at,
              invite_sent_at: assignment.invite_sent_at,
              tester_access_added_at: assignment.tester_access_added_at,
            })
          : "waiting_app_access",
        // Portal P0 — the consent line, in plain words. `moodShared` is
        // EngagementProfile.consent_2; `chatAccess` is a four-state value so
        // the sentence the therapist reads and the read gate cannot disagree
        // (both come from chatAccessWindow/chatAccessState).
        moodShared: client.engagement_profile?.consent_2 ?? false,
        chatAccess: chatAccessState(assignment),
        // Client Details card: the sign-in address, and the two-sided 18+
        // attestation with its own timestamp on each side.
        email: client.email,
        ageConfirmedByTherapistAt:
          assignment?.age_confirmed_by_therapist_at?.toISOString() ?? null,
        ageConfirmedByClientAt: client.age_confirmed_at?.toISOString() ?? null,
        ageDeclinedAt: client.age_declined_at?.toISOString() ?? null,
      };
    }),

  getCarePlan: therapistProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientId);

      const config = await db.clinicalConfig.findUnique({
        where: { user_id: input.clientId },
        select: { care_plan_id: true, assignment_state: true, created_at: true },
      });

      return {
        care_plan_id: config?.care_plan_id ?? "CP1",
        assignment_state: config?.assignment_state ?? "provisional",
        created_at: config?.created_at?.toISOString() ?? null,
      };
    }),

  setCarePlan: therapistMutation
    .input(
      z.object({
        clientId: z.string().min(1),
        carePlanId: z.enum(CARE_PLANS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientId);

      const result = await db.clinicalConfig.upsert({
        where: { user_id: input.clientId },
        create: {
          user_id: input.clientId,
          care_plan_id: input.carePlanId,
          assignment_state: "confirmed",
        },
        update: {
          care_plan_id: input.carePlanId,
          assignment_state: "confirmed",
        },
        select: {
          care_plan_id: true,
          assignment_state: true,
          created_at: true,
        },
      });

      return {
        success: true,
        clientId: input.clientId,
        carePlanId: result.care_plan_id,
        assignmentState: result.assignment_state,
        created_at: result.created_at.toISOString(),
      };
    }),

  // wireframes C-07 — therapist removes a client from their roster. Never
  // deletes the TherapistClient row; sets ended_at so status derives to
  // "ended" and the row (with full history) stays visible in the list.
  end: therapistMutation
    .input(z.object({ clientUserId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);
      await logClinicalAccess(db, therapistId, input.clientUserId, "END_CLIENT");

      await db.therapistClient.update({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapistId,
            client_user_id: input.clientUserId,
          },
        },
        // `ended_at` alone no longer closes the transcript: the read window is
        // the client's approval, so ending care has to close it explicitly.
        data: { ended_at: new Date(), chat_access_closed_at: new Date() },
      });

      // Decisions doc round, 15 Sep 2026 §11 — "reminders stop." No
      // delivery mechanism reads Reminder.active yet (push/FCM stays out
      // of scope), but this is correct-for-later rather than leaving stale
      // active reminders behind an ended relationship.
      await db.reminder.updateMany({
        where: { user_id: input.clientUserId, active: true },
        data: { active: false },
      });

      return { success: true };
    }),

  // wireframes C-08 — "Request chat access." Only ever sets a timestamp
  // the client can see; the actual grant/deny is the client's own action
  // via PATCH /users/me/chat-access (apps/api/src/routes/users.ts) — the
  // portal can indicate and request, never write chat_access_granted
  // directly through this path.
  requestChatAccess: therapistMutation
    .input(z.object({ clientUserId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);

      // Decisions doc round, 15 Sep 2026 §9 — a re-ask is capped at once
      // per 30 days, regardless of whether the client has answered.
      // "Only at a care-plan review" isn't enforced — no such event concept
      // exists anywhere in the product today.
      const existing = await db.therapistClient.findUnique({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapistId,
            client_user_id: input.clientUserId,
          },
        },
        select: { chat_access_requested_at: true },
      });

      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      if (
        existing?.chat_access_requested_at &&
        Date.now() - existing.chat_access_requested_at.getTime() < THIRTY_DAYS_MS
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You already asked recently — try again later.',
        });
      }

      await logClinicalAccess(db, therapistId, input.clientUserId, "REQUEST_CHAT_ACCESS");

      await db.therapistClient.update({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapistId,
            client_user_id: input.clientUserId,
          },
        },
        data: { chat_access_requested_at: new Date() },
      });

      return { success: true };
    }),

  // E16-S9 — the therapist's read-only view of one client's conversation
  // with the agent. Read-only by construction: there is no counterpart
  // mutation anywhere in this router, and Turn rows are only ever written
  // by apps/api's orchestrator, so a therapist has no path to a turn that
  // speaks as the client.
  //
  // Access = the existing TherapistClient row for this exact pair (via
  // assertClientAssigned, same as every other client read here) AND a
  // chat_access_requested_at inside the existing 30-day window — see
  // chatAccessWindow above. Both failures throw FORBIDDEN, deliberately:
  // a "granted: false" return would put the transcript and the refusal in
  // the same response type, where one refactor could leak content.
  //
  // The read is logged as VIEW_CONVERSATION *before* any Turn row is read,
  // through the one existing logClinicalAccess helper — worst case an
  // abandoned page still leaves an access row (fail-closed on audit, not on
  // availability: the helper swallows its own write failures).
  conversation: therapistProcedure
    .input(
      z.object({
        clientUserId: z.string().min(1),
        cursor: z.string().min(1).optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(CONVERSATION_MAX_PAGE_SIZE)
          .default(CONVERSATION_PAGE_SIZE),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);

      const assignment = await db.therapistClient.findUnique({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapistId,
            client_user_id: input.clientUserId,
          },
        },
        select: { chat_access_granted_at: true, chat_access_closed_at: true },
      });

      const window = chatAccessWindow(assignment);
      if (!window) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: CHAT_ACCESS_UNAVAILABLE_MESSAGE,
        });
      }

      await logClinicalAccess(db, therapistId, input.clientUserId, 'VIEW_CONVERSATION');

      const after = input.cursor ? decodeConversationCursor(input.cursor) : null;
      if (input.cursor && !after) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid page cursor' });
      }

      // Newest-first keyset scan (take limit+1 to learn "is there more"),
      // reversed before returning so each page reads oldest→newest.
      const rows = await db.turn.findMany({
        where: {
          user_id: input.clientUserId,
          role: { in: ['user', 'assistant'] },
          ...(after
            ? {
                OR: [
                  { created_at: { lt: after.createdAt } },
                  { created_at: after.createdAt, id: { lt: after.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        select: {
          id: true,
          session_id: true,
          role: true,
          content: true,
          created_at: true,
        },
      });

      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      const oldest = page[page.length - 1] ?? null;

      return {
        window: {
          grantedAt: window.grantedAt.toISOString(),
          expiresAt: window.expiresAt.toISOString(),
        },
        turns: page
          .slice()
          .reverse()
          .map((turn) => ({
            id: turn.id,
            sessionId: turn.session_id,
            role: turn.role === 'user' ? ('user' as const) : ('assistant' as const),
            content: turn.content,
            createdAt: turn.created_at.toISOString(),
          })),
        nextCursor: hasMore && oldest ? encodeConversationCursor(oldest.created_at, oldest.id) : null,
      } satisfies ConversationPage;
    }),
});