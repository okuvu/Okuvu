import { FastifyInstance } from 'fastify';
import type { CreateJournalEntryBody } from '@okuvu/shared-types';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { generateJournalPrompt } from '../agents/journal-prompt/agent.js';
import {
  JOURNAL_PROMPT_CLINICAL_REVIEW,
  JOURNAL_PROMPT_LIBRARY_VERSION,
  promptsForEmotion,
  validatePromptLibrary,
} from '../agents/journal-prompt/prompt-library.js';
import { checkBudget, withUsageMetering } from '../lib/token-budget.js';

const VALID_EMOTIONS = ['anxious', 'sad', 'angry', 'overwhelmed', 'numb', 'calm', 'hopeful', 'other'] as const;
const INTENSITY_MIN = 1;
const INTENSITY_MAX = 5;
const MAX_ENTRIES = 30;
const MAX_CONTENT_LENGTH = 10000;

export async function journalRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateJournalEntryBody }>('/journal', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      // Mood and intensity are optional. Writing is the point of a journal;
      // a client who wants to write and not label the feeling must be able to
      // save, so only the content is required. When a mood IS sent it still
      // has to be one of the eight, and an intensity only makes sense
      // alongside one — a strength with no feeling attached is a mistake, not
      // a blank.
      const body = request.body ?? ({} as CreateJournalEntryBody);
      const { emotion = null, intensity = null, content } = body;

      if (emotion !== null && (typeof emotion !== 'string' || !VALID_EMOTIONS.includes(emotion as typeof VALID_EMOTIONS[number]))) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_EMOTION',
            message: `emotion must be null or one of: ${VALID_EMOTIONS.join(', ')}`,
          },
        });
      }

      if (intensity !== null && (typeof intensity !== 'number' || !Number.isInteger(intensity) || intensity < INTENSITY_MIN || intensity > INTENSITY_MAX)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_INTENSITY',
            message: `intensity must be null or an integer between ${INTENSITY_MIN} and ${INTENSITY_MAX}`,
          },
        });
      }

      if (intensity !== null && emotion === null) {
        return reply.status(400).send({
          error: {
            code: 'INTENSITY_WITHOUT_EMOTION',
            message: 'intensity only applies when an emotion is given',
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

      if (content.length > MAX_CONTENT_LENGTH) {
        return reply.status(400).send({
          error: {
            code: 'CONTENT_TOO_LONG',
            message: `content must be at most ${MAX_CONTENT_LENGTH} characters`,
          },
        });
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

  // The prompt library, over HTTP — what the journal screen's "Get a prompt"
  // button reads. Deliberately a plain read: the prompts are fixed, vetted
  // sentences (agents/journal-prompt/prompt-library.ts), so this route costs
  // nothing to serve, is fast enough to answer inside a tap, and has no
  // per-day budget gate — unlike POST /journal/prompt, which spends a model
  // call on a personalised sentence.
  //
  // Fail closed: a library that breaks its own rules is a 503, never a
  // half-reviewed sentence reaching a client.
  app.get<{ Querystring: { emotion?: string } }>('/journal/prompts', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const violations = validatePromptLibrary();
      if (violations.length > 0) {
        request.log.error(
          { event: 'journal_prompt_library_invalid', violations },
          'journal prompt library refusing to serve an invalid library',
        );
        return reply.status(503).send({
          error: {
            code: 'PROMPT_LIBRARY_INVALID',
            message: 'The journal prompt library fails its own content rules; refusing to serve it.',
            violations,
          },
        });
      }

      const prompts = promptsForEmotion(undefined, {
        emotion: request.query.emotion ?? null,
      });

      return reply.send({
        version: JOURNAL_PROMPT_LIBRARY_VERSION,
        review: JOURNAL_PROMPT_CLINICAL_REVIEW,
        prompts: prompts.map((p) => ({ id: p.id, text: p.text })),
      });
    },
  });

  // J2 — AI-generated journal prompt, personalized from chat-derived
  // UserMemory themes when available. See agents/journal-prompt/agent.ts
  // for the fail-closed fallback behavior.
  app.post('/journal/prompt', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true, user_memory: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      // E17-S6 — J2 is the other user-initiated model call on an HTTP request
      // path, so it is charged to the same per-day budget as chat turns (there
      // is no session here, so the per-session budget does not apply). This is
      // also the request path that can answer with a real HTTP status: 429 with
      // the same dedicated code the WebSocket budget notice carries.
      const budget = await checkBudget({ userId: uid });
      if (!budget.allowed) {
        return reply.status(budget.statusCode).send({
          error: {
            code: budget.code,
            message: budget.message,
            used: {
              session_tokens: budget.used.sessionTokens,
              daily_cost_usd: Number(budget.used.dailyCostUsd.toFixed(6)),
            },
            limits: {
              session_tokens: budget.limits.sessionTokens,
              daily_cost_usd: budget.limits.dailyCostUsd,
            },
            retry_after_seconds: budget.retryAfterSeconds,
          },
        });
      }

      const { result: prompt } = await withUsageMetering({ userId: uid }, () =>
        generateJournalPrompt(user.user_memory),
      );

      reply.send({ prompt });
    },
  });
}
