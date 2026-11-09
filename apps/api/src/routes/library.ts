import { FastifyInstance } from 'fastify';
import {
  DEMANDING_GATE_BUTTONS,
  DEMANDING_GATE_MESSAGE,
  DEMANDING_GATE_QUESTION,
  GROUNDING_TOOL_ID,
  SAFETY_PLAN_TOOL_ID,
  demandingGateBlocks,
} from '@okuvu/shared-types/safety';
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

      // ─── Step 4 — the safety plan is HIDDEN, not greyed out ────────────
      //
      // Owner's decision (9 Nov 2026, after Step 3): a card the client cannot
      // open yet is noise on a screen that is already asking a lot of them.
      // Until the therapist has made a plan with them, the card does not
      // exist — and neither does the route (GET /safety-plan answers
      // NOT_CREATED_YET, which the app never reaches because it has no card to
      // tap).
      const needsPlan = rows.some((row) => row.access_mode === 'in_session');
      const hasPlan = needsPlan
        ? (await prisma.safetyPlan.findUnique({
            where: { user_id: user.id },
            select: { id: true },
          })) !== null
        : false;

      const cards: Card[] = rows
        .filter((row) => row.access_mode !== 'in_session' || hasPlan)
        .map((row) => ({
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

      // The client's own active assignment for this exercise, if there is one.
      // Read once, for two things: the `assigned` gate, and the therapist's
      // personal line (Step 8) — a line written in the client's own words
      // ("when the 9am standup starts") belongs above the piece the therapist
      // marked, and it is the client's to see. The private note is not selected,
      // so it cannot be sent by mistake.
      const assignment = await prisma.homework.findFirst({
        where: { client_user_id: user.id, tool_id: toolId, status: 'active' },
        orderBy: { assigned_at: 'desc' },
        select: { id: true, personal_note: true },
      });

      if (row.access_mode === 'assigned') {
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
        // The safety plan is written with the therapist in the portal. The
        // Library card is hidden until a plan exists (see GET /library), so a
        // direct request for it before then answers exactly as an unknown id
        // does — there is nothing here to discover by guessing a URL.
        const plan = await prisma.safetyPlan.findUnique({
          where: { user_id: user.id },
          select: { id: true },
        });
        if (!plan) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: 'Not found' },
          });
        }
      }

      // ─── Step 4 — the demanding-worksheet gate ─────────────────────────
      //
      // Asked before the worksheet opens, and enforced here rather than only in
      // the app: the question is the gate, so a client who has not answered it
      // is not opened into the worksheet, and one above 5 out of 10 — or in a
      // crisis state — is offered grounding instead. The rating is echoed back
      // so the client's "before" rating is the answer they just gave.
      let feelingBefore: number | null = null;
      if (row.load_level === 'demanding') {
        const raw = (request.query as { feelingNow?: string } | undefined)?.feelingNow;
        const feelingNow = typeof raw === 'string' && /^\d{1,2}$/.test(raw) ? Number(raw) : null;

        if (feelingNow === null) {
          return reply.status(400).send({
            error: {
              code: 'FEELING_NOT_GIVEN',
              message: DEMANDING_GATE_QUESTION,
            },
          });
        }

        let current: string | null = null;
        try {
          const state = await prisma.safetyState.findUnique({
            where: { user_id: user.id },
            select: { safety_state_current: true },
          });
          current = state?.safety_state_current ?? null;
        } catch {
          // Unknown state: the gate below still refuses anything above 5.
          current = null;
        }

        if (demandingGateBlocks(feelingNow, current)) {
          return reply.status(403).send({
            error: {
              code: 'DEMANDING_GATE',
              message: DEMANDING_GATE_MESSAGE,
              buttons: DEMANDING_GATE_BUTTONS,
              groundingToolId: GROUNDING_TOOL_ID,
            },
          });
        }
        feelingBefore = feelingNow;
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
        // The rating the client gave at the gate, so submitting it stores the
        // "before" number they actually answered rather than asking twice.
        feelingBefore,
        // The therapist's line, written for this client, shown only where the
        // worksheet itself marks a therapistNote field. Null when this is a
        // self-serve exercise or a plain assignment with no line.
        personalNote: assignment?.personal_note ?? null,
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
