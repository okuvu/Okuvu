/**
 * Deterministic history compression for A2's conversation window (E17-S6).
 *
 * The bill for a long conversation is quadratic in turns: the model has no
 * memory between calls, so turn 100 re-reads turns 1–99. A client who talks for
 * two hours because they are lonely pays for the first hour ninety-nine times.
 * ChatGPT and Gemini do not avoid that with magic — they stop re-sending the
 * whole transcript and keep the last stretch verbatim plus a compact digest of
 * what came before.
 *
 * Why this implementation is extractive and not a model-written summary:
 *
 *  • A summariser is a second model call, and a hallucinated summary becomes
 *    false context that later turns treat as fact. In a therapy conversation a
 *    confident invention about what the client said is worse than a stunted
 *    quote.
 *  • It is also free — no tokens spent to save tokens — so the saving is
 *    measurable rather than netted against a summarisation call.
 *
 * What it deliberately does NOT do:
 *
 *  • It never compresses a turn that matches the crisis screen. Safety history
 *    stays word for word: a summarised disclosure is a liability, not a saving.
 *    The screen is the same `crisis-keywords.ts` module A1's deterministic floor
 *    uses, so "what counts as safety-relevant" has exactly one definition in
 *    the codebase.
 *
 *    The limit that follows from that: pinning is only as wide as the screen.
 *    The screen is deliberately precision-first (its ingestion forms require a
 *    quantity word, so "I took my pills this morning" is not a match), which
 *    means an unquantified overdose disclosure ("I already took something") is
 *    clipped like any other old turn. Widening this is a clinical decision about
 *    the keyword list, not something this module should solve on its own — the
 *    test suite asserts the boundary so the gap stays visible.
 *  • It never reorders or drops the newest turns. The most recent N turns are
 *    always sent verbatim — continuity lives there, and the v2.3 prompt work
 *    showed that a client's "okay" is only readable against the turns right
 *    before it.
 *  • It never invents a connector sentence. Compressed turns keep their role
 *    and their own first clause, so the model reads a clipped transcript rather
 *    than a paraphrase.
 *
 * `OKUVU_A2_HISTORY_COMPRESSION=off` disables it; unset means off
 * (`isHistoryCompressionEnabled`), because this changes what the model sees and
 * that should be a deploy decision, not a default.
 */

import { hasCrisisLanguage } from '../agents/a1/crisis-keywords.js';

export interface ConversationTurnLike {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompressOptions {
  /** Newest turns kept word for word. Default 8 (four exchanges). */
  keepRecent?: number;
  /** Per-older-turn character budget before truncation. Default 240. */
  maxCharsPerOldTurn?: number;
  /** Hard cap on total characters of the compressed older block. Default 4000. */
  maxTotalChars?: number;
}

export interface CompressionStats {
  turnsIn: number;
  turnsOut: number;
  charsIn: number;
  charsOut: number;
  keptVerbatim: number;
  pinnedForSafety: number;
  clipped: number;
}

export interface CompressionResult<T extends ConversationTurnLike> {
  turns: T[];
  stats: CompressionStats;
}

/**
 * First sentence (or first `maxChars` characters when there is no sentence
 * break), trimmed to a word boundary so a clipped turn never ends mid-word.
 */
function firstClause(text: string, maxChars: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= maxChars) return flat;

  const sentenceEnd = flat.slice(0, maxChars).search(/[.!?](?=\s|$)/);
  const cut = sentenceEnd > 40 ? sentenceEnd + 1 : maxChars;
  const slice = flat.slice(0, cut);
  const lastSpace = slice.lastIndexOf(' ');
  const trimmed = (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).replace(/[,;:\-–—]$/, '');
  return `${trimmed}…`;
}

export function isHistoryCompressionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OKUVU_A2_HISTORY_COMPRESSION === 'on';
}

/**
 * Compress everything older than the recent window.
 *
 * Returns the input array unchanged (same reference, zeroed stats) when there
 * is nothing old enough to compress, so a short session pays nothing — not even
 * a copy.
 */
export function compressHistory<T extends ConversationTurnLike>(
  turns: readonly T[],
  options: CompressOptions = {},
): CompressionResult<T> {
  const keepRecent = options.keepRecent ?? 8;
  const maxCharsPerOldTurn = options.maxCharsPerOldTurn ?? 240;
  const maxTotalChars = options.maxTotalChars ?? 4000;

  const charsIn = turns.reduce((sum, t) => sum + t.content.length, 0);
  const stats: CompressionStats = {
    turnsIn: turns.length,
    turnsOut: turns.length,
    charsIn,
    charsOut: charsIn,
    keptVerbatim: 0,
    pinnedForSafety: 0,
    clipped: 0,
  };

  if (turns.length <= keepRecent) {
    stats.keptVerbatim = turns.length;
    return { turns: turns as T[], stats };
  }

  const splitAt = turns.length - keepRecent;
  const older = turns.slice(0, splitAt);
  const recent = turns.slice(splitAt);

  let budget = maxTotalChars;
  const compressedOlder: T[] = [];

  for (const turn of older) {
    // Safety history is never compressed. Checked before the budget so a pinned
    // turn is kept even when the budget is already exhausted — losing a
    // disclosure to a character cap would be the exact failure this module
    // exists to avoid.
    if (hasCrisisLanguage(turn.content)) {
      compressedOlder.push(turn);
      stats.pinnedForSafety += 1;
      budget -= turn.content.length;
      continue;
    }

    if (budget <= 0) {
      // Out of budget: collapse the turn to a role-preserving placeholder
      // rather than dropping it, so the model still knows the exchange
      // happened.
      compressedOlder.push({ ...turn, content: '[earlier exchange, omitted for length]' } as T);
      stats.clipped += 1;
      continue;
    }

    const allowance = Math.min(maxCharsPerOldTurn, budget);
    const text = firstClause(turn.content, allowance);
    if (text.length < turn.content.length) stats.clipped += 1;
    budget -= text.length;
    compressedOlder.push({ ...turn, content: text } as T);
  }

  const out = [...compressedOlder, ...recent];
  stats.turnsOut = out.length;
  stats.charsOut = out.reduce((sum, t) => sum + t.content.length, 0);
  stats.keptVerbatim = recent.length;

  return { turns: out, stats };
}
