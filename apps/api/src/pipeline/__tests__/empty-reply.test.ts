/**
 * Owner's rule, 25 Nov 2026 — a turn that serves no text must never reach the
 * client blank.
 *
 * Two halves are tested here and they are deliberately separate:
 *
 *   1. the resolver (`pipeline/empty-reply.ts`) in isolation, including every
 *      branch that must return approved copy rather than an empty string;
 *   2. the pipeline actually substituting, end to end through `processTurn`,
 *      so the rule is a property of the shipped path and not only of a pure
 *      function nobody calls.
 *
 * The negative cases matter as much as the positive ones: a turn that HAD text
 * must come through untouched. A guard that rewrites ordinary replies would be
 * a worse bug than the blank it was written to fix.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  isEmptyReply,
  resolveEmptyReply,
  emptyReplyAuditAction,
} from '../empty-reply.js';
import {
  A8_S3_GROUNDING_RESPONSE,
  A9_POST_S2_FALLBACK,
  CRISIS_RESPONSE,
  MODEL_UNAVAILABLE_RESPONSE,
  HELPLINE_BLOCK,
} from '../fallbacks.js';
import {
  HARM_TO_SOMEONE_RESPONSE,
  HARM_TO_SOMEONE_THOUGHTS_RESPONSE,
} from '../../lib/harm-to-someone.js';

/** Every value a model has been seen to return when it produces no reply. */
const EMPTY_SHAPES: Array<[string, string]> = [
  ['empty string', ''],
  ['one space', ' '],
  ['newlines and tabs', '\n\n\t \n'],
  ['zero-width characters', '\u200B\u200C\u200D\uFEFF'],
  ['punctuation only', '...'],
  ['an em dash', '—'],
  ['a quote pair', '""'],
  ['non-breaking spaces', '\u00A0\u00A0'],
  // An emoji is not words. A client looking for something to read gets the
  // same blank screen from "🙂" as from "", so it is substituted with approved
  // copy rather than shipped as a reply.
  ['an emoji only', '🙂'],
];

/** Values that ARE replies, including the shortest and the non-Latin. */
const REPLY_SHAPES: Array<[string, string]> = [
  ['ok', 'ok'],
  ['a full sentence', 'That sounds really hard.'],
  ['leading and trailing space', '  hello  '],
  ['a single digit', '5'],
  ['Devanagari', 'ठीक है'],
  ['Hinglish', 'samajh raha hoon'],
];

describe('isEmptyReply', () => {
  it.each(EMPTY_SHAPES)('treats %s as no reply', (_label, text) => {
    expect(isEmptyReply(text)).toBe(true);
  });

  it.each(REPLY_SHAPES)('treats %s as a reply', (_label, text) => {
    expect(isEmptyReply(text)).toBe(false);
  });

  it('treats null and undefined as no reply', () => {
    expect(isEmptyReply(null)).toBe(true);
    expect(isEmptyReply(undefined)).toBe(true);
  });
});

describe('resolveEmptyReply', () => {
  it('returns a real reply untouched and reports no substitution', () => {
    const text = 'That sounds really hard — what has today been like?';
    const resolved = resolveEmptyReply({ text, safetyState: 'S1' });
    expect(resolved.text).toBe(text);
    expect(resolved.source).toBeNull();
  });

  it('does not touch a reply containing even one letter', () => {
    const resolved = resolveEmptyReply({ text: '  h ', safetyState: 'S2' });
    expect(resolved.text).toBe('  h ');
    expect(resolved.source).toBeNull();
  });

  // ── the four safety shapes the owner named ────────────────────────────────

  it('serves the crisis card when the turn was a crisis and the reply is empty', () => {
    for (const [, text] of EMPTY_SHAPES) {
      const resolved = resolveEmptyReply({ text, safetyState: 'S4' });
      expect(resolved.text).toBe(CRISIS_RESPONSE);
      expect(resolved.source).toBe('empty_reply_crisis');
      // The card is useless without the numbers in it.
      expect(resolved.text).toContain(HELPLINE_BLOCK);
    }
  });

  it('serves the harm-to-someone screen when that screen was raised', () => {
    for (const [, text] of EMPTY_SHAPES) {
      const resolved = resolveEmptyReply({
        text,
        screenText: HARM_TO_SOMEONE_RESPONSE,
        safetyState: 'S3',
      });
      expect(resolved.text).toBe(HARM_TO_SOMEONE_RESPONSE);
      expect(resolved.source).toBe('empty_reply_screen');
    }
  });

  it('serves the unwanted-thoughts screen when that screen was raised', () => {
    const resolved = resolveEmptyReply({
      text: '',
      screenText: HARM_TO_SOMEONE_THOUGHTS_RESPONSE,
      safetyState: 'S3',
    });
    expect(resolved.text).toBe(HARM_TO_SOMEONE_THOUGHTS_RESPONSE);
    expect(resolved.source).toBe('empty_reply_screen');
  });

  it('prefers the raised screen over the state, so a screen is never downgraded', () => {
    // S4 state AND a screen: the screen was raised for this exact turn, so it
    // is what the client must read. Ordering this the other way would let a
    // classifier state overwrite the approved wording for a disclosure.
    const resolved = resolveEmptyReply({
      text: '',
      screenText: HARM_TO_SOMEONE_RESPONSE,
      safetyState: 'S4',
    });
    expect(resolved.text).toBe(HARM_TO_SOMEONE_RESPONSE);
    expect(resolved.source).toBe('empty_reply_screen');
  });

  it('ignores a screen that is itself empty rather than serving blank', () => {
    const resolved = resolveEmptyReply({ text: '', screenText: '', safetyState: 'S3' });
    expect(resolved.text).toBe(A8_S3_GROUNDING_RESPONSE);
    expect(isEmptyReply(resolved.text)).toBe(false);
  });

  // ── the ordinary case: approved fallback copy ─────────────────────────────

  it('serves the signed fallback copy on an ordinary empty turn', () => {
    for (const state of ['S0', 'S1']) {
      for (const [, text] of EMPTY_SHAPES) {
        const resolved = resolveEmptyReply({ text, safetyState: state });
        expect(resolved.text).toBe(MODEL_UNAVAILABLE_RESPONSE);
        expect(resolved.source).toBe('empty_reply_model');
      }
    }
  });

  it('serves the steadier S2 selector at elevated risk', () => {
    const resolved = resolveEmptyReply({ text: '', safetyState: 'S2' });
    expect(resolved.text).toBe(A9_POST_S2_FALLBACK);
    expect(resolved.source).toBe('empty_reply_s2');
  });

  it('serves the S3 grounding card rather than an apology', () => {
    // S3 never calls a model in the pipeline, so this is defence in depth: if
    // the branch were ever reached, the card that fits the state is the only
    // honest substitute — "something on my side isn't working" would mislabel a
    // safety moment as a technical fault.
    const resolved = resolveEmptyReply({ text: '   ', safetyState: 'S3' });
    expect(resolved.text).toBe(A8_S3_GROUNDING_RESPONSE);
    expect(resolved.source).toBe('empty_reply_grounding');
  });

  // ── the property that matters ─────────────────────────────────────────────

  it('never returns empty text, for any state, with or without a screen', () => {
    const states = ['S0', 'S1', 'S2', 'S3', 'S4', 'unknown-state'];
    for (const state of states) {
      for (const screenText of [null, undefined, '', HARM_TO_SOMEONE_RESPONSE]) {
        for (const [, text] of EMPTY_SHAPES) {
          const resolved = resolveEmptyReply({ text, screenText, safetyState: state });
          expect(isEmptyReply(resolved.text)).toBe(false);
        }
      }
    }
  });
});

describe('emptyReplyAuditAction', () => {
  it('names the substitution only when one happened', () => {
    expect(emptyReplyAuditAction(null)).toBe('TURN_COMPLETED');
    expect(emptyReplyAuditAction('empty_reply_model')).toBe('EMPTY_REPLY_SUBSTITUTED');
    expect(emptyReplyAuditAction('empty_reply_screen')).toBe('EMPTY_REPLY_SUBSTITUTED');
  });
});
