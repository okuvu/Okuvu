import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPrisma } from './prisma.js';
import { generateContent } from './generate-content.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
}

interface UserMemoryUpdate {
  life_context: string[];
  recurring_themes: string[];
  what_helps: string[];
  what_doesnt_help: string[];
  significant_events: string[];
  current_stressors: string[];
  /** OKUVU v2.0: assigned homework + the user's reported outcome, tagged by session. */
  homework_track: string[];
  emotional_baseline: string | null;
}

let promptTemplate: string | null = null;

function getPromptTemplate(): string {
  if (!promptTemplate) {
    promptTemplate = readFileSync(
      resolve(__dirname, '..', 'prompts', 'memory-extraction-v2.0.txt'),
      'utf-8',
    );
  }
  return promptTemplate;
}

function buildMemoryExtractionPrompt(
  existingMemory: unknown,
  newSessionSummary: string,
  sessionNumber: number,
): string {
  const existingJson =
    existingMemory
      ? JSON.stringify(existingMemory, null, 2)
      : 'null';

  return getPromptTemplate()
    .replace('${existing_memory}', existingJson)
    .replace('${new_session_summary}', newSessionSummary)
    .replace('${session_number}', String(sessionNumber));
}

function parseMemoryOutput(text: string): UserMemoryUpdate | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;

    return {
      life_context: arrayOfStrings(obj.life_context),
      recurring_themes: arrayOfStrings(obj.recurring_themes),
      what_helps: arrayOfStrings(obj.what_helps),
      what_doesnt_help: arrayOfStrings(obj.what_doesnt_help),
      significant_events: arrayOfStrings(obj.significant_events),
      current_stressors: arrayOfStrings(obj.current_stressors),
      homework_track: arrayOfStrings(obj.homework_track),
      emotional_baseline:
        typeof obj.emotional_baseline === 'string'
          ? obj.emotional_baseline
          : null,
    };
  } catch {
    return null;
  }
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export async function updateUserMemory(
  userId: string,
  newSessionSummary: string,
  sessionNumber: number,
  logger: Logger,
): Promise<void> {
  const existing = await getPrisma().userMemory.findUnique({
    where: { user_id: userId },
  });

  const prompt = buildMemoryExtractionPrompt(
    existing ?? null,
    newSessionSummary,
    sessionNumber,
  );

  let extracted: UserMemoryUpdate;
  try {
    const result = await generateContent({
      systemInstruction: prompt,
      contents: [{ role: 'user', parts: [{ text: 'Extract memory from the above.' }] }],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    });

    if (result.fallbackUsed) {
      logger.error(
        {
          event: 'memory_extraction_flash_lite_failed',
          user_id: userId,
          failure_reason: result.failureReason,
        },
        '[UserMemory] Flash-Lite call failed — skipping memory update',
      );
      return;
    }

    const parsed = parseMemoryOutput(result.text);
    if (!parsed) {
      logger.error(
        {
          event: 'memory_extraction_parse_failed',
          user_id: userId,
          raw_output: result.text.slice(0, 500),
        },
        '[UserMemory] Failed to parse Flash-Lite output — skipping memory update',
      );
      return;
    }

    extracted = parsed;
  } catch (error) {
    logger.error(
      {
        event: 'memory_extraction_error',
        user_id: userId,
        err: error instanceof Error ? error.message : String(error),
      },
      '[UserMemory] Extraction threw unexpectedly — skipping memory update',
    );
    return;
  }

  if (sessionNumber < 3) {
    extracted.emotional_baseline = null;
  }

  try {
    await getPrisma().userMemory.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        life_context: extracted.life_context,
        recurring_themes: extracted.recurring_themes,
        what_helps: extracted.what_helps,
        what_doesnt_help: extracted.what_doesnt_help,
        significant_events: extracted.significant_events,
        current_stressors: extracted.current_stressors,
        homework_track: extracted.homework_track,
        emotional_baseline: extracted.emotional_baseline,
        session_count: 1,
      },
      update: {
        life_context: extracted.life_context,
        recurring_themes: extracted.recurring_themes,
        what_helps: extracted.what_helps,
        what_doesnt_help: extracted.what_doesnt_help,
        significant_events: extracted.significant_events,
        current_stressors: extracted.current_stressors,
        homework_track: extracted.homework_track,
        emotional_baseline: extracted.emotional_baseline,
        session_count: { increment: 1 },
      },
    });

    logger.info(
      {
        event: 'memory_extraction_completed',
        user_id: userId,
        session_count: existing ? existing.session_count + 1 : 1,
      },
      '[UserMemory] Memory updated successfully',
    );
  } catch (error) {
    logger.error(
      {
        event: 'memory_extraction_db_error',
        user_id: userId,
        err: error instanceof Error ? error.message : String(error),
      },
      '[UserMemory] Failed to upsert UserMemory — skipping',
    );
  }
}
