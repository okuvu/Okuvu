import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { HELPLINES, SAFETY_PLAN_TOOL_ID } from '@okuvu/shared-types/safety';
import { parseWorksheetRow, worksheetRowProblems, type WorksheetRegistryRow } from '@okuvu/shared-types/worksheet';
import { router, therapistProcedure, isBypassEnabled, logClinicalAccess } from '../trpc';
import { draftToAnswers, hasContent } from '../../lib/safety-plan-form';

const MAX_PART_CHARS = 4_000;
const MAX_CONTACT_CHARS = 400;

/**
 * Explicit result shapes.
 *
 * Not cosmetic: without them tRPC infers the procedure type from the catalogue's
 * `WorksheetField` union plus Prisma's `Json` column, and the client component's
 * `useMutation`/`useQuery` fails to compile with TS2589 ("type instantiation is
 * excessively deep"). Naming the two shapes the page actually reads keeps the
 * inference shallow — and keeps the page from depending on catalogue internals.
 */
interface EditorPart {
  id: string;
  type: string;
  prompt: string;
  therapistPrompt: string | null;
  columns: string[];
}

interface EditorView {
  toolId: string;
  label: string;
  intro: string | null;
  parts: EditorPart[];
  answers: unknown;
  therapistContact: string | null;
  exists: boolean;
  updatedAt: string | null;
  helplines: readonly { key: string; name: string; description: string; phone: string; display: string }[];
}

interface SaveResult {
  saved: true;
  created: boolean;
  updatedAt: string;
}

/**
 * The safety plan editor (Step 4).
 *
 * One rule shapes every procedure here: only the client's own linked therapist
 * may read or write the plan. "Linked" means a live `TherapistClient` row —
 * `ended_at: null` — not merely an assignment that once existed, and not any
 * therapist on the roster. A plan names the people a client would call in a
 * crisis; a stale link is not permission to read it, let alone rewrite it.
 *
 * The seven parts and their wording are the approved catalogue body. This
 * router never composes copy: it carries the therapist's prompts and the
 * client's own words, and the crisis numbers beside them come from the central
 * helpline list at render time, so a retired number cannot be typed into a plan.
 */
export const safetyPlanRouter = router({
  get: therapistProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<EditorView> => {
      await assertLiveLink(ctx.db, ctx.therapistId, input.clientId);

      const [row, plan] = await Promise.all([
        ctx.db.toolRegistryEntry.findUnique({
          where: { tool_id: SAFETY_PLAN_TOOL_ID },
          select: {
            tool_id: true,
            kind: true,
            status: true,
            label: true,
            summary: true,
            section: true,
            access_mode: true,
            load_level: true,
            est_minutes: true,
            library_group: true,
            content_en: true,
            content_hi: true,
            therapy_modality: true,
            therapist_note: true,
          },
        }),
        ctx.db.safetyPlan.findUnique({
          where: { user_id: input.clientId },
          select: { answers: true, therapist_contact: true, created_at: true, updated_at: true },
        }),
      ]);

      if (!row || row.status !== 'approved') {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'The safety plan worksheet is missing from the catalogue.',
        });
      }

      const problems = worksheetRowProblems(row as WorksheetRegistryRow);
      if (problems.length > 0) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `The safety plan worksheet fails its own rules: ${problems[0]}`,
        });
      }

      const parsed = parseWorksheetRow(row as WorksheetRegistryRow);
      const english = parsed.english;

      if (!isBypassEnabled()) {
        await logClinicalAccess(ctx.db, ctx.therapistId, input.clientId, 'VIEW_SAFETY_PLAN');
      }

      return {
        toolId: row.tool_id,
        label: row.label,
        intro: english.intro ?? null,
        parts: english.fields.map((field) => ({
          id: field.id,
          type: field.type,
          prompt: field.prompt,
          therapistPrompt: 'therapistPrompt' in field ? (field.therapistPrompt ?? null) : null,
          columns: 'columns' in field && field.columns ? field.columns.map((c) => c.label) : [],
        })),
        answers: plan?.answers ?? null,
        therapistContact: plan?.therapist_contact ?? null,
        exists: plan !== null,
        updatedAt: plan?.updated_at.toISOString() ?? null,
        helplines: HELPLINES,
      };
    }),

  save: therapistProcedure
    .input(
      z.object({
        clientId: z.string().min(1),
        // The editor sends the textarea text per part, not a nested answer
        // object: one bounded shape, converted to the catalogue's answer shape
        // in this one place (`lib/safety-plan-form`), so the page and the router
        // cannot disagree about rows and columns.
        parts: z.array(z.object({ id: z.string().min(1), text: z.string().max(MAX_PART_CHARS * 4) })),
        therapistContact: z.string().max(MAX_CONTACT_CHARS).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<SaveResult> => {
      await assertLiveLink(ctx.db, ctx.therapistId, input.clientId);

      const row = await ctx.db.toolRegistryEntry.findUnique({
        where: { tool_id: SAFETY_PLAN_TOOL_ID },
        select: {
          tool_id: true,
          kind: true,
          status: true,
          label: true,
          summary: true,
          section: true,
          access_mode: true,
          load_level: true,
          est_minutes: true,
          library_group: true,
          content_en: true,
          content_hi: true,
          therapy_modality: true,
          therapist_note: true,
        },
      });

      if (!row || row.status !== 'approved') {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'The safety plan worksheet is missing from the catalogue.',
        });
      }

      const parsed = parseWorksheetRow(row as WorksheetRegistryRow);
      const fieldIds = new Set(parsed.english.fields.map((f) => f.id));

      for (const part of input.parts) {
        if (!fieldIds.has(part.id)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `The safety plan has no part called "${part.id}".`,
          });
        }
      }

      const drafts: Record<string, string> = {};
      for (const part of input.parts) drafts[part.id] = part.text;

      const answers = draftToAnswers(parsed.english.fields, drafts);

      if (!hasContent(answers)) {
        // An empty plan is not a plan: saving one would make the client's card
        // appear for a page with nothing on it.
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Fill in at least one part before saving the plan.',
        });
      }

      const contact = input.therapistContact?.trim() ?? '';
      const now = new Date();

      const existing = await ctx.db.safetyPlan.findUnique({
        where: { user_id: input.clientId },
        select: { id: true },
      });

      const saved = existing
        ? await ctx.db.safetyPlan.update({
            where: { user_id: input.clientId },
            data: {
              answers: answers as object,
              therapist_contact: contact.length > 0 ? contact : null,
              updated_by_therapist_id: ctx.therapistId,
            },
            select: { updated_at: true },
          })
        : await ctx.db.safetyPlan.create({
            data: {
              user_id: input.clientId,
              answers: answers as object,
              therapist_contact: contact.length > 0 ? contact : null,
              created_by_therapist_id: ctx.therapistId,
            },
            select: { updated_at: true },
          });

      if (!isBypassEnabled()) {
        await logClinicalAccess(
          ctx.db,
          ctx.therapistId,
          input.clientId,
          existing ? 'UPDATE_SAFETY_PLAN' : 'CREATE_SAFETY_PLAN',
        );
      }

      return {
        saved: true as const,
        created: !existing,
        updatedAt: (saved.updated_at ?? now).toISOString(),
      };
    }),
});

/** A linked therapist: the assignment exists AND has not ended. */
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
