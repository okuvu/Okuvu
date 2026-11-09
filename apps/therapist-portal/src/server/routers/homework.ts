import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@okuvu/prisma';
import { entryById } from '@okuvu/shared-types/worksheets';
import {
  assertClientAssigned,
  logClinicalAccess,
  router,
  therapistMutation,
  therapistProcedure,
} from '../trpc';
import { notifyHomeworkAssigned } from '../notifications';

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_PERSONAL_NOTE_LENGTH = 500;
const MAX_PRIVATE_NOTE_LENGTH = 2000;

/**
 * The same vocabulary as `Reminder.frequency`, so the portal has one word for a
 * schedule. `once` means "one-off, closes when done"; every `*_daily` value
 * repeats: the client marks today done and it comes back on its next due day.
 */
const ASSIGNMENT_FREQUENCIES = [
  'once',
  'once_daily',
  'twice_daily',
  'thrice_daily',
  'as_needed',
] as const;

/**
 * Only an approved catalogue row may be assigned.
 *
 * Checked against the registry (the database is what an assignment points at)
 * and, where the catalogue knows the id, against the catalogue too. A
 * `placeholder` is a name with no body, so assigning one would put "Energy
 * audit" on a client's screen with nothing behind it; a retired row is refused
 * for the same reason (`guided_breathing` must never be assignable while its
 * old links keep resolving).
 */
async function loadAssignableTool(
  db: PrismaClient,
  toolId: string,
): Promise<{ label: string }> {
  const tool = await db.toolRegistryEntry.findUnique({
    where: { tool_id: toolId },
    select: { tool_id: true, label: true, status: true, kind: true },
  });

  const catalogueEntry = entryById(toolId);

  if (!tool) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Tool not found' });
  }

  if (
    tool.status !== 'approved' ||
    tool.kind === 'placeholder' ||
    catalogueEntry?.status === 'placeholder'
  ) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'That exercise is not approved, so it cannot be assigned.',
    });
  }

  return { label: tool.label };
}

/**
 * The goal this assignment serves, copied into `therapy_goal`.
 *
 * Copied rather than joined, because the assignment has to keep meaning what it
 * meant when it was made: editing a goal's wording later must not rewrite what
 * the client was asked to do. A goal belonging to another therapist, or to
 * another client, is not found — the same answer an unknown id gets, so an id
 * cannot be probed.
 */
async function resolveGoalText(
  db: PrismaClient,
  therapistId: string,
  clientUserId: string,
  goalId: string | undefined,
): Promise<string | undefined> {
  if (!goalId) return undefined;

  const goal = await db.clientGoal.findFirst({
    where: { id: goalId, therapist_id: therapistId, client_user_id: clientUserId },
    select: { text: true },
  });

  if (!goal) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Goal not found' });
  }

  return goal.text;
}

function parseDueAt(dueAt: string | undefined): Date | undefined {
  if (!dueAt) return undefined;
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Due date is not a date.' });
  }
  return parsed;
}

/**
 * Everything an assignment carries besides the exercise itself (owner's Step 8):
 * a personal line in the client's own words, how often, a due date, a linked
 * goal, and a private note the client never sees.
 */
const assignmentDetail = {
  personalNote: z.string().trim().max(MAX_PERSONAL_NOTE_LENGTH).optional(),
  frequency: z.enum(ASSIGNMENT_FREQUENCIES).optional(),
  dueAt: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  privateNote: z.string().trim().max(MAX_PRIVATE_NOTE_LENGTH).optional(),
} as const;

export const homeworkRouter = router({
  assign: therapistMutation
    .input(
      z.object({
        clientUserId: z.string().min(1),
        // Optional now: an exercise assignment takes its description from the
        // personal line, then the exercise's own label. Typed homework still
        // needs words, because the words are the whole assignment.
        description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
        // Optional link to an approved catalogue row, so the client app can
        // render this as a real, playable exercise rather than just prose.
        toolId: z.string().min(1).optional(),
        ...assignmentDetail,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      if (!input.toolId && !input.description) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Write what the homework is, or pick an exercise from the Library.',
        });
      }

      await assertClientAssigned(db, therapistId, input.clientUserId);

      const tool = input.toolId ? await loadAssignableTool(db, input.toolId) : null;
      const therapyGoal = await resolveGoalText(db, therapistId, input.clientUserId, input.goalId);
      const dueAt = parseDueAt(input.dueAt);

      const description =
        input.description ??
        input.personalNote ??
        tool?.label ??
        'An exercise from your therapist';

      const homework = await db.homework.create({
        data: {
          therapist_id: therapistId,
          client_user_id: input.clientUserId,
          description,
          tool_id: input.toolId,
          personal_note: input.personalNote,
          frequency: input.frequency,
          due_at: dueAt,
          therapy_goal: therapyGoal,
          therapist_private_note: input.privateNote,
        },
        select: {
          id: true,
          status: true,
          assigned_at: true,
        },
      });

      // The client-facing half: without this the assignment sits in the table
      // until the client happens to open the app (see server/notifications.ts).
      // The notification carries the assignment's client-facing description,
      // never the private note.
      await notifyHomeworkAssigned(db, {
        clientUserId: input.clientUserId,
        homeworkId: homework.id,
        description,
      });

      return homework;
    }),

  /**
   * Assign every exercise in a saved set, in one go.
   *
   * One `Homework` row per exercise on purpose: each has its own completion, its
   * own Today-card turn and its own client-facing label. A set is a shortcut for
   * the therapist, not a new kind of record the client has to interpret. The
   * email is sent by the first row's notification and the daily cap silences the
   * rest, so assigning eight exercises is still at most one mail.
   */
  assignSet: therapistMutation
    .input(
      z.object({
        clientUserId: z.string().min(1),
        setId: z.string().min(1),
        ...assignmentDetail,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);

      // Scoped to this therapist: another therapist's set is not found, so its
      // existence cannot be probed by id.
      const set = await db.exerciseSet.findFirst({
        where: { id: input.setId, therapist_id: therapistId },
        select: {
          id: true,
          name: true,
          items: {
            orderBy: [{ sort_order: 'asc' }, { tool_id: 'asc' }],
            select: { tool_id: true },
          },
        },
      });

      if (!set) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Set not found' });
      }
      if (set.items.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That set has no exercises in it.' });
      }

      // Re-checked at assign time, not trusted from creation: an exercise can be
      // retired between saving a set and using it. The whole assign fails rather
      // than half-assigning a set the therapist cannot see the shape of.
      const tools = await db.toolRegistryEntry.findMany({
        where: { tool_id: { in: set.items.map((item) => item.tool_id) } },
        select: { tool_id: true, label: true, status: true, kind: true },
      });
      const byId = new Map(tools.map((tool) => [tool.tool_id, tool]));
      for (const item of set.items) {
        const tool = byId.get(item.tool_id);
        const catalogueEntry = entryById(item.tool_id);
        if (
          !tool ||
          tool.status !== 'approved' ||
          tool.kind === 'placeholder' ||
          catalogueEntry?.status === 'placeholder'
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `"${tool?.label ?? item.tool_id}" is no longer approved, so this set cannot be assigned. Edit the set first.`,
          });
        }
      }

      const therapyGoal = await resolveGoalText(db, therapistId, input.clientUserId, input.goalId);
      const dueAt = parseDueAt(input.dueAt);

      const created: string[] = [];
      for (const item of set.items) {
        const tool = byId.get(item.tool_id)!;
        const homework = await db.homework.create({
          data: {
            therapist_id: therapistId,
            client_user_id: input.clientUserId,
            description: input.personalNote ?? tool.label,
            tool_id: item.tool_id,
            personal_note: input.personalNote,
            frequency: input.frequency ?? 'once',
            due_at: dueAt,
            therapy_goal: therapyGoal,
            therapist_private_note: input.privateNote,
          },
          select: { id: true },
        });
        created.push(homework.id);

        await notifyHomeworkAssigned(db, {
          clientUserId: input.clientUserId,
          homeworkId: homework.id,
          description: input.personalNote ?? tool.label,
        });
      }

      return { setId: set.id, setName: set.name, homeworkIds: created };
    }),

  listHomework: therapistProcedure
    .input(
      z.object({
        clientId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientId);
      await logClinicalAccess(db, therapistId, input.clientId, 'VIEW_HOMEWORK');

      const homework = await db.homework.findMany({
        where: {
          therapist_id: therapistId,
          client_user_id: input.clientId,
        },
        orderBy: {
          assigned_at: 'desc',
        },
        select: {
          id: true,
          description: true,
          status: true,
          assigned_at: true,
          updated_at: true,
          personal_note: true,
          frequency: true,
          due_at: true,
          therapy_goal: true,
          therapist_private_note: true,
          tool: { select: { tool_id: true, label: true } },
        },
      });

      return homework.map((h) => ({
        ...h,
        tool: h.tool ? { toolId: h.tool.tool_id, label: h.tool.label } : null,
      }));
    }),

  markCompleted: therapistMutation
    .input(
      z.object({
        homeworkId: z.string().min(1),
        clientId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientId);

      // Defense in depth beyond assertClientAssigned: only the therapist who
      // assigned this specific homework row (and only for the client it was
      // actually assigned to) may mark it completed — mirrors the ownership
      // check notes.ts relies on implicitly via its therapist_id-scoped
      // findMany, made explicit here since this is an update by id.
      const existing = await db.homework.findUnique({
        where: { id: input.homeworkId },
        select: { therapist_id: true, client_user_id: true },
      });
      if (
        !existing ||
        existing.therapist_id !== therapistId ||
        existing.client_user_id !== input.clientId
      ) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Homework item not found' });
      }

      const homework = await db.homework.update({
        where: { id: input.homeworkId },
        data: { status: 'completed' },
        select: {
          id: true,
          status: true,
          updated_at: true,
        },
      });

      return homework;
    }),
});
