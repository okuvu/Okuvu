import { FastifyInstance } from 'fastify';

// Auth, DB, date helpers
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { getISTDateString } from '../lib/session-limits.js';

const MOOD_MIN = 1;
const MOOD_MAX = 5;

interface MoodCheckinBody {
  mood_value: number;
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
}
