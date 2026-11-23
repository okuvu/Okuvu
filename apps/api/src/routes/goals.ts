import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import type { ClientGoalItem, GoalsListResponse } from '@okuvu/shared-types';

/**
 * GET /users/me/goals — the client's working goals, in the therapist's order.
 *
 * The clinical authority's rule (23 Nov 2026): the client and the therapist
 * should both be aware of the goals and work them one at a time. The portal
 * writes them and owns their order (`ClientGoal.position`); this is the read
 * half, and it is the only client-facing goal surface.
 *
 * Three deliberate choices:
 *
 *  - `active` and `achieved` only. A `dropped` goal is never sent: taking a
 *    goal off the plan is a clinical decision, and showing it as dropped turns
 *    that decision into a message the client did not ask for.
 *  - The list is scoped to the therapist the client is actually linked to right
 *    now (`ended_at: null`), the same live-link rule every other client read
 *    uses. Goals written by a previous therapist are not the client's current
 *    plan, and must not reappear after care with them has ended.
 *  - The focus goal is the first `active` one in position order — computed here
 *    rather than stored, so it cannot drift from the order the therapist set.
 *
 * The goal text is the therapist's own wording. The portal's guide asks for a
 * goal written in words they would read aloud to the client, and this route is
 * why: the client reads it verbatim. There is no separate client-safe field,
 * by the authority's decision.
 */
export async function goalsRoute(app: FastifyInstance): Promise<void> {
  app.get('/users/me/goals', {
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

      const link = await prisma.therapistClient.findFirst({
        where: { client_user_id: user.id, ended_at: null },
        orderBy: { created_at: 'desc' },
        select: { therapist_id: true },
      });

      if (!link) {
        const empty: GoalsListResponse = { goals: [], activeCount: 0 };
        return reply.send(empty);
      }

      const rows = await prisma.clientGoal.findMany({
        where: {
          therapist_id: link.therapist_id,
          client_user_id: user.id,
          status: { in: ['active', 'achieved'] },
        },
        orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
        select: { id: true, text: true, status: true },
      });

      let focusTaken = false;
      const goals: ClientGoalItem[] = rows.map((row) => {
        const isFocus = row.status === 'active' && !focusTaken;
        if (isFocus) focusTaken = true;
        return {
          id: row.id,
          text: row.text,
          // Anything that is not 'achieved' is being worked on; the query
          // already excluded 'dropped', so this narrows without inventing a
          // third state for the client.
          status: row.status === 'achieved' ? 'achieved' : 'active',
          isFocus,
        };
      });

      const response: GoalsListResponse = {
        goals,
        activeCount: goals.filter((goal) => goal.status === 'active').length,
      };

      return reply.send(response);
    },
  });
}
