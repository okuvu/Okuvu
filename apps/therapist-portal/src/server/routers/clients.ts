import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assertClientAssigned,
  isBypassEnabled,
  logClinicalAccess,
  router,
  therapistMutation,
  therapistProcedure,
} from "../trpc";

const CARE_PLANS = ["CP1", "CP2", "CP3"] as const;

export type ClientStatus = "pending" | "active" | "ended";

/**
 * Therapist-portal wireframes (C-07/C-08): status is DERIVED from
 * TherapistClient's timestamps, never stored as its own field, so it can
 * never drift from them. ended_at wins over activated_at if somehow both
 * are set (an ended client stays ended even if activation raced it).
 */
export function deriveClientStatus(row: { activated_at: Date | null; ended_at: Date | null }): ClientStatus {
  if (row.ended_at) return "ended";
  if (row.activated_at) return "active";
  return "pending";
}

/**
 * E16-S9 — the read window for a client's raw conversation.
 *
 * This is the SAME 30-day rule `requestChatAccess` already enforces on the
 * ask side (Decisions doc round, 15 Sep 2026 §9), read from the other
 * direction: an ask is good for 30 days, so a read is allowed while the
 * therapist's ask is younger than that. No second permission model, no new
 * column, no new table — just the existing timestamp with an expiry on it.
 *
 * Deliberately NOT `chat_access_granted`: that field is the client's
 * opt-in consent for *summary-derived* clinical data (report card, session
 * prep). The story's own gate for the raw transcript is the requested_at
 * window, and the therapist can only ever ask — the client's grant lands
 * asynchronously in the mobile app. Requiring the grant here would make the
 * documented flow (request, then read) impossible to complete in one sitting.
 */
export const CHAT_ACCESS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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
  window: { requestedAt: string; expiresAt: string };
  turns: ConversationTurn[];
  nextCursor: string | null;
}

/**
 * Null when no ask was ever made or the ask is 30 days old or older
 * (boundary: exactly 30 days has expired — the window is half-open).
 */
export function chatAccessWindow(
  assignment: { chat_access_requested_at: Date | null } | null,
  now: number = Date.now(),
): { requestedAt: Date; expiresAt: Date } | null {
  const requestedAt = assignment?.chat_access_requested_at;
  if (!requestedAt) return null;
  const expiresAt = new Date(requestedAt.getTime() + CHAT_ACCESS_WINDOW_MS);
  if (now - requestedAt.getTime() >= CHAT_ACCESS_WINDOW_MS) return null;
  return { requestedAt, expiresAt };
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
      phoneNumber: assignment.client.phone_number,
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
      status: deriveClientStatus(assignment),
    }));
  }),

  detail: therapistProcedure
    .input(z.object({ clientUserId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (isBypassEnabled()) {
        return {
          id: input.clientUserId,
          phoneNumber: "+1 (555) 000-0000",
          carePlan: null,
          reasoningNote: null,
          safetyState: null,
          summary: { status: "not_available_yet" as const, summary_text: null, session_id: null },
          careReviewFlagged: false,
          status: "pending" as const,
          consent: { safety: false, mood: false, chatAccess: false, chatAccessRequestedAt: null as string | null },
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
          chat_access_granted: true,
          chat_access_requested_at: true,
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
        phoneNumber: client.phone_number,
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
        status: assignment ? deriveClientStatus(assignment) : "pending",
        // wireframes C-08 — the consent chip. safety/mood come from
        // EngagementProfile (consent_1/consent_2 — see apps/api/src/routes
        // /users.ts's POST /users/me/consent for the field mapping);
        // chatAccess/chatAccessRequestedAt come from TherapistClient.
        consent: {
          safety: client.engagement_profile?.consent_1 ?? false,
          mood: client.engagement_profile?.consent_2 ?? false,
          chatAccess: assignment?.chat_access_granted ?? false,
          chatAccessRequestedAt: assignment?.chat_access_requested_at?.toISOString() ?? null,
        },
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
        data: { ended_at: new Date() },
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
        select: { chat_access_requested_at: true },
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
          requestedAt: window.requestedAt.toISOString(),
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