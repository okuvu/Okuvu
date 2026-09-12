import { getPrisma } from './prisma.js';
import { generateContent } from './vertex-ai.js';
import { generateEmbedding } from './embedding.js';
import { updateUserMemory } from './memory-extraction.js';
import { DEFAULT_CARE_PLAN_FOCUS } from '@okuvu/shared-types';

const MAX_SUMMARY_TURNS = 20;
const MIN_SUBSTANTIVE_TURNS = 2;

interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
}

export interface SummaryResult {
  status: 'completed' | 'skipped_trivial' | 'session_not_found';
}

interface HomeworkProgress {
  assigned: string | null;
  user_reported: string | null;
  user_quotes: string[];
}

interface SafetyFlags {
  crisis_language_detected: boolean;
  elevated_risk_turns: number;
  escalation_handled: string | null;
  quotes: string[];
}

/**
 * okuvu-remaining-changes.md §C.3/C.5 — a first-pass LLM judgment call, not
 * a validated clinical rule. Worker 05 is the audit's recommended owner for
 * this (moved off A2's S-07, which dropped care_plan_fit entirely). Flagged
 * conservatively: default to not-flagged when uncertain. `reasoning` is
 * for a therapist reading Session Prep, not a diagnosis.
 */
interface CarePlanMismatch {
  flagged: boolean;
  reasoning: string | null;
}

interface ParsedSummary {
  narrative_summary: string;
  themes: string[];
  emotional_state?: string;
  key_points?: string[];
  /** OKUVU v2.0 additions — all optional; a parse succeeds without them for backward tolerance, but the v2.0 prompt asks the model for them every time. */
  techniques_used?: string[];
  homework_progress?: HomeworkProgress;
  safety_flags?: SafetyFlags;
  referrals_made?: string | null;
  open_loops?: string[];
  language?: string;
  care_plan_mismatch?: CarePlanMismatch;
}

/**
 * OKUVU v2.0 — supersedes the MVP v1.0 four-field summarizer. Source of
 * truth: docs/okuvu-v2.0/system-prompts/05-Worker-Session-Summarization-v2.0.md.
 * ${chat_summary_context} is an additive, null-safe input — the checkpoint
 * schema that would populate it is a separate, not-yet-built workstream
 * (docs/okuvu-v2.0/02-master-handoff.md §4). ${homework_assigned} and
 * ${care_plan_focus} are both real, queried in generateSessionSummary below.
 */
function buildSummaryPrompt(
  chatSummaryContext: string | null,
  homeworkAssigned: string | null,
  carePlanFocus: string | null,
): string {
  return `You summarise a completed OKUVU chat thread into a structured record. The user is an Indian young adult using OKUVU between sessions with their human therapist. The chat may be English, Hinglish, or mixed — summaries are written in clear English (internal/clinical record), with verbatim quotes kept in the original language.

Two audiences read your output, at different times: the memory/extraction worker (merges it into the user's persistent memory), and the therapist, only with explicit client permission (sees how the user is doing between sessions, including homework progress).

Write as a careful clinical recorder: faithful, specific, non-interpretive. You record what happened and what the user said — you do not diagnose, judge, or psychoanalyse.

Prior summary of this thread if this is a checkpoint (may be null): ${chatSummaryContext ?? 'null'}
What the therapist had set as active homework (may be null): ${homeworkAssigned ?? 'null'}
The client's assigned care-plan focus (may be null): ${carePlanFocus ?? 'null'}

RULES:
1. Faithful, not interpretive. "User said they felt numb and couldn't get out of bed" — not "user is depressed". Never add a clinical label the user didn't use.
2. Keep the user's words for the important moments. Quotes are the most valuable thing you produce. Max ~2 per field, verbatim, original language.
3. Safety flags are mandatory, not optional. If any turn involved self-harm, suicidal ideation, crisis language, or an S3/S4 classification, crisis_language_detected is true and you capture the surrounding user words. This is a clinical-safety record — flagging is never "over-reporting".
4. Homework progress is factual reporting. user_reported comes only from what the user said. Never infer completion from silence — silence = "not_mentioned".
5. Techniques: record only what actually happened in the thread. Don't assume.
6. Emotional state: describe the arc from the user's language and behaviour, not a diagnosis. Plain words.
7. Hinglish/mixed threads: narrative in English; quotes verbatim. Do not "correct" the user's language in quotes.
8. Never fabricate a theme, quote, flag, or open loop. Empty arrays and null are honest.
9. Do not include OKUVU's own filler (greetings, "ping me anytime") in key_points. Capture substance.
10. Contradictions are data: if the user said they were fine but the thread shows distress, the narrative reflects both.
11. Care-plan mismatch is a rough signal for a therapist to review, not a diagnosis. Only flag true if the thread's content clearly and repeatedly diverges from the care-plan focus above (e.g. the client is consistently discussing something the assigned focus doesn't cover at all) — a single tangential turn is not a mismatch. Default to false when uncertain or when care-plan focus is null.

Respond with valid JSON only. No markdown, no explanation, no notes.
{
  "narrative_summary": "3-6 sentence plain-English summary of what the user discussed, how they were feeling, and what was worked on",
  "emotional_state": "brief description of the emotional arc across the thread",
  "themes": ["theme1", "theme2"],
  "techniques_used": ["tool_id or null"],
  "homework_progress": {
    "assigned": "what was assigned, or null",
    "user_reported": "done | partial | not_done | adapted | not_mentioned | null",
    "user_quotes": ["verbatim user words about the homework, max 2"]
  },
  "safety_flags": {
    "crisis_language_detected": true or false,
    "elevated_risk_turns": 0,
    "escalation_handled": "okuvu_safety_flow | a2_grounding | none_needed | null",
    "quotes": ["verbatim user words tied to any risk moment, max 2"]
  },
  "referrals_made": "therapist_referral | crisis_flow | none | null",
  "key_points": ["specific point 1", "specific point 2"],
  "open_loops": ["anything left unfinished"],
  "language": "english | hinglish | mixed",
  "care_plan_mismatch": {
    "flagged": true or false,
    "reasoning": "brief note if flagged true, else null"
  }
}`;
}

function parseHomeworkProgress(value: unknown): HomeworkProgress | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const obj = value as Record<string, unknown>;
  return {
    assigned: typeof obj.assigned === 'string' ? obj.assigned : null,
    user_reported: typeof obj.user_reported === 'string' ? obj.user_reported : null,
    user_quotes: Array.isArray(obj.user_quotes)
      ? obj.user_quotes.filter((q): q is string => typeof q === 'string')
      : [],
  };
}

function parseSafetyFlags(value: unknown): SafetyFlags | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const obj = value as Record<string, unknown>;
  return {
    crisis_language_detected: obj.crisis_language_detected === true,
    elevated_risk_turns: typeof obj.elevated_risk_turns === 'number' ? obj.elevated_risk_turns : 0,
    escalation_handled: typeof obj.escalation_handled === 'string' ? obj.escalation_handled : null,
    quotes: Array.isArray(obj.quotes)
      ? obj.quotes.filter((q): q is string => typeof q === 'string')
      : [],
  };
}

function parseCarePlanMismatch(value: unknown): CarePlanMismatch | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const obj = value as Record<string, unknown>;
  return {
    flagged: obj.flagged === true,
    reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : null,
  };
}

function parseSummaryOutput(text: string): ParsedSummary | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.narrative_summary !== 'string' || obj.narrative_summary.trim().length === 0) return null;
    if (!Array.isArray(obj.themes)) return null;
    return {
      narrative_summary: obj.narrative_summary,
      themes: obj.themes.filter((t): t is string => typeof t === 'string'),
      emotional_state: typeof obj.emotional_state === 'string' ? obj.emotional_state : undefined,
      key_points: Array.isArray(obj.key_points)
        ? obj.key_points.filter((k): k is string => typeof k === 'string')
        : undefined,
      techniques_used: Array.isArray(obj.techniques_used)
        ? obj.techniques_used.filter((t): t is string => typeof t === 'string')
        : undefined,
      homework_progress: parseHomeworkProgress(obj.homework_progress),
      safety_flags: parseSafetyFlags(obj.safety_flags),
      referrals_made: typeof obj.referrals_made === 'string' ? obj.referrals_made : undefined,
      open_loops: Array.isArray(obj.open_loops)
        ? obj.open_loops.filter((o): o is string => typeof o === 'string')
        : undefined,
      language: typeof obj.language === 'string' ? obj.language : undefined,
      care_plan_mismatch: parseCarePlanMismatch(obj.care_plan_mismatch),
    };
  } catch {
    return null;
  }
}

async function writeFailedStatus(
  sessionId: string,
  userId: string,
  lastUpdatedTurn: number,
  logger: Logger,
): Promise<void> {
  try {
    await getPrisma().sessionSummary.upsert({
      where: {
        user_id_session_id: { user_id: userId, session_id: sessionId },
      },
      create: {
        user_id: userId,
        session_id: sessionId,
        summary_text: null,
        status: 'FAILED',
        last_updated_turn: lastUpdatedTurn,
      },
      update: {
        status: 'FAILED',
        last_updated_turn: lastUpdatedTurn,
      },
    });
  } catch (dbErr) {
    logger.error({ event: 'summary_failed_write_error', session_id: sessionId, user_id: userId, err: dbErr instanceof Error ? dbErr.message : String(dbErr) }, 'Failed to write FAILED status to SessionSummary');
  }
}

async function generateAndStoreEmbedding(
  sessionId: string,
  summary: string,
  logger: Logger,
): Promise<void> {
  const embedding = await generateEmbedding(summary);

  await getPrisma().$executeRaw`
    UPDATE "SessionLog"
    SET summary_embedding = ${JSON.stringify(embedding)}::vector
    WHERE id = ${sessionId}
  `;
}

export async function generateSessionSummary(
  sessionId: string,
  userId: string,
  logger: Logger,
): Promise<SummaryResult> {
  const session = await getPrisma().sessionLog.findUnique({
    where: { id: sessionId },
    include: {
      turns: {
        orderBy: { turn_number: 'asc' },
        select: { role: true, content: true, turn_number: true },
      },
    },
  });

  if (!session) {
    logger.error({ event: 'session_not_found', session_id: sessionId }, 'Session not found');
    return { status: 'session_not_found' };
  }

  const turnCount = session.turns.length;

  if (turnCount < MIN_SUBSTANTIVE_TURNS) {
    logger.info({
      event: 'summary_skipped_trivial',
      session_id: sessionId,
      turn_count: turnCount,
    }, 'Session too short for summarization — skipping');

    await getPrisma().sessionSummary.upsert({
      where: {
        user_id_session_id: { user_id: userId, session_id: sessionId },
      },
      create: {
        user_id: userId,
        session_id: sessionId,
        summary_text: null,
        status: 'SKIPPED_TRIVIAL',
        last_updated_turn: session.turn_count,
      },
      update: {
        summary_text: null,
        status: 'SKIPPED_TRIVIAL',
        last_updated_turn: session.turn_count,
      },
    });

    return { status: 'skipped_trivial' };
  }

  let turnsForSummary = session.turns;
  if (turnCount > MAX_SUMMARY_TURNS) {
    turnsForSummary = session.turns.slice(-MAX_SUMMARY_TURNS);
    logger.info({
      event: 'summary_truncated',
      session_id: sessionId,
      original_turns: turnCount,
      truncated_to: MAX_SUMMARY_TURNS,
    }, 'Transcript exceeded max turns — truncated');
  }

  const transcript = turnsForSummary
    .map((t: { role: string; content: string }) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
    .join('\n');

  // §D: the Homework schema now exists — query the client's most recent
  // active assignment the same way agent-context.ts does, so the model
  // actually knows what was assigned instead of always seeing null.
  const activeHomework = await getPrisma().homework.findFirst({
    where: { client_user_id: userId, status: 'active' },
    orderBy: { assigned_at: 'desc' },
    select: { description: true },
  });

  // §C.3/C.5: same care-plan-focus fallback agent-context.ts already uses
  // for A2, so Worker 05's mismatch check has the same notion of "the
  // assigned focus" that the chat agent was actually working from.
  const clinicalConfig = await getPrisma().clinicalConfig.findUnique({
    where: { user_id: userId },
    select: { care_plan_id: true, care_plan_focus: true },
  });
  const carePlanFocus = clinicalConfig
    ? (clinicalConfig.care_plan_focus ?? DEFAULT_CARE_PLAN_FOCUS[clinicalConfig.care_plan_id])
    : null;

  const result = await generateContent({
    // OKUVU v2.0: chat_summary_context is still an additive, null-safe
    // input — the checkpoint schema that would populate it is a separate,
    // not-yet-built workstream.
    systemInstruction: buildSummaryPrompt(null, activeHomework?.description ?? null, carePlanFocus),
    contents: [{ role: 'user', parts: [{ text: transcript }] }],
    generationConfig: {
      // Raised from 1000 — the v2.0 output schema is significantly larger
      // (nested homework_progress/safety_flags objects, more free-text
      // fields), and A9-post's earlier live-tested lesson (agents/a9-post/
      // agent.ts) was that a tight budget on this kind of small OpenRouter
      // model silently truncates mid-JSON well before an obviously-too-low
      // ceiling.
      maxOutputTokens: 2048,
      temperature: 0.0,
      responseMimeType: 'application/json',
    },
  });

  if (result.fallbackUsed) {
    await writeFailedStatus(sessionId, userId, session.turn_count, logger);
    throw new Error(`Flash-Lite call failed: ${result.failureReason}`);
  }

  const parsed = parseSummaryOutput(result.text);
  if (!parsed) {
    await writeFailedStatus(sessionId, userId, session.turn_count, logger);
    throw new Error('Malformed Flash-Lite output');
  }

  const summaryText = JSON.stringify(parsed);

  await getPrisma().sessionSummary.upsert({
    where: {
      user_id_session_id: { user_id: userId, session_id: sessionId },
    },
    create: {
      user_id: userId,
      session_id: sessionId,
      summary_text: summaryText,
      status: 'COMPLETED',
      last_updated_turn: session.turn_count,
    },
    update: {
      summary_text: summaryText,
      status: 'COMPLETED',
      last_updated_turn: session.turn_count,
    },
  });

  logger.info({
    event: 'summary_completed',
    session_id: sessionId,
    turn_count: turnCount,
  }, 'Session summary generated and persisted');

  // §C.3/C.5: first write ever to ClinicalConfig from a worker (previously
  // exclusively a therapist-portal write surface) — best-effort, since a
  // failure here must never undo the SessionSummary write that already
  // succeeded above. Overwrites every session (no accumulation logic),
  // consistent with how safety_flags/homework_progress are also freshly
  // computed each time, not merged with prior sessions. Skipped entirely
  // (not an error) when no ClinicalConfig row exists yet — Prisma's update
  // would throw on a missing row, and "no care plan assigned yet" is a
  // normal state, not a failure.
  if (clinicalConfig) {
    try {
      await getPrisma().clinicalConfig.update({
        where: { user_id: userId },
        data: { care_plan_review_flagged: parsed.care_plan_mismatch?.flagged ?? false },
      });
    } catch (err) {
      logger.error(
        {
          event: 'care_plan_review_flag_update_failed',
          session_id: sessionId,
          user_id: userId,
          err: err instanceof Error ? err.message : String(err),
        },
        'Failed to update ClinicalConfig.care_plan_review_flagged — summary itself already saved',
      );
    }
  }

  generateAndStoreEmbedding(sessionId, summaryText, logger).catch((err) => {
    logger.error(
      {
        event: 'embedding_failed',
        session_id: sessionId,
        err: err instanceof Error ? err.message : String(err),
      },
      '[Embedding] Failed to generate or store embedding',
    );
  });

  try {
    const sessionNumber = await getPrisma().sessionLog.count({
      where: { user_id: userId },
    });
    await updateUserMemory(userId, summaryText, sessionNumber, logger);
  } catch (error) {
    logger.error(
      {
        event: 'memory_extraction_catch_all',
        user_id: userId,
        session_id: sessionId,
        err: error instanceof Error ? error.message : String(error),
      },
      '[UserMemory] Unexpected error in memory extraction — skipping',
    );
  }

  return { status: 'completed' };
}
