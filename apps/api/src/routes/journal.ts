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
import { checkClientText } from '../lib/safety-check.js';
import { flagSafetyEvent } from '../lib/safety-flags.js';
import { enqueueSafetyRecheck } from '../lib/safety-recheck.js';
import { a9PostReview } from '../agents/a9-post/agent.js';
import { getFallbackJournalPrompt } from '../agents/journal-prompt/fallback-prompts.js';

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

      // ─── Step 4 — the same safety check chat runs ──────────────────────
      //
      // Run BEFORE the insert, because the answer decides what the client is
      // shown and what the therapist is told. The entry is saved either way:
      // "show help straight away" is not a reason to throw away what a person
      // just wrote.
      const safety = await checkClientText(content.trim());

      const entry = await prisma.journalEntry.create({
        data: {
          user_id: user.id,
          emotion,
          intensity,
          content: content.trim(),
        },
        select: { id: true },
      });

      // Exactly chat's behaviour on S3/S4: the flag is written with the row it
      // came from and no content, and the therapist gets the same alert email
      // (lib/safety-flags.ts sends it, fire-and-forget).
      if (safety.flagged) {
        await flagSafetyEvent({
          userId: user.id,
          level: safety.level,
          source: 'journal_entry',
          subjectKind: 'journal_entry',
          subjectId: entry.id,
        });
      } else if (safety.recheck) {
        // The check could not run. Moderate concern, not a crisis: no flag, no
        // email, the client is offered help, and this row is screened again
        // once the classifier answers (owner's rule, 9 Nov 2026).
        await enqueueSafetyRecheck({
          userId: user.id,
          surface: 'journal_entry',
          subjectId: entry.id,
        });
      }

      request.log.info(
        {
          event: 'journal_entry_created',
          user_id: user.id,
          emotion,
          intensity,
          safety_level: safety.level,
          safety_flagged: safety.flagged,
          safety_reason: safety.reason,
        },
        'Journal entry created',
      );

      return reply.code(201).send({
        success: true,
        id: entry.id,
        // No level, no reason: the client is told to get help, not told how a
        // classifier read them. `helpOffer` is the gentle offer shown when the
        // check could not run — never a crisis card, never silence.
        safety: { showHelp: safety.showHelp, helpOffer: safety.helpOffer },
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

      const { result: generated } = await withUsageMetering({ userId: uid }, () =>
        generateJournalPrompt(user.user_memory),
      );

      // ─── Step 4 — the final safety review, on journal AI text too ──────
      //
      // Chat replies are reviewed by A9-post before they reach a client; a
      // journal prompt is model-written text shown to the same person, so it
      // gets the same review. Blocked, empty or failed all resolve the same
      // way: the client sees a vetted static prompt from the approved library
      // instead. Nothing unreviewed reaches the screen, and the screen is never
      // left without a prompt either.
      const prompt = await reviewJournalPrompt(generated, user.id);

      reply.send({ prompt });
    },
  });
}

/**
 * Review one model-written journal prompt, failing closed to the vetted static
 * list.
 *
 * The review is the one chat uses (`a9PostReview`), with the same rules: no
 * diagnosis, no advice, no promises, no invented helpline. Anything that is not
 * an explicit APPROVED — a BLOCKED verdict, a parse failure, a thrown call, an
 * empty string — is replaced, never softened or shown.
 */
async function reviewJournalPrompt(generated: string, userId: string): Promise<string> {
  const candidate = typeof generated === 'string' ? generated.trim() : '';
  if (candidate.length === 0) return getFallbackJournalPrompt();

  let safetyState = 'S0';
  try {
    const current = await prisma.safetyState.findUnique({
      where: { user_id: userId },
      select: { safety_state_current: true },
    });
    safetyState = current?.safety_state_current ?? 'S0';
  } catch {
    // A missing current-state row is not a reason to skip the review; S0 is
    // the review's own default and the review still runs.
  }

  try {
    const review = await a9PostReview({
      draftResponse: candidate,
      safetyState,
      carePlan: 'CP1',
      languageMode: 'english',
      carePlanFocus: null,
    });
    if (review.decision !== 'APPROVED') {
      console.warn('[journal-prompt] final review blocked the prompt — serving the vetted list', {
        violation: review.violation_type,
      });
      return getFallbackJournalPrompt();
    }
    return candidate;
  } catch (err) {
    console.warn('[journal-prompt] final review unavailable — serving the vetted list', {
      err: err instanceof Error ? err.message : String(err),
    });
    return getFallbackJournalPrompt();
  }
}

