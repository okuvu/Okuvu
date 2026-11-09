import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { isShareableKind, type PastMeFilter, type PastMeItem, type ToolkitItem } from '@okuvu/shared-types/sharing';

const MAX_TIMELINE = 200;
const EXCERPT_CHARS = 180;

interface ExportBody {
  // No body: GET is the download. Declared so Fastify does not infer `never`.
}

function firstAnswerText(answers: unknown): string {
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) return '';
  for (const value of Object.values(answers as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (Array.isArray(value)) {
      const joined = value.filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(', ');
      if (joined.length > 0) return joined;
    }
  }
  return '';
}

function excerpt(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > EXCERPT_CHARS ? `${clean.slice(0, EXCERPT_CHARS - 1)}…` : clean;
}

/**
 * The client's own space: what helped, what they wrote before, and their data.
 *
 * Every procedure here is scoped to the authenticated client's `user_id`; there
 * is no client id in any input, so this router cannot be pointed at someone
 * else's writing. Nothing here is a therapist surface.
 */
export async function mySpaceRoute(app: FastifyInstance): Promise<void> {
  /** GET /toolkit — exercises the client marked as helping. */
  app.get('/toolkit', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      const helped = await prisma.worksheetResponse.findMany({
        where: { user_id: user.id, helped: true },
        orderBy: { completed_at: 'desc' },
        take: 500,
        select: {
          worksheet_id: true,
          completed_at: true,
          worksheet: { select: { label: true, summary: true } },
        },
      });

      const byTool = new Map<string, ToolkitItem>();
      for (const row of helped) {
        const existing = byTool.get(row.worksheet_id);
        if (existing) {
          existing.timesHelpful += 1;
          continue;
        }
        byTool.set(row.worksheet_id, {
          toolId: row.worksheet_id,
          label: row.worksheet?.label ?? 'An exercise',
          summary: row.worksheet?.summary ?? null,
          timesHelpful: 1,
          lastHelpedAt: row.completed_at.toISOString(),
        });
      }

      return reply.send({ items: [...byTool.values()] });
    },
  });

  /**
   * GET /past-me — the client's own writing in one timeline.
   *
   * Journal entries and worksheet answers, newest first, optionally filtered to
   * one exercise. This is the "has my thinking changed?" view: it reads only
   * the client's rows and never touches chat, which is a different surface with
   * its own approval rule.
   */
  app.get<{ Querystring: { toolId?: string; limit?: string } }>('/past-me', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      const filter = typeof request.query.toolId === 'string' ? request.query.toolId : null;
      const parsedLimit = Number(request.query.limit ?? MAX_TIMELINE);
      const limit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(Math.trunc(parsedLimit), 1), MAX_TIMELINE)
        : MAX_TIMELINE;

      const journalOnly = filter === 'journal_entry';
      const worksheetFilter = filter && !journalOnly ? filter : null;

      const [journalRows, worksheetRows, worksheetCounts, journalCount] = await Promise.all([
        filter && !journalOnly
          ? Promise.resolve([])
          : prisma.journalEntry.findMany({
              where: { user_id: user.id },
              orderBy: { created_at: 'desc' },
              take: limit,
              select: {
                id: true,
                content: true,
                created_at: true,
                shared_with_therapist: true,
              },
            }),
        filter === 'journal_entry'
          ? Promise.resolve([])
          : prisma.worksheetResponse.findMany({
              where: {
                user_id: user.id,
                ...(worksheetFilter ? { worksheet_id: worksheetFilter } : {}),
              },
              orderBy: { completed_at: 'desc' },
              take: limit,
              select: {
                id: true,
                worksheet_id: true,
                answers: true,
                completed_at: true,
                shared_with_therapist: true,
                feeling_before: true,
                feeling_after: true,
                worksheet: { select: { label: true } },
              },
            }),
        prisma.worksheetResponse.groupBy({
          by: ['worksheet_id'],
          where: { user_id: user.id },
          _count: { _all: true },
        }),
        prisma.journalEntry.count({ where: { user_id: user.id } }),
      ]);

      const items: PastMeItem[] = [
        ...journalRows.map((row) => ({
          kind: 'journal_entry' as const,
          id: row.id,
          at: row.created_at.toISOString(),
          toolId: null,
          toolLabel: null,
          excerpt: excerpt(row.content),
          shared: row.shared_with_therapist,
          feelingBefore: null,
          feelingAfter: null,
        })),
        ...worksheetRows.map((row) => ({
          kind: 'worksheet_response' as const,
          id: row.id,
          at: row.completed_at.toISOString(),
          toolId: row.worksheet_id,
          toolLabel: row.worksheet?.label ?? null,
          excerpt: excerpt(firstAnswerText(row.answers)),
          shared: row.shared_with_therapist,
          feelingBefore: row.feeling_before,
          feelingAfter: row.feeling_after,
        })),
      ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

      // The filter chips are built from what the client actually wrote, not
      // from the catalogue: an exercise they never used is not a filter.
      const filters: PastMeFilter[] = [
        { toolId: null, label: 'Everything', count: journalCount + worksheetCounts.reduce((sum, row) => sum + row._count._all, 0) },
      ];
      if (journalCount > 0) {
        filters.push({ toolId: 'journal_entry', label: 'Journal', count: journalCount });
      }
      const labels = new Map(
        worksheetRows.map((row) => [row.worksheet_id, row.worksheet?.label ?? row.worksheet_id] as const),
      );
      for (const row of worksheetCounts) {
        filters.push({
          toolId: row.worksheet_id,
          label: labels.get(row.worksheet_id) ?? row.worksheet_id,
          count: row._count._all,
        });
      }

      return reply.send({ items: items.slice(0, limit), filters });
    },
  });

  /**
   * GET /me/export — everything the client wrote, as one JSON document.
   *
   * Deliberately a read of their own rows only. The app offers it under
   * Settings; this is the download, not a therapist report.
   */
  app.get('/me/export', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      const [journalEntries, worksheetResponses, treasureNotes] = await Promise.all([
        prisma.journalEntry.findMany({
          where: { user_id: user.id },
          orderBy: { created_at: 'asc' },
          select: {
            id: true,
            emotion: true,
            intensity: true,
            content: true,
            created_at: true,
            shared_with_therapist: true,
          },
        }),
        prisma.worksheetResponse.findMany({
          where: { user_id: user.id },
          orderBy: { completed_at: 'asc' },
          select: {
            id: true,
            worksheet_id: true,
            answers: true,
            feeling_before: true,
            feeling_after: true,
            barriers: true,
            helped: true,
            completed_at: true,
            shared_with_therapist: true,
            worksheet: { select: { label: true } },
          },
        }),
        prisma.treasureNote.findMany({
          where: { user_id: user.id },
          orderBy: { created_at: 'asc' },
          select: {
            id: true,
            title: true,
            body: true,
            source: true,
            created_at: true,
            shared_with_therapist: true,
          },
        }),
      ]);

      const generatedAt = new Date().toISOString();

      return reply.send({
        generatedAt,
        journalEntries: journalEntries.map((row) => ({
          ...row,
          created_at: row.created_at.toISOString(),
        })),
        worksheetResponses: worksheetResponses.map((row) => ({
          ...row,
          label: row.worksheet?.label ?? null,
          worksheet: undefined,
          completed_at: row.completed_at.toISOString(),
        })),
        treasureNotes: treasureNotes.map((row) => ({
          ...row,
          created_at: row.created_at.toISOString(),
        })),
      });
    },
  });

  /**
   * DELETE /me/items/:kind/:id — delete one of the client's own entries/notes.
   *
   * "Deleting removes it everywhere" is a property of the schema, not of a
   * cleanup job: the portal reads the same row, so the row disappearing is the
   * removal. Safety flags are kept — they hold no text, and "a check fired here
   * on this date" is an incident record, not the client's writing.
   */
  app.delete<{ Params: { kind: string; id: string } }>('/me/items/:kind/:id', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { kind, id } = request.params;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      if (!isShareableKind(kind)) {
        return reply.status(400).send({
          error: { code: 'INVALID_KIND', message: 'Unknown item kind' },
        });
      }

      const where = { id, user_id: user.id };

      if (kind === 'journal_entry') {
        const result = await prisma.journalEntry.deleteMany({ where });
        return result.count > 0
          ? reply.send({ deleted: true })
          : reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'That item is not yours.' } });
      }
      if (kind === 'worksheet_response') {
        const result = await prisma.worksheetResponse.deleteMany({ where });
        return result.count > 0
          ? reply.send({ deleted: true })
          : reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'That item is not yours.' } });
      }

      const result = await prisma.treasureNote.deleteMany({ where });
      return result.count > 0
        ? reply.send({ deleted: true })
        : reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'That item is not yours.' } });
    },
  });
}
