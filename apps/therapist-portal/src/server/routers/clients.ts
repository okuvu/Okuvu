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
});
