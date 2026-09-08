import { FastifyInstance } from 'fastify';
import type { CreateJournalEntryBody } from '@okuvu/shared-types';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const VALID_EMOTIONS = ['anxious', 'sad', 'angry', 'overwhelmed', 'numb', 'calm', 'hopeful', 'other'] as const;
const INTENSITY_MIN = 1;
const INTENSITY_MAX = 5;
const MAX_ENTRIES = 30;

export async function journalRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateJournalEntryBody }>('/journal', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { emotion, intensity, content } = request.body;

      if (typeof emotion !== 'string' || !VALID_EMOTIONS.includes(emotion as typeof VALID_EMOTIONS[number])) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_EMOTION',
            message: `emotion must be one of: ${VALID_EMOTIONS.join(', ')}`,
          },
        });
      }

      if (typeof intensity !== 'number' || !Number.isInteger(intensity) || intensity < INTENSITY_MIN || intensity > INTENSITY_MAX) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_INTENSITY',
            message: `intensity must be an integer between ${INTENSITY_MIN} and ${INTENSITY_MAX}`,
          },
        });
      }

      if (typeof content !== 'string' || content.trim().length === 0) {
        return reply.status(400).send({
          error: {
            code: 'EMPTY_CONTENT',
            message: 'content must be a non-empty string',
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

      const entry = await prisma.journalEntry.create({
        data: {
          user_id: user.id,
          emotion,
          intensity,
          content: content.trim(),
        },
        select: { id: true },
      });

      request.log.info(
        { event: 'journal_entry_created', user_id: user.id, emotion, intensity },
        'Journal entry created',
      );

      return reply.code(201).send({
        success: true,
        id: entry.id,
      });
    },
  });

  app.get('/journal', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const entries = await prisma.journalEntry.findMany({
        where: { user_id: user.id },
        orderBy: { created_at: 'desc' },
        take: MAX_ENTRIES,
        select: {
          id: true,
          emotion: true,
          intensity: true,
          content: true,
          created_at: true,
        },
      });

      request.log.info(
        { event: 'journal_entries_read', user_id: user.id, count: entries.length },
        'Journal entries read',
      );

      reply.send({
        entries: entries.map(e => ({
          id: e.id,
          emotion: e.emotion,
          intensity: e.intensity,
          content: e.content,
          created_at: e.created_at.toISOString(),
        })),
      });
    },
  });
}
