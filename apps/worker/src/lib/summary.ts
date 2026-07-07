import { getPrisma } from './prisma.js';
import { generateContent } from './vertex-ai.js';

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

interface ParsedSummary {
  narrative_summary: string;
  themes: string[];
  emotional_state?: string;
  key_points?: string[];
}

function buildSummaryPrompt(): string {
  return `You are a session summarization assistant for a mental health support application.
Given the following conversation transcript, produce a structured summary.

Respond with valid JSON only. No markdown, no explanation, no notes.
{
  "narrative_summary": "2-4 sentence summary of what the user discussed and how they were feeling",
  "themes": ["theme1", "theme2"],
  "emotional_state": "brief description of the user's emotional state during the session",
  "key_points": ["specific point 1", "specific point 2"]
}`;
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
    };
  } catch {
    return null;
  }
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
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
    .join('\n');

  const result = await generateContent({
    systemInstruction: buildSummaryPrompt(),
    contents: [{ role: 'user', parts: [{ text: transcript }] }],
    generationConfig: {
      maxOutputTokens: 1000,
      responseMimeType: 'application/json',
    },
  });

  if (result.fallbackUsed) {
    throw new Error(`Flash-Lite call failed: ${result.failureReason}`);
  }

  const parsed = parseSummaryOutput(result.text);
  if (!parsed) {
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

  return { status: 'completed' };
}
