import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, therapistProcedure } from '../trpc';
import {
  InvalidWorksheetError,
  parseWorksheetRow,
  worksheetRowProblems,
  type WorksheetRegistryRow,
} from '@okuvu/shared-types/worksheet';

/**
 * Worksheet preview for therapists.
 *
 * The input is a catalogue id, not a client id: previewing a worksheet is
 * reading approved copy, not reading a client's writing, so it is not gated on
 * assignment and writes no clinical access log. The moment a procedure returns
 * a client's answers it must be gated — those live in a different router.
 *
 * Drafts are previewable on purpose: the point of a preview is to check the
 * worksheet before it is approved. Invalid bodies are returned as `problems`
 * rather than thrown, so the therapist sees the same list a save would reject,
 * instead of an opaque 500.
 */
export const worksheetsRouter = router({
  list: therapistProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.toolRegistryEntry.findMany({
      where: { kind: 'worksheet' },
      orderBy: [{ section: 'asc' }, { sort_order: 'asc' }, { label: 'asc' }],
      select: {
        tool_id: true,
        label: true,
        summary: true,
        section: true,
        therapy_modality: true,
        access_mode: true,
        load_level: true,
        est_minutes: true,
        status: true,
        approved_at: true,
        content_en: true,
        content_hi: true,
        kind: true,
      },
    });

    return rows.map((row) => {
      const problems = worksheetRowProblems(row as WorksheetRegistryRow);
      return {
        toolId: row.tool_id,
        label: row.label,
        summary: row.summary,
        section: row.section,
        modality: row.therapy_modality,
        accessMode: row.access_mode,
        loadLevel: row.load_level,
        estMinutes: row.est_minutes,
        status: row.status,
        hasHinglish: row.content_hi !== null && row.content_hi !== undefined,
        problemCount: problems.length,
      };
    });
  }),

  preview: therapistProcedure
    .input(z.object({ toolId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.toolRegistryEntry.findUnique({
        where: { tool_id: input.toolId },
        select: {
          tool_id: true,
          kind: true,
          status: true,
          label: true,
          summary: true,
          section: true,
          therapy_modality: true,
          access_mode: true,
          load_level: true,
          est_minutes: true,
          content_en: true,
          content_hi: true,
        },
      });

      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Worksheet not found' });
      if (row.kind !== 'worksheet') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That entry is an exercise, not a worksheet' });
      }

      const catalogueRow = row as WorksheetRegistryRow;
      const problems = worksheetRowProblems(catalogueRow);

      let content: unknown = null;
      let hingeContent: unknown = null;
      if (problems.length === 0) {
        try {
          const parsed = parseWorksheetRow(catalogueRow);
          content = parsed.english;
          hingeContent = parsed.hinglish;
        } catch (error) {
          if (error instanceof InvalidWorksheetError) {
            problems.push(...error.problems);
          } else {
            throw error;
          }
        }
      }

      return {
        toolId: row.tool_id,
        label: row.label,
        summary: row.summary,
        section: row.section,
        // Therapist-only, and this router is therapist-only: the field never
        // appears in a client response because a different door serves those.
        modality: row.therapy_modality,
        accessMode: row.access_mode,
        loadLevel: row.load_level,
        estMinutes: row.est_minutes,
        status: row.status,
        content,
        hingeContent,
        problems,
      };
    }),
});
