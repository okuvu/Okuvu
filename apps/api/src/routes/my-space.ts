import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { isShareableKind, type PastMeFilter, type PastMeItem, type ToolkitItem } from '@okuvu/shared-types/sharing';
import { entryById } from '@okuvu/shared-types/worksheets';
import type { WorksheetAnswerValue, WorksheetField } from '@okuvu/shared-types/worksheet';
import { sourceLabel } from '../lib/treasure-source.js';

/**
 * Clients read this document on a phone, so it is written as one — plain text,
 * blank lines between items, no JSON, no field names only an engineer would
 * recognise. Times are IST because that is the day boundary the app already
 * uses for the Today card.
 */
const IST_OFFSET_MINUTES = 330;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function istParts(date: Date): { day: number; month: number; year: number; hour: number; minute: number } {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth(),
    year: shifted.getUTCFullYear(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function formatDate(date: Date): string {
  const { day, month, year } = istParts(date);
  return `${day} ${MONTHS[month]} ${year}`;
}

function formatDateTime(date: Date): string {
  const { day, month, year, hour, minute } = istParts(date);
  const suffix = hour < 12 ? 'am' : 'pm';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${day} ${MONTHS[month]} ${year}, ${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** One answer value as readable lines, indented under its question. */
function answerLines(value: WorksheetAnswerValue | undefined, field?: WorksheetField): string[] {
  if (value === undefined || value === null || value === '') return [];

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((line) => `    ${line.trim()}`)
      .filter((line) => line.trim().length > 0);
  }

  if (typeof value === 'number') return [`    ${value}`];

  if (Array.isArray(value)) {
    const lines: string[] = [];
    for (const item of value) {
      if (typeof item === 'string') {
        if (item.trim().length > 0) lines.push(`    ${item.trim()}`);
        continue;
      }
      if (typeof item === 'number') {
        lines.push(`    ${item}`);
        continue;
      }
      if (typeof item === 'object' && item !== null) {
        // A row list: label each cell with its column heading.
        const columns = field && field.type === 'row_list' ? field.columns : [];
        const cells = Object.entries(item as Record<string, string | number>)
          .filter(([, cell]) => `${cell}`.trim().length > 0)
          .map(([key, cell]) => {
            const column = columns.find((candidate) => candidate.id === key);
            return column ? `${column.label}: ${cell}` : `${cell}`;
          });
        if (cells.length > 0) lines.push(`    • ${cells.join(' · ')}`);
      }
    }
    return lines;
  }

  if (typeof value === 'object' && 'picked' in value) {
    const picked = value.picked ?? [];
    const strength = value.strength ?? {};
    const labels = picked.map((id) => {
      const feeling = field && field.type === 'feelings_picker'
        ? field.feelings.find((candidate) => candidate.id === id)
        : undefined;
      const rating = strength[id];
      return rating === undefined ? (feeling?.label ?? id) : `${feeling?.label ?? id} (${rating}/10)`;
    });
    return labels.length > 0 ? [`    ${labels.join(', ')}`] : [];
  }

  return [];
}

/** The answers block of one worksheet, in the order the worksheet asked. */
function worksheetAnswerLines(answers: unknown, toolId: string): string[] {
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) return [];
  const record = answers as Record<string, WorksheetAnswerValue>;
  const entry = entryById(toolId);
  const fields: WorksheetField[] = entry?.content_en?.fields ?? [];

  const lines: string[] = [];

  if (fields.length === 0) {
    // No catalogue row (a retired or unknown exercise): still show the words,
    // under their field ids rather than losing them.
    for (const [key, value] of Object.entries(record)) {
      const block = answerLines(value);
      if (block.length === 0) continue;
      lines.push(`${key}:`, ...block, '');
    }
    return lines;
  }

  for (const field of fields) {
    const block = answerLines(record[field.id], field);
    if (block.length === 0) continue;
    lines.push(`${oneLine(field.prompt)}`, ...block, '');
  }

  // An answer the current content no longer has a question for (copy changed
  // between the save and the download) is still the client's writing.
  const known = new Set(fields.map((field) => field.id));
  for (const [key, value] of Object.entries(record)) {
    if (known.has(key)) continue;
    const block = answerLines(value);
    if (block.length === 0) continue;
    lines.push(`${key}:`, ...block, '');
  }

  return lines;
}

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
   * GET /me/export/document — the same rows, written to be read.
   *
   * `GET /me/export` stays as the machine-readable copy (and the thing a DPDP
   * request is answered with); this is what the app's "Download my entries and
   * notes" button gets. One item per block, oldest first, with the three
   * headings the owner asked for: the date, which exercise it was, and whether
   * it is shared — plus the answers in the client's own words.
   */
  app.get('/me/export/document', {
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
            tags: true,
            created_at: true,
            shared_with_therapist: true,
          },
        }),
      ]);

      type Block = { at: Date; lines: string[] };
      const blocks: Block[] = [];
      const rule = '─'.repeat(58);

      for (const row of journalEntries) {
        const lines: string[] = [formatDateTime(row.created_at), 'Journal entry'];
        if (row.emotion) {
          lines.push(
            `Feeling: ${row.emotion}${row.intensity ? ` (${row.intensity} of 5)` : ''}`,
          );
        }
        lines.push(`Shared with my therapist: ${row.shared_with_therapist ? 'Yes' : 'No'}`, '');
        lines.push(...row.content.split('\n').map((line) => `    ${line}`.trimEnd()));
        blocks.push({ at: row.created_at, lines });
      }

      for (const row of worksheetResponses) {
        const label = row.worksheet?.label ?? 'Worksheet';
        const lines: string[] = [formatDateTime(row.completed_at), `Worksheet: ${label}`];
        const ratings = [
          row.feeling_before !== null ? `Before: ${row.feeling_before}/10` : null,
          row.feeling_after !== null ? `After: ${row.feeling_after}/10` : null,
        ].filter((part): part is string => part !== null);
        if (ratings.length > 0) lines.push(ratings.join(' · '));
        lines.push(`Shared with my therapist: ${row.shared_with_therapist ? 'Yes' : 'No'}`, '');

        const answers = worksheetAnswerLines(row.answers, row.worksheet_id);
        lines.push(...(answers.length > 0 ? answers : ['    (No answers were written.)']));
        blocks.push({ at: row.completed_at, lines });
      }

      for (const row of treasureNotes) {
        const lines: string[] = [
          formatDateTime(row.created_at),
          `Treasure Box: ${row.title ?? 'Note'}`,
          `Where it came from: ${sourceLabel(row.source)}`,
        ];
        if (row.tags.length > 0) lines.push(`Tags: ${row.tags.join(', ')}`);
        lines.push(`Shared with my therapist: ${row.shared_with_therapist ? 'Yes' : 'No'}`, '');
        lines.push(...row.body.split('\n').map((line) => `    ${line}`.trimEnd()));
        blocks.push({ at: row.created_at, lines });
      }

      blocks.sort((a, b) => a.at.getTime() - b.at.getTime());

      const generatedAt = new Date();
      const header = [
        'OKUVU — my entries and notes',
        `Downloaded on ${formatDate(generatedAt)} at ${formatDateTime(generatedAt).split(', ')[1]}`,
        '',
        'This is everything you have written in OKUVU: journal entries, worksheet answers',
        'and Treasure Box notes, oldest first. Each one says whether you shared it with your',
        'therapist. Downloading this does not change any of it.',
        '',
      ];

      const body =
        blocks.length === 0
          ? ['Nothing written yet. When you write a journal entry or fill in a worksheet, it will appear here.']
          : blocks.flatMap((block, index) => [
              ...(index > 0 ? [rule] : []),
              ...block.lines,
              '',
            ]);

      const document = [...header, rule, ...body].join('\n');
      const filename = `okuvu-my-entries-${generatedAt.toISOString().slice(0, 10)}.txt`;

      return reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(document);
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
