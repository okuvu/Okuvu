import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';

export const clientsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const therapistEmail = ctx.user.email;
    if (!therapistEmail) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No email on session' });
    }

    if (!ctx.prisma) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
    }

    const therapist = await ctx.prisma.therapist.findUnique({
      where: { email: therapistEmail },
    });

    if (!therapist) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Therapist not found' });
    }

    const assignments = await ctx.prisma.therapistClient.findMany({
      where: { therapist_id: therapist.id },
      include: {
        client: {
          include: {
            clinical_config: true,
            session_logs: {
              orderBy: { session_started_at: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    return assignments.map((a) => ({
      id: a.client.id,
      phoneNumber: a.client.phone_number,
      carePlan: a.client.clinical_config
        ? {
            care_plan_id: a.client.clinical_config.care_plan_id,
            assignment_state: a.client.clinical_config.assignment_state,
          }
        : null,
      lastSessionDate:
        a.client.session_logs[0]?.session_started_at.toISOString() ?? null,
    }));
  }),

  detail: protectedProcedure
    .input(z.object({ clientUserId: z.string() }))
    .query(async ({ ctx, input }) => {
      const therapistEmail = ctx.user.email;
      if (!therapistEmail) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No email on session' });
      }

      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }

      const therapist = await ctx.prisma.therapist.findUnique({
        where: { email: therapistEmail },
      });

      if (!therapist) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Therapist not found' });
      }

      const assignment = await ctx.prisma.therapistClient.findUnique({
        where: {
          therapist_id_client_user_id: {
            therapist_id: therapist.id,
            client_user_id: input.clientUserId,
          },
        },
      });

      if (!assignment) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Client is not assigned to this therapist',
        });
      }

      const client = await ctx.prisma.user.findUnique({
        where: { id: input.clientUserId },
        include: {
          clinical_config: true,
          safety_state: true,
          session_summaries: {
            orderBy: { last_updated_at: 'desc' },
            take: 1,
            include: {
              session: true,
            },
          },
        },
      });

      if (!client) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });
      }

      console.log(
        `[AUDIT] therapist ${therapist.id} viewed client ${client.id} detail`,
      );

      const latestSummary = client.session_summaries[0] ?? null;
      const summaryAvailable =
        latestSummary?.status === 'COMPLETED' && latestSummary.summary_text !== null;

      return {
        id: client.id,
        phoneNumber: client.phone_number,
        carePlan: client.clinical_config
          ? {
              care_plan_id: client.clinical_config.care_plan_id,
              assignment_state: client.clinical_config.assignment_state,
              reasoning_note: client.clinical_config.reasoning_note,
            }
          : null,
        safetyState: client.safety_state?.safety_state_current ?? null,
        summary: {
          status: summaryAvailable ? 'available' : 'not_available_yet',
          summary_text: latestSummary?.summary_text ?? null,
          session_id: latestSummary?.session_id ?? null,
        },
      };
    }),
});
