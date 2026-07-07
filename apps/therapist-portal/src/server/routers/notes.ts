import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';

export const notesRouter = router({
  addNote: protectedProcedure
    .input(
      z.object({
        clientUserId: z.string(),
        noteText: z.string().trim().min(1, 'Note text must not be empty'),
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
            client_user_id: input.clientUserId,
          },
        },
      });

      if (!assignment) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Client not assigned to therapist' });
      }

      const note = await ctx.prisma.therapistNote.create({
        data: {
          therapist_id: therapist.id,
          client_user_id: input.clientUserId,
          note_text: input.noteText,
        },
        select: {
          id: true,
          created_at: true,
        },
      });

      return { id: note.id, created_at: note.created_at };
    }),
});
