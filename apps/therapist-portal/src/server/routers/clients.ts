import type { PrismaClient } from "@evia/prisma";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const CARE_PLANS = ["CP1", "CP2", "CP3"] as const;

function getPrisma(ctx: { prisma: PrismaClient | null }): PrismaClient {
  if (!ctx.prisma) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not configured",
    });
  }
  return ctx.prisma;
}

async function getTherapistId(ctx: {
  user: { email?: string | null };
  prisma: PrismaClient | null;
}): Promise<string> {
  const therapistEmail = ctx.user.email;

  if (!therapistEmail) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No email on session",
    });
  }

  const db = getPrisma(ctx);
  const therapist = await db.therapist.findUnique({
    where: { email: therapistEmail },
  });

  if (!therapist) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Therapist not found",
    });
  }

  return therapist.id;
}

async function assertClientAssigned(
  db: PrismaClient,
  therapistId: string,
  clientUserId: string,
): Promise<void> {
  const assignment = await db.therapistClient.findUnique({
    where: {
      therapist_id_client_user_id: {
        therapist_id: therapistId,
        client_user_id: clientUserId,
      },
    },
  });

  if (!assignment) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Client is not assigned to this therapist",
    });
  }
}

export const clientsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = getPrisma(ctx);
    const therapistId = await getTherapistId(ctx);

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
    }));
  }),

  detail: protectedProcedure
    .input(z.object({ clientUserId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getPrisma(ctx);
      const therapistId = await getTherapistId(ctx);

      await assertClientAssigned(db, therapistId, input.clientUserId);

      console.log(`[AUDIT] Therapist ${therapistId} viewed client ${input.clientUserId} detail`);

      const client = await db.user.findUnique({
        where: { id: input.clientUserId },
        include: {
          clinical_config: true,
          safety_state: true,
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
      };
    }),

  getCarePlan: protectedProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = getPrisma(ctx);
      const therapistId = await getTherapistId(ctx);

      await assertClientAssigned(db, therapistId, input.clientId);

      const config = await db.clinicalConfig.findUnique({
        where: { user_id: input.clientId },
        select: { care_plan_id: true },
      });

      return {
        care_plan_id: config?.care_plan_id ?? "CP1",
      };
    }),

  setCarePlan: protectedProcedure
    .input(
      z.object({
        clientId: z.string().min(1),
        carePlanId: z.enum(CARE_PLANS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getPrisma(ctx);
      const therapistId = await getTherapistId(ctx);

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
        select: { care_plan_id: true },
      });

      return {
        success: true,
        clientId: input.clientId,
        care_plan_id: result.care_plan_id,
      };
    }),
});