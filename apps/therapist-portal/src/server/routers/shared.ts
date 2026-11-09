import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, therapistProcedure, isBypassEnabled, logClinicalAccess } from '../trpc';

/**
 * What the client chose to share, item by item.
 *
 * This router is the only place a therapist can read a client's journal entry,
 * worksheet answers or Treasure notes. Three rules shape every query:
 *
 *  1. `shared_with_therapist = true` is in the WHERE clause, always. Stopping a
 *     share therefore removes the item from the next read with no cleanup step
 *     and no copy to erase — the row itself is the visibility.
 *  2. a live `TherapistClient` link (ended_at null) is required, so a former
 *     therapist loses access the moment care ends, even to items shared while
 *     they were linked.
 *  3. the read is logged as clinical access, like the safety plan, because it
 *     is one.
 *
 * Chat is deliberately absent: a chat transcript has its own approval switch
 * and 30-day window, and it is read by a different router. "Shared item" here
 * never means "chat access".
 */

interface SharedItem {
  kind: 'journal_entry' | 'worksheet_response' | 'treasure_note';
  id: string;
  at: string;
  /** Worksheet label, note title, or "Journal". */
  title: string;
  /** What the client wrote, as plain text for reading. */
  body: string;
  /** Worksheet self-ratings, 0-10, when the client gave them. */
  feelingBefore: number | null;
  feelingAfter: number | null;
  /** True when the client marked the worksheet as having helped. */
  helped: boolean | null;
}

function answersText(answers: unknown): string {
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) return '';
  const lines: string[] = [];
  for (const [key, value] of Object.entries(answers as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      lines.push(`${key}: ${value.trim()}`);
    } else if (Array.isArray(value)) {
      const parts = value.filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
      if (parts.length > 0) lines.push(`${key}: ${parts.join(', ')}`);
    }
  }
  return lines.join('\n');
}

async function assertLiveLink(
  db: Parameters<typeof logClinicalAccess>[0],
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

export const sharedRouter = router({
  list: therapistProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<{ items: SharedItem[] }> => {
      await assertLiveLink(ctx.db, ctx.therapistId, input.clientId);

      const [journal, worksheets, notes] = await Promise.all([
        ctx.db.journalEntry.findMany({
          where: { user_id: input.clientId, shared_with_therapist: true },
          orderBy: { created_at: 'desc' },
          take: 100,
          select: { id: true, content: true, created_at: true, emotion: true },
        }),
        ctx.db.worksheetResponse.findMany({
          where: { user_id: input.clientId, shared_with_therapist: true },
          orderBy: { completed_at: 'desc' },
          take: 100,
          select: {
            id: true,
            answers: true,
            completed_at: true,
            feeling_before: true,
            feeling_after: true,
            helped: true,
            worksheet: { select: { label: true } },
          },
        }),
        ctx.db.treasureNote.findMany({
          where: { user_id: input.clientId, shared_with_therapist: true },
          orderBy: { created_at: 'desc' },
          take: 100,
          select: { id: true, title: true, body: true, created_at: true },
        }),
      ]);

      const items: SharedItem[] = [
        ...journal.map((row) => ({
          kind: 'journal_entry' as const,
          id: row.id,
          at: row.created_at.toISOString(),
          title: row.emotion ? `Journal · ${row.emotion}` : 'Journal',
          body: row.content,
          feelingBefore: null,
          feelingAfter: null,
          helped: null,
        })),
        ...worksheets.map((row) => ({
          kind: 'worksheet_response' as const,
          id: row.id,
          at: row.completed_at.toISOString(),
          title: row.worksheet?.label ?? 'Worksheet',
          body: answersText(row.answers),
          feelingBefore: row.feeling_before,
          feelingAfter: row.feeling_after,
          helped: row.helped,
        })),
        ...notes.map((row) => ({
          kind: 'treasure_note' as const,
          id: row.id,
          at: row.created_at.toISOString(),
          title: row.title ?? 'Treasure Box note',
          body: row.body,
          feelingBefore: null,
          feelingAfter: null,
          helped: null,
        })),
      ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

      // One access-log row per read, naming what was read but not what it said.
      await logClinicalAccess(
        ctx.db,
        ctx.therapistId,
        input.clientId,
        `shared_items_read:${items.length}`,
      );

      return { items };
    }),
});
