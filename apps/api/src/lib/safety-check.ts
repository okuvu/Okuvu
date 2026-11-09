/**
 * ONE safety check, for everything a client writes.
 *
 * It was chat-only: A1 classified a chat turn and nothing else. A journal
 * entry, a worksheet answer or a Treasure Box note could carry the same words
 * and produce no card, no flag and no alert, because nothing downstream of a
 * POST inherits the classifier and no table carries a hook.
 *
 * This module is that same check, lifted out of the turn so every write path
 * calls the same function rather than a copy of it:
 *
 *   1. the deterministic crisis floor first (`hasCrisisLanguage`) — the only
 *      part that needs no model, so it works while the model does not;
 *   2. otherwise A1's classifier, under a hard deadline;
 *   3. and if A1 fails, throws or misses the deadline, the result is a
 *      POSSIBLE RISK (S3), never "safe". A write path has no reply to fall
 *      back on: the client has already typed the words, and treating an
 *      unreachable classifier as an all-clear is the one failure in this file
 *      that could cost someone.
 *
 * Callers do three things with the result and nothing else: save the text,
 * show the help card when `showHelp`, and record the flag through
 * `lib/safety-flags.ts` with the subject it came from (no content).
 */

import type { SafetyState } from '@okuvu/shared-types';
import { classifySafety } from '../agents/a1/agent.js';
import { hasCrisisLanguage } from '../agents/a1/crisis-keywords.js';

/**
 * How long a non-chat write waits for the classifier before it is treated as a
 * possible risk. Shorter than a chat turn's budget on purpose: the client is
 * waiting on a Save button, and the outcome of a timeout is protective (S3),
 * not silent.
 */
export const SAFETY_CHECK_TIMEOUT_MS = 8_000;

/** Which surface the text came from. Recorded on the flag; never the text. */
export type SafetySurface = 'journal_entry' | 'worksheet_answer' | 'treasure_note';

export interface TextSafetyResult {
  level: SafetyState;
  /** S3/S4 — the levels that get a flag, an alert email and the help card. */
  flagged: boolean;
  /** True whenever `flagged`: the client is shown help straight away. */
  showHelp: boolean;
  /** The check could not reach a verdict; the level is the protective floor. */
  degraded: boolean;
  /** For logs and the flag row: why this level was chosen. */
  reason: string;
}

function result(
  level: SafetyState,
  reason: string,
  degraded = false,
): TextSafetyResult {
  const flagged = level === 'S3' || level === 'S4';
  return { level, flagged, showHelp: flagged, degraded, reason };
}

async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('safety_check_timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Screen one piece of client-written text.
 *
 * Never throws: a caller must be able to save what the client wrote, and it
 * must never be told "safe" because the check broke. The protective direction
 * is always available and is the only fallthrough.
 */
export async function checkClientText(
  text: string,
  options: { timeoutMs?: number } = {},
): Promise<TextSafetyResult> {
  const trimmed = typeof text === 'string' ? text.trim() : '';

  // Nothing typed is nothing to screen. A client who saves an entry with only
  // a mood chip has written no free text; there is no disclosure in "".
  if (trimmed.length === 0) {
    return result('S0', 'empty');
  }

  // 1. The floor. No model, no deadline, no network. It can only raise the
  //    level, never lower it, and it is the same list chat uses.
  if (hasCrisisLanguage(trimmed)) {
    return result('S4', 'crisis_keyword_floor');
  }

  // 2. A1, under a deadline.
  try {
    const a1 = await withDeadline(
      classifySafety({ message: trimmed, recentHistory: [] }),
      options.timeoutMs ?? SAFETY_CHECK_TIMEOUT_MS,
    );

    if (a1.fallbackUsed) {
      // A1 already ran its own keyword floor and found nothing. Its S2 is a
      // technical fallback, not a verdict, and a non-chat write cannot treat
      // "the classifier did not answer" as "this is safe".
      return result('S3', `classifier_fallback:${a1.notes ?? 'unknown'}`, true);
    }

    if (a1.safetyState === 'S4') return result('S4', 'classifier_s4');
    if (a1.safetyState === 'S3') return result('S3', 'classifier_s3');
    return result(a1.safetyState, 'classifier');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[safety-check] classifier unreachable — treating as possible risk', {
      reason: message,
    });
    return result('S3', `classifier_error:${message}`, true);
  }
}

/**
 * Flatten a worksheet's answers into one string for screening.
 *
 * Every string value is included, at any depth: answers are keyed by field id
 * and hold text, option values, numbers and arrays of row objects. A screening
 * pass that reads only the top level would miss every row-list answer, which
 * is most of the free text a client writes.
 */
export function answersToText(answers: unknown): string {
  const parts: string[] = [];

  const walk = (value: unknown, depth: number): void => {
    if (depth > 6 || value === null || value === undefined) return;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) parts.push(trimmed);
      return;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (typeof value === 'object') {
      for (const item of Object.values(value as Record<string, unknown>)) {
        walk(item, depth + 1);
      }
    }
  };

  walk(answers, 0);
  return parts.join('\n');
}
