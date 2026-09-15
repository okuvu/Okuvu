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
    .input(z.object({ clientUserId: z.string() }))
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
});