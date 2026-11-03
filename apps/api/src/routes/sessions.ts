import { FastifyInstance } from 'fastify';
import type { PastSessionSummary, SessionTranscript } from '@okuvu/shared-types';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { submitSrsScore } from '../lib/sessions.js';

interface SrsBody {
  srs_score: number;
}

// The Chat screen has always told the user "Your conversation will be saved."
// and Turn rows were in fact being written — but nothing could read them back,
// so the promise had no destination. These two routes are that destination:
// a list of past conversations, and one conversation's transcript.
//
// Only sessions that actually hold turns are listed: a session is opened the
// moment the Chat tab connects, so an abandoned open (app killed before the
// first message) would otherwise fill the list with empty entries that look
// like lost conversations.
const MAX_HISTORY_SESSIONS = 50;
const PREVIEW_CHARS = 140;
const HISTORY_DEFAULT_LIMIT = 20;

interface HistoryQuery {
  limit?: string;
}

export async function sessionRoute(app: FastifyInstance): Promise<void> {
  app.patch<{ Params: { id: string }; Body: SrsBody }>('/sessions/:id/srs', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { id } = request.params;
      const { srs_score } = request.body;

      if (srs_score == null || !Number.isInteger(srs_score) || srs_score < 1 || srs_score > 4) {
        return reply.status(400).send({
          error: {
            code: 'invalid_srs_score',
            message: 'srs_score must be an integer between 1 and 4',
          },
        });
      }

      const result = await submitSrsScore(uid, id, srs_score, request.log);

      switch (result.status) {
        case 'user_not_found':
          return reply.status(401).send({
            error: { code: 'UNAUTHORIZED', message: 'User not found' },
          });
        case 'session_not_found':
          return reply.status(404).send({
            error: { code: 'session_not_found' },
          });
        case 'forbidden':
          return reply.status(403).send({
            error: { code: 'forbidden' },
          });
        case 'session_still_active':
          return reply.status(409).send({
            error: {
              code: 'session_still_active',
              message: 'Session must be closed before submitting SRS.',
            },
          });
        case 'ok':
          return reply.send({ success: true });
      }
    },
  });

  // GET /sessions — the user's past conversations, newest first.
  app.get<{ Querystring: HistoryQuery }>('/sessions', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const rawLimit = request.query.limit;
      let limit = HISTORY_DEFAULT_LIMIT;

      if (rawLimit !== undefined) {
        limit = parseInt(rawLimit, 10);
        if (isNaN(limit) || !Number.isInteger(limit) || limit < 1 || limit > MAX_HISTORY_SESSIONS) {
          return reply.status(400).send({
            error: {
              code: 'invalid_limit',
              message: `limit must be an integer between 1 and ${MAX_HISTORY_SESSIONS}`,
            },
          });
        }
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const sessions = await prisma.sessionLog.findMany({
        where: { user_id: user.id, turn_count: { gt: 0 } },
        orderBy: { session_started_at: 'desc' },
        take: limit,
        select: {
          id: true,
          session_started_at: true,
          session_ended_at: true,
          turn_count: true,
          // How many bubbles the transcript actually holds. `turn_count` is a
          // count of user turns (each of which writes two rows), so the app
          // cannot derive the message count from it — a turn whose reply was
          // never persisted would be over-counted.
          _count: { select: { turns: true } },
          // The first thing the user said — enough to recognise the
          // conversation in a list without opening it. One turn only, so this
          // stays a single query rather than one per session.
          turns: {
            where: { role: 'user' },
            orderBy: { turn_number: 'asc' },
            take: 1,
            select: { content: true },
          },
        },
      });

      const body: { sessions: PastSessionSummary[] } = {
        sessions: sessions.map((s) => ({
          id: s.id,
          started_at: s.session_started_at.toISOString(),
          ended_at: s.session_ended_at ? s.session_ended_at.toISOString() : null,
          turn_count: s.turn_count,
          message_count: s._count.turns,
          preview: summarisePreview(s.turns[0]?.content),
        })),
      };

      request.log.info(
        { event: 'session_history_read', user_id: user.id, count: body.sessions.length },
        'Session history read',
      );

      reply.send(body);
    },
  });

  // GET /sessions/:id — one conversation, read back turn by turn.
  app.get<{ Params: { id: string } }>('/sessions/:id', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { id } = request.params;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      // findFirst with the owner in the WHERE clause, not findUnique-then-
      // compare: another user's session id must be indistinguishable from an
      // id that does not exist (404 both ways), or the endpoint becomes an
      // existence oracle over other people's conversations.
      const session = await prisma.sessionLog.findFirst({
        where: { id, user_id: user.id },
        select: {
          id: true,
          session_started_at: true,
          session_ended_at: true,
          turns: {
            where: { role: { in: ['user', 'assistant'] } },
            orderBy: { turn_number: 'asc' },
            select: { role: true, content: true, turn_number: true },
          },
        },
      });

      if (!session) {
        return reply.status(404).send({ error: { code: 'session_not_found' } });
      }

      const body: SessionTranscript = {
        id: session.id,
        started_at: session.session_started_at.toISOString(),
        ended_at: session.session_ended_at ? session.session_ended_at.toISOString() : null,
        turns: session.turns.map((t) => ({
          role: t.role === 'assistant' ? 'assistant' : 'user',
          content: t.content,
          turn_number: t.turn_number,
        })),
      };

      reply.send(body);
    },
  });
}

/** First user turn, flattened to one line and trimmed to a list-sized preview. */
function summarisePreview(content: string | undefined): string | null {
  if (!content) return null;
  const flat = content.replace(/\s+/g, ' ').trim();
  if (flat.length === 0) return null;
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS - 1)}…` : flat;
}
