import { hasCrisisLanguage, hasThirdPartyCrisisLanguage } from '../a1/crisis-keywords.js';

/**
 * Bounded history for A2.
 *
 * A2 re-sends every prior turn of the session on every message, uncapped, so a
 * long conversation costs more per turn than a short one and the growth is
 * quadratic in turn count. Compaction bounds it: the most recent turns stay
 * verbatim, older ones collapse into a short mechanical digest.
 *
 * Three rules make this safe enough to run on a live therapy conversation, and
 * all three resolve toward keeping text rather than dropping it:
 *
 *  1. **Risk-pinned.** Compaction only runs when the current safety state is
 *     `S0` — "no signal at all". Any session that has shown any risk keeps its
 *     full history, because a disclosure is not something to summarise.
 *  2. **Crisis-pinned.** If *any* turn in the history trips the same
 *     deterministic screens the safety floor uses (first- or third-person), the
 *     whole history is left alone. Those screens are precision-first, so this is
 *     a net with holes rather than a wall — which is why rule 1 exists above it
 *     and why this is off the moment a session shows any signal.
 *  3. **No paraphrase.** The digest truncates and labels; it never rewrites what
 *     the client said into a model's or a template's words beyond the fixed
 *     "client:"/"you:" prefixes. A summary that paraphrases a disclosure is a
 *     liability, not a saving.
 *
 * What it is for is the ordinary case: twenty turns of a client talking about
 * their week, where the twentieth reply needs continuity, not an audit trail.
 *
 * `OKUVU_A2_HISTORY_COMPRESSION=off` disables it entirely; anything else
 * (including unset) leaves it on, so the lever is live when the image rolls.
 */

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompactionOptions {
  /** Turns kept verbatim at the end of the history. Default 6. */
  keepLast?: number;
  /** Current safety state for the turn being answered. Compaction only at 'S0'. */
  safetyState?: 'S0' | 'S1' | 'S2';
  /** Per-turn character cap inside the digest. Default 160. */
  maxCharsPerTurn?: number;
  /** Total character cap for the digest block. Default 1200. */
  maxDigestChars?: number;
  /** Override the env flag (tests). */
  enabled?: boolean;
}

export interface CompactionOutcome {
  turns: ConversationTurn[];
  compacted: boolean;
  /** How many original turns were folded into the digest. */
  omitted: number;
  /** Why compaction did or did not happen — logged, and asserted in tests. */
  reason: 'compacted' | 'disabled' | 'short' | 'risk-pinned' | 'crisis-in-history';
}

export const DEFAULT_KEEP_LAST = 6;
const DEFAULT_MAX_CHARS_PER_TURN = 160;
const DEFAULT_MAX_DIGEST_CHARS = 1200;
/** Below this many turns there is nothing worth folding. */
const MIN_TURNS_TO_COMPACT = 10;

export function compactionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OKUVU_A2_HISTORY_COMPRESSION !== 'off';
}

function firstLine(text: string, maxChars: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxChars) return collapsed;
  return `${collapsed.slice(0, maxChars).trimEnd()}…`;
}

function digestBlock(omitted: ConversationTurn[], maxCharsPerTurn: number, maxDigestChars: number): string {
  const lines: string[] = [
    `Earlier in this conversation (${omitted.length} earlier turns, kept short because none of them carried a safety signal):`,
  ];

  for (const turn of omitted) {
    const label = turn.role === 'assistant' ? 'you' : 'client';
    const line = `- ${label}: ${firstLine(turn.content, maxCharsPerTurn)}`;
    if (lines.join('\n').length + line.length > maxDigestChars) break;
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Fold older turns into one digest turn, keeping the tail verbatim.
 *
 * The digest is inserted as a **user** turn so the transcript keeps alternating
 * shape and A2 reads it as context it was given, not as its own prior output.
 */
export function compactHistory(
  turns: ConversationTurn[],
  options: CompactionOptions = {},
): CompactionOutcome {
  const {
    keepLast = DEFAULT_KEEP_LAST,
    safetyState = 'S0',
    maxCharsPerTurn = DEFAULT_MAX_CHARS_PER_TURN,
    maxDigestChars = DEFAULT_MAX_DIGEST_CHARS,
  } = options;

  const enabled = options.enabled ?? compactionEnabled();
  const unchanged = (reason: CompactionOutcome['reason']): CompactionOutcome => ({
    turns,
    compacted: false,
    omitted: 0,
    reason,
  });

  if (!enabled) return unchanged('disabled');
  if (safetyState !== 'S0') return unchanged('risk-pinned');
  if (turns.length < MIN_TURNS_TO_COMPACT) return unchanged('short');

  const hasCrisisTurn = turns.some(
    (t) => hasCrisisLanguage(t.content) || hasThirdPartyCrisisLanguage(t.content),
  );
  if (hasCrisisTurn) return unchanged('crisis-in-history');

  const cut = turns.length - keepLast;
  const older = turns.slice(0, cut);
  const tail = turns.slice(cut);

  const digest: ConversationTurn = { role: 'user', content: digestBlock(older, maxCharsPerTurn, maxDigestChars) };

  return {
    turns: [digest, ...tail],
    compacted: true,
    omitted: older.length,
    reason: 'compacted',
  };
}
