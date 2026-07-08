import { TRPCError } from '@trpc/server';
import { z } from 'zod';
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

  setCarePlan: protectedProcedure
    .input(
      z.object({
        client_id: z.string(),
        care_plan_id: z.enum(['CP1', 'CP2', 'CP3']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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
            client_user_id: input.client_id,
          },
        },
      });

      if (!assignment) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Client not assigned to therapist' });
      }

      const existing = await ctx.prisma.clinicalConfig.findUnique({
        where: { user_id: input.client_id },
        select: { care_plan_id: true, assignment_state: true },
      });

      const oldCarePlanId = existing?.care_plan_id ?? null;

      if (existing?.care_plan_id === input.care_plan_id && existing.assignment_state === 'confirmed') {
        return {
          success: true,
          client_id: input.client_id,
          care_plan_id: input.care_plan_id,
          assignment_state: 'confirmed' as const,
        };
      }

      const result = await ctx.prisma.clinicalConfig.upsert({
        where: { user_id: input.client_id },
        create: {
          user_id: input.client_id,
          care_plan_id: input.care_plan_id,
          assignment_state: 'confirmed',
        },
        update: {
          care_plan_id: input.care_plan_id,
          assignment_state: 'confirmed',
        },
      });

      console.log(JSON.stringify({
        event: 'therapist_care_plan_change',
        therapist_id: therapist.id,
        client_id: input.client_id,
        from: oldCarePlanId,
        to: input.care_plan_id,
        timestamp: new Date().toISOString(),
      }));

      return {
        success: true,
        client_id: input.client_id,
        care_plan_id: result.care_plan_id,
        assignment_state: result.assignment_state,
      };
    }),
});
