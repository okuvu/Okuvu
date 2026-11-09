import { FastifyInstance } from 'fastify';
import { HELPLINES, SAFETY_PLAN_TOOL_ID } from '@okuvu/shared-types/safety';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { toClientWorksheetView, type WorksheetRegistryRow } from '../lib/worksheet-content.js';

/**
 * The client's safety plan, read-only.
 *
 * Written by the therapist in the portal, never by the client; this route is the
 * client's door to it and there is deliberately no client write. `GET /library`
 * hides the card entirely until a plan exists, so a client cannot open a blank
 * one and is not shown a card that would refuse them.
 *
 * The seven parts, their order and the client-visible wording come from the
 * approved catalogue body, stripped of therapist framing by
 * `toClientWorksheetView`. The crisis numbers in part 5 are read from the
 * central helpline list at request time — never stored on the plan — so a
 * number retired by clinical decision disappears from every plan at once.
 */
export async function safetyPlanRoute(app: FastifyInstance): Promise<void> {
  app.get('/safety-plan', {
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

      const plan = await prisma.safetyPlan.findUnique({
        where: { user_id: user.id },
        select: {
          answers: true,
          therapist_contact: true,
          created_at: true,
          updated_at: true,
        },
      });

      if (!plan) {
        return reply.status(404).send({
          error: {
            code: 'NOT_CREATED_YET',
            message: 'You and your therapist fill this in together.',
          },
        });
      }

      const row = await prisma.toolRegistryEntry.findUnique({
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
        // A plan exists but its definition does not: refuse rather than render
        // half a page from a body that is not servable.
        request.log.error({ event: 'safety_plan_definition_missing' });
        return reply.status(503).send({
          error: { code: 'PLAN_UNAVAILABLE', message: 'Your plan is not available right now.' },
        });
      }

      const view = toClientWorksheetView(row as unknown as WorksheetRegistryRow, 'en');

      return reply.send({
        toolId: view.toolId,
        label: view.label,
        intro: view.content.intro ?? null,
        parts: view.content.fields,
        answers: plan.answers,
        therapistContact: plan.therapist_contact,
        helplines: HELPLINES.map((line) => ({
          key: line.key,
          name: line.name,
          description: line.description,
          phone: line.phone,
          display: line.display,
        })),
        closing: { buttons: [{ label: 'Get help now', action: 'get_help' }] },
        updatedAt: plan.updated_at.toISOString(),
      });
    },
  });
}
