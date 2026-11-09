import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@okuvu/prisma';
import { router, therapistProcedure, isBypassEnabled } from '../trpc';
import { notifyTreasureBoxNote } from '../notifications';

/**
 * Sending something to a client's Treasure Box.
 *
 * The box is the client's own place, so this is a *gift*, not an assignment:
 * it lands in their Updates as "Your therapist sent you something for your
 * Treasure Box", and nothing is added to the box until they tap Keep. That is
 * why the note is written as a `treasure_note_waiting` row carrying the words in
 * `note_body` rather than straight into `TreasureNote` — the client's box stays
 * theirs, and a note they decline leaves no copy behind.
 *
 * Only the client's own linked therapist can send: "linked" means a live
 * `TherapistClient` row, so a former therapist loses this the moment care ends,
 * exactly like every other clinical write in the portal.
 */

const MAX_NOTE_CHARS = 2_000;

/** The notification writer plus the link table the gate needs. */
type Db = Parameters<typeof notifyTreasureBoxNote>[0] & Pick<PrismaClient, 'therapistClient'>;

async function assertLiveLink(
  db: Db,
  therapistId: string,
  clientId: string,
): Promise<void> {
  if (isBypassEnabled()) return;

  const link = await db.therapistClient.findFirst({
    where: { therapist_id: therapistId, client_user_id: clientId, ended_at: null },
    select: { id: true },
  });

  if (!link) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This client is not linked to your caseload.',
    });
  }
}

export const treasureBoxRouter = router({
  send: therapistProcedure
    .input(z.object({ clientId: z.string().min(1), body: z.string().min(1).max(MAX_NOTE_CHARS) }))
    .mutation(async ({ ctx, input }): Promise<{ sent: true }> => {
      await assertLiveLink(ctx.db, ctx.therapistId, input.clientId);

      const body = input.body.trim();
      if (body.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Write something first.' });
      }

      await notifyTreasureBoxNote(ctx.db, {
        clientUserId: input.clientId,
        noteBody: body,
      });

      return { sent: true };
    }),
});
