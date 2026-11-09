import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { toClientWorksheetView, type WorksheetRegistryRow } from '../lib/worksheet-content.js';

/**
 * The client's Library.
 *
 * One list, one door. The approved exercises that already existed (grounding,
 * the four breathing techniques), the cards that open existing screens (mood
 * check-in) and the approved worksheets all come from the same catalogue table,
 * so the Library cannot drift from the portal's preview.
 *
 * What this route will not do, whatever the query string says:
 *
 *  - Serve a row that is not `approved`. Drafts, retired exercises and the
 *    hidden placeholders are filtered in the query itself, not in the response
 *    mapper, so they cannot leak through a missed field.
 *  - Serve Hinglish. The translations exist and are stored, but they are not
 *    approved yet; `HINGLISH_RELEASED` is the single switch, and until the owner
 *    approves them a `?lang=hi` request gets English and `hinglishAvailable:
 *    false`. Nothing on screen claims otherwise.
 *  - Serve therapist framing. `toClientWorksheetView` strips `therapistPrompt`
 *    from the body, and the row's `therapy_modality` / `therapist_note` are
 *    never read into the response at all.
 *
 * Who may open a worksheet is the row's `access_mode`:
 *   open       — any client.
 *   assigned   — only with an active assignment for that client (the same
 *                Homework row the portal creates).
 *   in_session — only once the plan exists; co-created in session, read-only
 *                for the client, never a form they fill in themselves.
 */
export const HINGLISH_RELEASED = false;

interface Card {
  toolId: string;
  label: string;
  summary: string | null;
  section: string | null;
  accessMode: string;
  loadLevel: string | null;
  estMinutes: number | null;
  kind: string;
  /** False when the client may see the card but not open it yet. */
  available: boolean;
}

const CARD_FIELDS = {
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
} as const;

export async function libraryRoute(app: FastifyInstance): Promise<void> {
  app.get('/library', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const [rows, assignments] = await Promise.all([
        prisma.toolRegistryEntry.findMany({
          where: {
            status: 'approved',
            kind: { in: ['worksheet', 'exercise', 'group'] },
            library_group: null,
          },
          orderBy: [{ section: 'asc' }, { sort_order: 'asc' }],
          select: CARD_FIELDS,
        }),
        prisma.homework.findMany({
          where: { client_user_id: user.id, status: 'active', tool_id: { not: null } },
          select: { tool_id: true },
        }),
      ]);

      const assigned = new Set(assignments.map((row) => row.tool_id));

      const cards: Card[] = rows.map((row) => ({
        toolId: row.tool_id,
        label: row.label,
        summary: row.summary,
        section: row.section,
        accessMode: row.access_mode,
        loadLevel: row.load_level,
        estMinutes: row.est_minutes,
        kind: row.kind,
        available: row.access_mode !== 'assigned' || assigned.has(row.tool_id),
      }));

      return reply.send({
        cards,
        hinglishAvailable: HINGLISH_RELEASED,
      });
    },
  });

  app.get('/library/:toolId', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { toolId } = request.params as { toolId: string };

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const row = await prisma.toolRegistryEntry.findUnique({
        where: { tool_id: toolId },
        select: {
          ...CARD_FIELDS,
          content_en: true,
          content_hi: true,
        },
      });

      // A row that is not approved does not exist as far as a client is
      // concerned: draft, retired and placeholder all answer the same way, so
      // the response cannot be used to discover what is coming.
      if (!row || row.status !== 'approved') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Not found' },
        });
      }

      if (row.access_mode === 'assigned') {
        const assignment = await prisma.homework.findFirst({
          where: { client_user_id: user.id, tool_id: toolId, status: 'active' },
          select: { id: true },
        });
        if (!assignment) {
          return reply.status(403).send({
            error: {
              code: 'NOT_ASSIGNED',
              message: 'Your therapist has not assigned this one.',
            },
          });
        }
      }

      if (row.access_mode === 'in_session') {
        // The safety plan is written with the therapist in session. The client
        // reads their own finished plan; they never open a blank one.
        const plan = await prisma.worksheetResponse.findFirst({
          where: { user_id: user.id, worksheet_id: toolId },
          select: { id: true },
        });
        if (!plan) {
          return reply.status(403).send({
            error: {
              code: 'NOT_CREATED_YET',
              message: 'You and your therapist fill this in together.',
            },
          });
        }
      }

      const view = toClientWorksheetView(row as unknown as WorksheetRegistryRow, 'en');

      const children =
        row.kind === 'group'
          ? await prisma.toolRegistryEntry.findMany({
              where: { library_group: toolId, status: 'approved' },
              orderBy: { sort_order: 'asc' },
              select: { tool_id: true, label: true, summary: true },
            })
          : [];

      return reply.send({
        toolId: view.toolId,
        label: view.label,
        summary: view.summary,
        section: view.section,
        accessMode: view.accessMode,
        loadLevel: view.loadLevel,
        estMinutes: view.estMinutes,
        kind: row.kind,
        content: view.content,
        children: children.map((child) => ({
          toolId: child.tool_id,
          label: child.label,
          summary: child.summary,
        })),
        hinglishAvailable: HINGLISH_RELEASED,
      });
    },
  });
}
