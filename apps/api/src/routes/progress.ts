import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { getISTDateString } from '../lib/session-limits.js';

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
    preHandler: [verifyFirebaseJWT],
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

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const dateIst = getISTDateString();

      await prisma.moodLog.upsert({
        where: {
          user_id_date_ist: {
            user_id: user.id,
            date_ist: dateIst,
          },
        },
        create: {
          user_id: user.id,
          mood_value,
          date_ist: dateIst,
          source: 'user_input',
        },
        update: {
          mood_value,
          source: 'user_input',
        },
      });

      request.log.info(
        { event: 'mood_checkin', user_id: user.id, date: dateIst, mood_value },
        'Mood check-in recorded',
      );

      reply.send({
        success: true,
        date: dateIst,
        mood_value,
      });
    },
  });

  app.get<{ Querystring: MoodQuery }>('/progress/mood', {
    preHandler: [verifyFirebaseJWT],
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

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const todayStr = getISTDateString();
      const today = new Date(todayStr + 'T00:00:00.000Z');
      const start = new Date(today.getTime() - (days - 1) * 86_400_000);

      const entries = await prisma.moodLog.findMany({
        where: {
          user_id: user.id,
          date_ist: { gte: start, lte: today },
        },
        orderBy: { date_ist: 'asc' },
        select: {
          date_ist: true,
          mood_value: true,
        },
      });

      reply.send({
        entries: entries.map(e => ({
          date: e.date_ist.toISOString().split('T')[0],
          mood_value: e.mood_value,
        })),
      });
    },
  });
}
