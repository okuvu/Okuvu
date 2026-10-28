import { FastifyInstance } from 'fastify';

// Route handlers
import { verifyCognitoJWT } from '../middleware/auth.js';
import { recordMoodCheckin, getMoodHistory } from '../lib/progress.js';

const MOOD_MIN = 1;
const MOOD_MAX = 5;
const DAYS_DEFAULT = 14;
const DAYS_MIN = 1;
const DAYS_MAX = 365;

interface MoodCheckinBody {
  mood_value: number;
}

interface MoodQuery {
  days?: string;
}

export async function progressRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: MoodCheckinBody }>('/progress/mood/checkin', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { mood_value } = request.body;

      if (
        typeof mood_value !== 'number' ||
        !Number.isInteger(mood_value) ||
        mood_value < MOOD_MIN ||
        mood_value > MOOD_MAX
      ) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_MOOD_VALUE',
            message: `mood_value must be an integer between ${MOOD_MIN} and ${MOOD_MAX}`,
          },
        });
      }

      const result = await recordMoodCheckin(uid, mood_value, request.log);

      if (result.status === 'user_not_found') {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      reply.send({
        success: true,
        date: result.dateIst,
        mood_value,
      });
    },
  });

  app.get<{ Querystring: MoodQuery }>('/progress/mood', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const daysParam = request.query.days;
      let days = DAYS_DEFAULT;

      if (daysParam !== undefined) {
        days = parseInt(daysParam, 10);
        if (isNaN(days) || !Number.isInteger(days) || days < DAYS_MIN || days > DAYS_MAX) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_DAYS',
              message: `days must be an integer between ${DAYS_MIN} and ${DAYS_MAX}`,
            },
          });
        }
      }

      const result = await getMoodHistory(uid, days);

      if (result.status === 'user_not_found') {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      reply.send({ entries: result.entries });
    },
  });
}
