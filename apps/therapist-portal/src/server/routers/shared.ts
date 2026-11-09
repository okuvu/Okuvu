import { z } from 'zod';
import { router, therapistProcedure, assertLiveLink, logClinicalAccess } from '../trpc';

/**
 * What the client chose to share, item by item — plus the two things a
 * therapist may see around it without any content at all.
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
 * Rounding out the picture (Step 9, 9 Nov 2026) are two reads that carry no
 * client writing:
 *
 *  - `patterns`: the same before/after ratings and "what got in the way" text
 *    the tab already shows, grouped by exercise so a change over time is
 *    visible. Built from shared rows ONLY — an unshared response contributes
 *    nothing, not even a count.
 *  - `assignments`: whether an assigned exercise was done. This is the one
 *    thing a therapist may know about work the client did not share: the ask
 *    was theirs, and "done" is not the client's words. No answers, no ratings,
 *    no barriers, no response titles — just the assignment and its state.
 *
 * Chat is deliberately absent: a chat transcript has its own approval switch
 * and 30-day window, and it is read by a different router. "Shared item" here
 * never means "chat access".
 */

export interface SharedItem {
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
  /** "What got in the way", when the client wrote one. Shared rows only. */
  barriers: string | null;
}

/** One rated point in an exercise's series. */
export interface PatternPoint {
  at: string;
  before: number | null;
  after: number | null;
  helped: boolean | null;
}

/**
 * One exercise, described. No score, no grade, no direction word: the numbers
 * the client gave, in order, so the therapist reads the shape for themselves.
 */
export interface ExercisePattern {
  worksheetId: string;
  label: string;
  /** How many shared responses this exercise has. Never counts private ones. */
  occurrences: number;
  /** True when no point has a rating (only free text was shared). */
  textOnly: boolean;
  /** Oldest first — the order a trend is read in. */
  points: PatternPoint[];
  /** Lowest and highest "before" the client gave, when any exist. */
  beforeRange: { low: number; high: number } | null;
  afterRange: { low: number; high: number } | null;
  /** "What got in the way", newest first, one line per shared response. */
  barriers: string[];
}

/** An assignment and whether it was done. Never the client's words. */
export interface AssignmentStatus {
  homeworkId: string;
  /** The exercise label, or the therapist's own written homework line. */
  label: string;
  assignedAt: string;
  dueAt: string | null;
  done: boolean;
  /** Last time the client marked it done, when done. */
  lastDoneAt: string | null;
  /** True when the assignment repeats, so "done" is per day, not final. */
  repeating: boolean;
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

function rangeOf(values: number[]): { low: number; high: number } | null {
  if (values.length === 0) return null;
  return { low: Math.min(...values), high: Math.max(...values) };
}

export const sharedRouter = router({
  list: therapistProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .query(
      async ({
        ctx,
        input,
      }): Promise<{
        items: SharedItem[];
        patterns: ExercisePattern[];
        assignments: AssignmentStatus[];
      }> => {
        await assertLiveLink(ctx.db, ctx.therapistId, input.clientId);

        const [journal, worksheets, notes, homework] = await Promise.all([
          ctx.db.journalEntry.findMany({
            where: { user_id: input.clientId, shared_with_therapist: true },
            orderBy: { created_at: 'desc' },
            take: 100,
            select: { id: true, content: true, created_at: true, emotion: true },
          }),
          ctx.db.worksheetResponse.findMany({
            where: { user_id: input.clientId, shared_with_therapist: true },
            orderBy: { completed_at: 'desc' },
            take: 200,
            select: {
              id: true,
              answers: true,
              completed_at: true,
              feeling_before: true,
              feeling_after: true,
              barriers: true,
              helped: true,
              worksheet_id: true,
              worksheet: { select: { label: true } },
            },
          }),
          ctx.db.treasureNote.findMany({
            where: { user_id: input.clientId, shared_with_therapist: true },
            orderBy: { created_at: 'desc' },
            take: 100,
            select: { id: true, title: true, body: true, created_at: true },
          }),
          // The only read here that is not filtered on a share: the assignment
          // is the therapist's own ask. It selects nothing the client wrote.
          ctx.db.homework.findMany({
            where: { client_user_id: input.clientId },
            orderBy: { assigned_at: 'desc' },
            take: 50,
            select: {
              id: true,
              description: true,
              frequency: true,
              due_at: true,
              assigned_at: true,
              status: true,
              last_completed_at: true,
              tool: { select: { label: true } },
              completions: {
                orderBy: { completed_at: 'desc' },
                take: 1,
                select: { completed_at: true },
              },
            },
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
            barriers: null,
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
            barriers: row.barriers,
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
            barriers: null,
          })),
        ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

        // Grouped from the shared rows only — `worksheets` is already filtered,
        // so an unshared response cannot reach this loop even as a count.
        const byWorksheet = new Map<string, ExercisePattern>();
        for (const row of worksheets) {
          const label = row.worksheet?.label ?? 'Worksheet';
          const point: PatternPoint = {
            at: row.completed_at.toISOString(),
            before: row.feeling_before,
            after: row.feeling_after,
            helped: row.helped,
          };
          const existing = byWorksheet.get(row.worksheet_id);
          if (!existing) {
            byWorksheet.set(row.worksheet_id, {
              worksheetId: row.worksheet_id,
              label,
              occurrences: 1,
              textOnly: row.feeling_before === null && row.feeling_after === null,
              points: [point],
              beforeRange: null,
              afterRange: null,
              barriers: row.barriers ? [row.barriers] : [],
            });
          } else {
            existing.occurrences += 1;
            existing.points.push(point);
            existing.textOnly = existing.textOnly && point.before === null && point.after === null;
            if (row.barriers) existing.barriers.push(row.barriers);
          }
        }

        const patterns = [...byWorksheet.values()]
          .map((pattern) => {
            const beforeValues = pattern.points
              .map((p) => p.before)
              .filter((v): v is number => typeof v === 'number');
            const afterValues = pattern.points
              .map((p) => p.after)
              .filter((v): v is number => typeof v === 'number');
            return {
              ...pattern,
              // `worksheets` arrives newest first; a trend reads oldest first.
              points: [...pattern.points].reverse(),
              beforeRange: rangeOf(beforeValues),
              afterRange: rangeOf(afterValues),
            };
          })
          .sort((a, b) => b.occurrences - a.occurrences || a.label.localeCompare(b.label));

        const assignments: AssignmentStatus[] = homework.map((row) => ({
          homeworkId: row.id,
          label: row.tool?.label ?? row.description,
          assignedAt: row.assigned_at.toISOString(),
          dueAt: row.due_at ? row.due_at.toISOString() : null,
          done:
            row.status === 'completed' ||
            row.last_completed_at !== null ||
            row.completions.length > 0,
          lastDoneAt:
            row.last_completed_at?.toISOString() ?? row.completions[0]?.completed_at.toISOString() ?? null,
          repeating: row.frequency !== null && row.frequency !== 'once',
        }));

        // One access-log row per read, naming what was read but not what it said.
        await logClinicalAccess(
          ctx.db,
          ctx.therapistId,
          input.clientId,
          `shared_items_read:${items.length}`,
        );

        return { items, patterns, assignments };
      },
    ),
});
