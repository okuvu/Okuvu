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
 *   3. and if A1 fails, throws or misses the deadline, the result is
 *      **unscreened**: moderate concern (S2), never safe and never a crisis.
 *      The client is offered help, the write is queued for a recheck, and the
 *      therapist is alerted only if that recheck later finds risk. A crisis
 *      card on every outage would train therapists to ignore the real ones.
 *
 * Callers do three things with the result and nothing else: save the text,
 * show the help card when `showHelp`, and record the flag through
 * `lib/safety-flags.ts` with the subject it came from (no content).
 */

import type { SafetyState } from '@okuvu/shared-types';
import { SAFETY_CHECK_DEGRADED_LEVEL } from '@okuvu/shared-types/safety';
import { classifySafety } from '../agents/a1/agent.js';
import {
  hasCrisisLanguage,
  hasThirdPartyCrisisLanguage,
} from '../agents/a1/crisis-keywords.js';

/**
 * How long a non-chat write waits for the classifier before it is treated as
 * unscreened. Shorter than a chat turn's budget on purpose: the client is
 * waiting on a Save button, and an unscreened write is saved, offered help and
 * queued for a recheck — never dropped.
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
  /**
   * True when the check could not reach a verdict AND the crisis floor found
   * nothing. The client is offered help — "Help is here if you need it." — the
   * write is queued for a recheck, and nobody is alerted yet. Moderate
   * concern, never safe, never crisis (owner's rule, 9 Nov 2026).
   */
  helpOffer: boolean;
  /** The write must be screened again once the classifier answers. */
  recheck: boolean;
  /** The check could not reach a verdict; `level` is the moderate floor (S2). */
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
  return {
    level,
    flagged,
    showHelp: flagged,
    helpOffer: false,
    recheck: false,
    degraded,
    reason,
  };
}

/**
 * The unscreened result.
 *
 * A failed or slow check is moderate concern: no flag, no email, no crisis
 * card. The client gets the gentle help offer, and the write is rechecked once
 * the service answers — an alert only follows if that recheck actually finds
 * risk. The crisis floor has already run and found nothing before this is
 * reachable, so this is never applied to a keyword hit.
 */
function unscreened(reason: string): TextSafetyResult {
  return {
    level: SAFETY_CHECK_DEGRADED_LEVEL,
    flagged: false,
    showHelp: false,
    helpOffer: true,
    recheck: true,
    degraded: true,
    reason,
  };
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

  // 1b. Third-party risk — "asking for a friend", "my flatmate wants to die".
  //
  // Chat has a deterministic floor for this in `a8-router.ts` (its own card,
  // with helplines for the person at risk). The check every other write uses
  // had none, so the same words in a journal entry depended entirely on the
  // model noticing them — the exact "dismissed" failure the owner ruled out in
  // Step 11. S3 is the right level: it is flagged, so the client gets the help
  // card and the therapist gets the content-free alert, and it is not the
  // second-person crisis card, which would tell someone to call a helpline
  // about themselves.
  if (hasThirdPartyCrisisLanguage(trimmed)) {
    return result('S3', 'third_party_keyword_floor');
  }

  // 2. A1, under a deadline.
  try {
    const a1 = await withDeadline(
      classifySafety({ message: trimmed, recentHistory: [] }),
      options.timeoutMs ?? SAFETY_CHECK_TIMEOUT_MS,
    );

    if (a1.fallbackUsed) {
      // A1 already ran its own keyword floor and found nothing. Its S2 is a
      // technical fallback, not a verdict: the write is unscreened, so it is
      // queued for a recheck rather than called safe or elevated to a crisis.
      return unscreened(`classifier_fallback:${a1.notes ?? 'unknown'}`);
    }

    if (a1.safetyState === 'S4') return result('S4', 'classifier_s4');
    if (a1.safetyState === 'S3') return result('S3', 'classifier_s3');
    return result(a1.safetyState, 'classifier');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[safety-check] classifier unreachable — unscreened, queued for recheck', {
      reason: message,
    });
    return unscreened(`classifier_error:${message}`);
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
