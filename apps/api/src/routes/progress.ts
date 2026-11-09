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
  /**
   * The two screens added after the check-in. Optional so an older app build
   * keeps working: it sends only mood_value.
   */
  trigger?: string | null;
  intensity_0_10?: number | null;
}

const TRIGGER_MAX = 500;
const INTENSITY_MIN = 0;
const INTENSITY_MAX = 10;

interface MoodQuery {
  days?: string;
}

export async function progressRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: MoodCheckinBody }>('/progress/mood/checkin', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { mood_value, trigger, intensity_0_10 } = request.body ?? ({} as MoodCheckinBody);

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

      if (trigger !== undefined && trigger !== null) {
        if (typeof trigger !== 'string' || trigger.length > TRIGGER_MAX) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_TRIGGER',
              message: `trigger must be text of at most ${TRIGGER_MAX} characters`,
            },
          });
        }
      }

      if (intensity_0_10 !== undefined && intensity_0_10 !== null) {
        if (
          typeof intensity_0_10 !== 'number' ||
          !Number.isInteger(intensity_0_10) ||
          intensity_0_10 < INTENSITY_MIN ||
          intensity_0_10 > INTENSITY_MAX
        ) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_INTENSITY',
              message: `intensity_0_10 must be an integer between ${INTENSITY_MIN} and ${INTENSITY_MAX}`,
            },
          });
        }
      }

      const result = await recordMoodCheckin(uid, mood_value, request.log, {
        trigger: typeof trigger === 'string' ? trigger.trim() || null : undefined,
        intensity: typeof intensity_0_10 === 'number' ? intensity_0_10 : undefined,
      });

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
