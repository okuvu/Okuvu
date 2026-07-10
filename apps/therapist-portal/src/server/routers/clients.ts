import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const CARE_PLANS = ["CP1", "CP2", "CP3"] as const;

async function getAssignedTherapistId(ctx: {
  user: { email?: string | null };
  prisma: typeof import("@/lib/prisma").prisma;
}) {
  const therapistEmail = ctx.user.email;

  if (!therapistEmail) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No email on session",
    });
  }

  if (!ctx.prisma) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not configured",
    });
  }

  const therapist = await ctx.prisma.therapist.findUnique({
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

export const clientsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const therapistId = await getAssignedTherapistId(ctx);
    const db = ctx.prisma!;

    const assignments = await db.therapistClient.findMany({
      where: { therapist_id: therapistId },
      include: {
        client: {
          include: {
            clinical_config: true,
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
    }));
  }),

  detail: protectedProcedure
    .input(z.object({ clientUserId: z.string() }))
    .query(async ({ ctx, input }) => {
      const therapistId = await getAssignedTherapistId(ctx);
      const db = ctx.prisma!;

      const assignment = await db.therapistClient.findUnique({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapistId,
            client_user_id: input.clientUserId,
          },
        },
      });

      if (!assignment) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Client is not assigned to this therapist",
        });
      }

      const client = await db.user.findUnique({
        where: { id: input.clientUserId },
        include: {
          clinical_config: true,
          safety_state: true,
          session_summaries: {
            orderBy: { last_updated_at: "desc" },
            take: 1,
            include: {
              session: true,
            },
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
      const summaryAvailable =
        latestSummary?.status === "COMPLETED" &&
        latestSummary.summary_text !== null;

      return {
        id: client.id,
        phoneNumber: client.phone_number,
        carePlan: client.clinical_config
          ? {
              care_plan_id: client.clinical_config.care_plan_id,
              assignment_state: client.clinical_config.assignment_state,
            }
          : null,
        safetyState: client.safety_state?.safety_state_current ?? null,
        summary: {
          status: summaryAvailable ? "available" : "not_available_yet",
          summary_text: latestSummary?.summary_text ?? null,
          session_id: latestSummary?.session_id ?? null,
        },
      };
    }),

  getCarePlan: protectedProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const therapistId = await getAssignedTherapistId(ctx);
      const db = ctx.prisma!;

      const assignment = await db.therapistClient.findUnique({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapistId,
            client_user_id: input.clientId,
          },
        },
      });

      if (!assignment) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Client is not assigned to this therapist",
        });
      }

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
      const therapistId = await getAssignedTherapistId(ctx);
      const db = ctx.prisma!;

      const assignment = await db.therapistClient.findUnique({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapistId,
            client_user_id: input.clientId,
          },
        },
      });

      if (!assignment) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Client is not assigned to this therapist",
        });
      }

      const existing = await db.clinicalConfig.findUnique({
        where: { user_id: input.clientId },
        select: { care_plan_id: true, assignment_state: true },
      });

      const oldCarePlanId = existing?.care_plan_id ?? null;

      if (
        existing?.care_plan_id === input.carePlanId &&
        existing.assignment_state === "confirmed"
      ) {
        return {
          success: true,
          clientId: input.clientId,
          carePlanId: input.carePlanId,
          assignmentState: "confirmed" as const,
        };
      }

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
        select: { care_plan_id: true, assignment_state: true },
      });

      console.log(
        JSON.stringify({
          event: "therapist_care_plan_change",
          therapist_id: therapistId,
          client_id: input.clientId,
          from: oldCarePlanId,
          to: input.carePlanId,
          timestamp: new Date().toISOString(),
        }),
      );

      return {
        success: true,
        clientId: input.clientId,
        carePlanId: result.care_plan_id,
        assignmentState: result.assignment_state,
      };
    }),
});
