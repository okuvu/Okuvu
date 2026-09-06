import { z } from 'zod';
import {
  assertClientAssigned,
  logClinicalAccess,
  router,
  therapistMutation,
  therapistProcedure,
} from '../trpc';

export const notesRouter = router({
  addNote: therapistMutation
    .input(
      z.object({
        clientUserId: z.string(),
        noteText: z.string().trim().min(1, 'Note text must not be empty'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);

      const note = await db.therapistNote.create({
        data: {
          therapist_id: therapistId,
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
  listNotes: therapistProcedure
    .input(
      z.object({
        clientId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientId);
      await logClinicalAccess(db, therapistId, input.clientId, 'VIEW_NOTES');

      const notes = await db.therapistNote.findMany({
        where: {
          therapist_id: therapistId,
          client_user_id: input.clientId,
        },
        orderBy: {
          created_at: 'desc',
        },
        select: {
          id: true,
          note_text: true,
          created_at: true,
          therapist: {
            select: {
              name: true,
            },
          },
        },
      });

      return notes;
    }),
});
