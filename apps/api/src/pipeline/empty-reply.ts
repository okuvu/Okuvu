/**
 * Never serve a blank turn.
 *
 * Owner's rule, 25 Nov 2026: "A turn that serves no text must never reach the
 * client blank. If the reply is empty after a safety flag (crisis, harm to
 * someone, unwanted thoughts), show that screen. Otherwise show my approved
 * fallback copy."
 *
 * ## Why this exists
 *
 * The round-five and round-six gold-set runs each contained turns where the
 * model returned nothing usable — an empty string, or its own planning
 * ("The user is expressing frustration… The response should acknowledge…")
 * instead of a reply. In the product that text went straight into the Turn row
 * and out over the websocket, so the client's screen was blank. In the eval it
 * invalidated the run, which is why the harm_to_someone hard gate read 29/30 on
 * runs where no safety behaviour was wrong.
 *
 * Both are the same defect seen from two sides: nothing between the model and
 * the client asked "is this actually a reply?".
 *
 * ## What it does
 *
 * One pure function, no I/O, so the pipeline, the websocket and the eval
 * instrument all decide identically:
 *
 *   1. a non-empty reply is returned untouched — this is not a filter;
 *   2. a safety screen already raised for this turn wins, so a crisis, a
 *      harm-to-someone disclosure or an unwanted-thought disclosure can never
 *      be downgraded to an apology for a technical fault;
 *   3. S4 and S3 serve their approved deterministic cards;
 *   4. everything else serves the clinically signed fallback copy
 *      (`MODEL_UNAVAILABLE_RESPONSE`, or `A9_POST_S2_FALLBACK` at S2 — rev 6
 *      §4.5 and §4.9).
 *
 * Every branch returns approved text. There is no path through this function
 * that yields an empty string, which is the property the tests assert.
 */

import {
  A8_S3_GROUNDING_RESPONSE,
  CRISIS_RESPONSE,
  getModelUnavailableFallback,
} from './fallbacks.js';

/** Where the substitute came from, for the audit row and the eval report. */
export type EmptyReplySource =
  | 'empty_reply_screen'
  | 'empty_reply_crisis'
  | 'empty_reply_grounding'
  | 'empty_reply_s2'
  | 'empty_reply_model';

export interface EmptyReplyResolution {
  /** Never empty. */
  text: string;
  /** Null when the input was a real reply and nothing was substituted. */
  source: EmptyReplySource | null;
}

/**
 * Is this text something a client could read as a reply?
 *
 * Whitespace, zero-width characters, and punctuation alone are not. A reply of
 * "…" or "—" is the model failing, not the model answering, and the client
 * reading it gets the same blank screen as an empty string.
 *
 * The test is the presence of at least one letter or digit anywhere in the
 * string, in any script — so a one-word reply in Hindi, Tamil or Hinglish is a
 * reply, and so is "ok".
 */
export function isEmptyReply(text: string | null | undefined): boolean {
  if (typeof text !== 'string') return true;
  // \p{L} = any letter, \p{N} = any digit. `u` makes the property escapes work.
  return !/[\p{L}\p{N}]/u.test(text);
}

/**
 * Resolve the text a turn will actually serve.
 *
 * `screenText` is the deterministic safety screen this turn already raised, if
 * any (crisis, harm to someone, unwanted thoughts). It is passed separately from
 * `safetyState` because the two harm variants — intent and frightening thought —
 * share a safety state but serve different approved wording.
 */
export function resolveEmptyReply(input: {
  text: string | null | undefined;
  screenText?: string | null;
  safetyState: string;
}): EmptyReplyResolution {
  if (!isEmptyReply(input.text)) {
    return { text: input.text as string, source: null };
  }

  // 1. A safety screen was already raised on this turn. It outranks every
  //    substitute below: telling someone in crisis that "something on my side
  //    isn't working" is a worse outcome than any wording problem this module
  //    was written to fix.
  if (typeof input.screenText === 'string' && !isEmptyReply(input.screenText)) {
    return { text: input.screenText, source: 'empty_reply_screen' };
  }

  // 2. The classifier's own state, if the screen was not reached. S4 and S3
  //    normally never call a model at all, so these branches are defence in
  //    depth rather than a live path — but the card that fits the state is the
  //    only honest substitute if one were ever reached.
  if (input.safetyState === 'S4') {
    return { text: CRISIS_RESPONSE, source: 'empty_reply_crisis' };
  }
  if (input.safetyState === 'S3') {
    return { text: A8_S3_GROUNDING_RESPONSE, source: 'empty_reply_grounding' };
  }

  // 3. No flag. The approved fallback copy: rev 6 §4.9, or the steadier §4.5
  //    selector at S2.
  return {
    text: getModelUnavailableFallback(input.safetyState),
    source: input.safetyState === 'S2' ? 'empty_reply_s2' : 'empty_reply_model',
  };
}

/**
 * The audit label for a substituted turn. Kept here so the pipeline and the
 * eval report cannot drift into two different names for the same event.
 */
export function emptyReplyAuditAction(source: EmptyReplySource | null): string {
  return source === null ? 'TURN_COMPLETED' : 'EMPTY_REPLY_SUBSTITUTED';
}
