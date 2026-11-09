import { FastifyInstance } from 'fastify';
import {
  DEMANDING_GATE_BUTTONS,
  DEMANDING_GATE_MAX,
  DEMANDING_GATE_MESSAGE,
  DEMANDING_GATE_MIN,
  DEMANDING_GATE_QUESTION,
  GROUNDING_TOOL_ID,
  demandingGateBlocks,
} from '@okuvu/shared-types/safety';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { answersToText, checkClientText } from '../lib/safety-check.js';
import { buildCompletionWrite } from '../lib/homework.js';
import { flagSafetyEvent } from '../lib/safety-flags.js';
import { enqueueSafetyRecheck } from '../lib/safety-recheck.js';
import { parseWorksheetRow, worksheetRowProblems, type WorksheetRegistryRow } from '../lib/worksheet-content.js';
import { generateContent } from '../lib/generate-content.js';
import { a9PostReview } from '../agents/a9-post/agent.js';
import { buildWorksheetHelpRequest } from '../agents/worksheet-help/prompts.js';

const MAX_ANSWER_JSON = 60_000;

interface SubmitBody {
  answers?: unknown;
  feelingBefore?: unknown;
  feelingAfter?: unknown;
  barriers?: unknown;
  helped?: unknown;
  homeworkId?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRating(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < DEMANDING_GATE_MIN || value > DEMANDING_GATE_MAX) return null;
  return value;
}

async function currentSafetyState(userId: string): Promise<string | null> {
  try {
    const row = await prisma.safetyState.findUnique({
      where: { user_id: userId },
      select: { safety_state_current: true },
    });
    return row?.safety_state_current ?? null;
  } catch {
    // No row yet is a normal new client. A read failure is not: treat it as
    // unknown, and let the gate fail closed on a demanding worksheet.
    return null;
  }
}

/**
 * Saving a finished worksheet.
 *
 * This is the write path the owner's rule (3) is about: a worksheet answer is
 * client-typed free text, so it goes through the same safety check as a chat
 * message before it is stored, and an S3/S4 answer is saved, shown the help
 * card, flagged without content, and emailed to the therapist exactly as chat
 * does. The gate for demanding worksheets is enforced HERE as well as at open,
 * because a client is not obliged to open a worksheet through the screen: a
 * direct POST must not be able to skip the question.
 */
export async function worksheetsRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { toolId: string }; Body: SubmitBody }>('/worksheets/:toolId', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { toolId } = request.params;
      const body = request.body ?? {};

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      const row = await prisma.toolRegistryEntry.findUnique({
        where: { tool_id: toolId },
        select: {
          tool_id: true,
          kind: true,
          status: true,
          access_mode: true,
          load_level: true,
          content_en: true,
          content_hi: true,
          therapy_modality: true,
          therapist_note: true,
          label: true,
          summary: true,
          section: true,
          est_minutes: true,
          library_group: true,
        },
      });

      if (!row || row.status !== 'approved') {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
      }
      if (row.kind !== 'worksheet') {
        return reply.status(400).send({
          error: { code: 'NOT_A_WORKSHEET', message: 'That Library card is not a worksheet.' },
        });
      }
      if (row.access_mode === 'in_session') {
        // The safety plan is written with the therapist in the portal. A client
        // never fills it in, so there is nothing to accept here.
        return reply.status(403).send({
          error: {
            code: 'NOT_A_FORM',
            message: 'You and your therapist fill this in together.',
          },
        });
      }

      if (!isPlainObject(body.answers)) {
        return reply.status(400).send({
          error: { code: 'INVALID_ANSWERS', message: 'answers must be an object keyed by field id' },
        });
      }
      if (JSON.stringify(body.answers).length > MAX_ANSWER_JSON) {
        return reply.status(413).send({
          error: { code: 'ANSWERS_TOO_LARGE', message: 'This worksheet is too large to save.' },
        });
      }

      const problems = worksheetRowProblems(row as WorksheetRegistryRow);
      if (problems.length > 0) {
        // A body that fails its own rules is never stored against a client.
        request.log.error({ event: 'worksheet_body_invalid', tool_id: toolId, problems });
        return reply.status(503).send({
          error: {
            code: 'WORKSHEET_INVALID',
            message: 'This worksheet is being reviewed. Please try another one.',
          },
        });
      }
      const parsed = parseWorksheetRow(row as WorksheetRegistryRow);
      const fieldIds = new Set(parsed.english.fields.filter((f) => f.type !== 'instruction').map((f) => f.id));
      const unknown = Object.keys(body.answers).filter((key) => !fieldIds.has(key));
      if (unknown.length > 0) {
        return reply.status(400).send({
          error: {
            code: 'UNKNOWN_ANSWER_FIELD',
            message: `This worksheet has no part called ${unknown[0]}.`,
          },
        });
      }

      // The assignment this answer belongs to, when there is one. Kept on the
      // response so the therapist can see it against the homework row, and
      // closed here so the Today card moves on to the next due exercise rather
      // than offering the same one forever.
      let homeworkId: string | null = null;
      let homeworkSchedule: { frequency: string | null; reminder_time: string | null; due_at: Date | null } | null = null;
      if (row.access_mode === 'assigned') {
        const assignment = await prisma.homework.findFirst({
          where: { client_user_id: user.id, tool_id: toolId, status: 'active' },
          select: { id: true, frequency: true, reminder_time: true, due_at: true },
        });
        if (!assignment) {
          return reply.status(403).send({
            error: { code: 'NOT_ASSIGNED', message: 'Your therapist has not assigned this one.' },
          });
        }
        homeworkId = assignment.id;
        homeworkSchedule = assignment;
      } else if (typeof body.homeworkId === 'string' && body.homeworkId.length > 0) {
        // A self-serve worksheet may still have been opened from an assignment
        // (an open-access exercise a therapist also assigned). Only count it
        // when the row is really this client's and really this tool.
        const assignment = await prisma.homework.findFirst({
          where: {
            id: body.homeworkId,
            client_user_id: user.id,
            tool_id: toolId,
            status: 'active',
          },
          select: { id: true, frequency: true, reminder_time: true, due_at: true },
        });
        homeworkId = assignment?.id ?? null;
        homeworkSchedule = assignment ?? null;
      }

      const feelingBefore = body.feelingBefore === undefined || body.feelingBefore === null
        ? null
        : readRating(body.feelingBefore);

      if (row.load_level === 'demanding') {
        if (feelingBefore === null) {
          return reply.status(400).send({
            error: { code: 'FEELING_NOT_GIVEN', message: DEMANDING_GATE_QUESTION },
          });
        }
        if (demandingGateBlocks(feelingBefore, await currentSafetyState(user.id))) {
          return reply.status(403).send({
            error: {
              code: 'DEMANDING_GATE',
              message: DEMANDING_GATE_MESSAGE,
              buttons: DEMANDING_GATE_BUTTONS,
              groundingToolId: GROUNDING_TOOL_ID,
            },
          });
        }
      }

      const barriers = typeof body.barriers === 'string' ? body.barriers.trim() : '';
      const safety = await checkClientText(
        [answersToText(body.answers), barriers].filter((part) => part.length > 0).join('\n'),
      );

      const created = await prisma.worksheetResponse.create({
        data: {
          user_id: user.id,
          worksheet_id: toolId,
          homework_id: homeworkId,
          answers: body.answers as object,
          feeling_before: feelingBefore,
          feeling_after: body.feelingAfter === undefined ? null : readRating(body.feelingAfter),
          barriers: barriers.length > 0 ? barriers : null,
          helped: typeof body.helped === 'boolean' ? body.helped : null,
          safety_flagged: safety.flagged,
          safety_level: safety.flagged ? safety.level : null,
          language: 'en',
        },
        select: { id: true },
      });

      // A finished assigned worksheet records a completion: a one-off closes,
      // and a repeating assignment marks today done and comes back on its next
      // due day (owner's Step 6 correction; the same write the Mark done button
      // uses). Deliberately last, after the save, and deliberately independent
      // of the safety result — a crisis does not mean the work was not done.
      let homeworkRepeats = false;
      let homeworkNextDueAt: string | null = null;
      if (homeworkId && homeworkSchedule) {
        try {
          const write = buildCompletionWrite(homeworkSchedule);
          await prisma.homework.update({
            where: { id: homeworkId },
            data: write.data,
          });
          homeworkRepeats = write.repeats;
          homeworkNextDueAt = write.next ? write.next.toISOString() : null;
          await prisma.homeworkCompletion.create({
            data: {
              homework_id: homeworkId,
              client_user_id: user.id,
              source: 'worksheet',
            },
          });
        } catch (err) {
          request.log.warn({
            event: 'worksheet_homework_close_failed',
            homework_id: homeworkId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (safety.flagged) {
        await flagSafetyEvent({
          userId: user.id,
          level: safety.level,
          source: 'worksheet_answer',
          subjectKind: 'worksheet_response',
          subjectId: created.id,
        });
      } else if (safety.recheck) {
        // Unscreened: moderate concern, no alert. The answers are queued and
        // screened again when the classifier answers.
        await enqueueSafetyRecheck({
          userId: user.id,
          surface: 'worksheet_answer',
          subjectId: created.id,
        });
      }

      request.log.info({
        event: 'worksheet_saved',
        user_id: user.id,
        tool_id: toolId,
        safety_level: safety.level,
        safety_flagged: safety.flagged,
        safety_reason: safety.reason,
      });

      return reply.code(201).send({
        id: created.id,
        success: true,
        safety: { showHelp: safety.showHelp, helpOffer: safety.helpOffer },
        // A worksheet answer starts Private, like every entry and note. The
        // client is asked whether to share it right after finishing, and the
        // answer is what moves this flag — never the save itself.
        shared: false,
        repeats: homeworkRepeats,
        nextDueAt: homeworkNextDueAt,
      });
    },
  });

  /**
   * "What is this step asking?" — the only AI help a worksheet offers.
   *
   * Three narrownesses, each load-bearing:
   *  - the client's ANSWERS are never sent to the model, so it cannot fill them
   *    in, quote them back, or rewrite them;
   *  - the system prompt forbids drafting an answer, suggesting the "other way
   *    to see it", advice, diagnosis words and outcome promises;
   *  - the reply goes through A9-post before it is returned, so a draft that
   *    breaks those rules anyway is refused rather than shown.
   *
   * There is no fallback text. A fixed "take your time" line would be
   * client-facing copy nobody approved, and the step is already on screen, so
   * the model going quiet costs the client nothing.
   */
  app.post<{ Params: { toolId: string }; Body: { stepId?: unknown; question?: unknown } }>(
    '/worksheets/:toolId/help',
    {
      preHandler: [verifyCognitoJWT],
      handler: async (request, reply) => {
        const { uid } = request.user;
        const { toolId } = request.params;
        const body = request.body ?? {};

        const user = await prisma.user.findUnique({
          where: { auth_subject: uid },
          select: { id: true },
        });
        if (!user) {
          return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
        }

        const row = await prisma.toolRegistryEntry.findUnique({
          where: { tool_id: toolId },
          select: {
            tool_id: true,
            kind: true,
            status: true,
            access_mode: true,
            load_level: true,
            label: true,
            summary: true,
            section: true,
            est_minutes: true,
            library_group: true,
            content_en: true,
            content_hi: true,
            therapy_modality: true,
            therapist_note: true,
          },
        });

        if (!row || row.status !== 'approved' || row.kind !== 'worksheet') {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
        }
        if (row.access_mode === 'in_session') {
          return reply.status(403).send({
            error: { code: 'NOT_A_FORM', message: 'You and your therapist fill this in together.' },
          });
        }

        const stepId = typeof body.stepId === 'string' ? body.stepId : '';
        const parsedHelp = parseWorksheetRow(row as WorksheetRegistryRow);
        const field = parsedHelp.english.fields.find((candidate) => candidate.id === stepId);
        if (!field) {
          return reply.status(404).send({
            error: { code: 'STEP_NOT_FOUND', message: 'That step is not part of this worksheet.' },
          });
        }

        const question = typeof body.question === 'string' ? body.question.slice(0, 500) : null;

        // The owner's rule (9 Nov 2026): crisis words in a worksheet bring up
        // the help card, and the AI stops. The card is raised by the save path
        // (`POST /worksheets/:toolId` → `safety.showHelp`); this is the other
        // half of the rule, enforced here rather than only by the overlay. While
        // the client's state is S3 or S4 the helper does not call the model at
        // all, and returns nothing. A silent helper is the correct output: the
        // step is already on screen, and there is no approved line to fall back
        // on.
        //
        // The state is read once and reused for the review below, so the guard
        // and the reviewer can never disagree about it.
        const stateNow = await currentSafetyState(user.id);
        if (stateNow === 'S3' || stateNow === 'S4') {
          request.log.warn({
            event: 'worksheet_help_suppressed',
            tool_id: toolId,
            state: stateNow,
          });
          return reply.status(503).send({
            error: {
              code: 'HELP_UNAVAILABLE',
              message: 'Help is not available right now. The step is still on screen.',
            },
          });
        }

        const prompt = buildWorksheetHelpRequest({
          worksheetLabel: row.label,
          stepPrompt: field.prompt,
          stepHelper: 'helper' in field ? (field.helper ?? null) : null,
          question,
        });

        let text: string;
        try {
          const generated = await generateContent({
            systemInstruction: prompt,
            contents: [{ role: 'user', parts: [{ text: 'Explain this step.' }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 300 },
          });
          if (generated.fallbackUsed) throw new Error('llm_fallback');
          text = generated.text.trim();
          if (text.length === 0) throw new Error('empty_reply');
        } catch (err) {
          request.log.warn({
            event: 'worksheet_help_unavailable',
            tool_id: toolId,
            err: err instanceof Error ? err.message : String(err),
          });
          return reply.status(503).send({
            error: {
              code: 'HELP_UNAVAILABLE',
              message: 'Help is not available right now. The step is still on screen.',
            },
          });
        }

        // The final safety review, as for every other model-written text that
        // reaches a client.
        const safetyState = stateNow ?? 'S0';

        try {
          const review = await a9PostReview({
            draftResponse: text,
            safetyState,
            carePlan: 'CP1',
            languageMode: 'english',
            carePlanFocus: null,
          });
          if (review.decision !== 'APPROVED') {
            request.log.warn({
              event: 'worksheet_help_blocked',
              tool_id: toolId,
              violation: review.violation_type,
            });
            return reply.status(503).send({
              error: {
                code: 'HELP_UNAVAILABLE',
                message: 'Help is not available right now. The step is still on screen.',
              },
            });
          }
        } catch (err) {
          request.log.warn({
            event: 'worksheet_help_review_failed',
            tool_id: toolId,
            err: err instanceof Error ? err.message : String(err),
          });
          return reply.status(503).send({
            error: {
              code: 'HELP_UNAVAILABLE',
              message: 'Help is not available right now. The step is still on screen.',
            },
          });
        }

        return reply.send({ text, reviewed: true });
      },
    },
  );
}
