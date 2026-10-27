/**
 * A15 memory operations — pure, deterministic, no I/O.
 *
 * `applyMemoryUpdate` takes a state and an update and returns a new state. It
 * never mutates its arguments (callers hold these objects across awaits, and a
 * half-mutated memory is unrecoverable), and the same input twice produces a
 * deeply equal result — the property that makes memory re-derivable from a
 * session log after a bad deploy.
 */

import { MAX_MEMORY_TEXT_CHARS, MEMORY_CAPS } from './types.js';
import type { MemoryItem, MemoryKind, MemoryState, MemoryUpdate } from './types.js';

export const MEMORY_KINDS: readonly MemoryKind[] = [
  'life_context',
  'current_stressors',
  'recurring_themes',
  'what_helps',
  'what_doesnt_help',
  'significant_events',
];

const MEMORY_KIND_SET: ReadonlySet<string> = new Set<string>(MEMORY_KINDS);

export function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === 'string' && MEMORY_KIND_SET.has(value);
}

/**
 * Why an addition was dropped. Dropped additions are not silent: the caller
 * (agent.ts) reports the counts, because "memory quietly stopped recording
 * stressor X" is a bug that otherwise takes months to notice.
 */
export type AdditionRejection = 'unknown_kind' | 'empty' | 'too_long' | 'crisis_content';

export type AdditionCheck =
  | { ok: true; kind: MemoryKind; text: string }
  | { ok: false; kind: string; reason: AdditionRejection };

/**
 * Same normalisation the rest of the codebase uses for text comparison
 * (see shared/specialist.ts): case-, punctuation- and whitespace-insensitive.
 *
 * Memory dedupe depends on this. "Work deadlines." on Monday and "work
 * deadlines" on Thursday are one theme with two mentions, not two themes —
 * otherwise the cap fills with near-duplicates of the same sentence and the
 * genuine second theme is evicted to make room for a punctuation variant.
 */
export function normaliseMemoryText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deny-patterns for crisis content.
 *
 * This is NOT a crisis detector and must never be used as one: A1 classifies
 * risk and A8/A9 gate the turn. This is a *storage* guard with a deliberately
 * blunt deny-list, because the cost of the two failure modes is not
 * symmetric:
 *
 *  - false negative: a crisis sentence is persisted into long-term memory and
 *    replayed into prompts for months, normalising it as background context.
 *  - false positive: a sentence about someone else's overdose is dropped from
 *    memory. The client can say it again; the safety path already heard it.
 *
 * So the list leans towards dropping. It deliberately does not match bare
 * `death` / `died` / `grief` — a bereavement is exactly the kind of
 * `significant_events` memory A15 exists to keep.
 */
const CRISIS_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bsuicid\w*/i, label: 'suicide' },
  { pattern: /\bself[-\s]?(harm|injur)\w*/i, label: 'self_harm' },
  { pattern: /\b(kill|killing)\s+(myself|my\s?self)\b/i, label: 'suicide' },
  { pattern: /\bend(ing)?\s+(my|my\sown)\s+life\b/i, label: 'suicide' },
  { pattern: /\bend\s+it\s+all\b/i, label: 'suicide' },
  { pattern: /\b(want|wants|wanted|wanting|wish|wished|wishing)\s+to\s+die\b/i, label: 'suicide' },
  { pattern: /\b(better\s+off\s+dead|no\s+reason\s+to\s+live|nothing\s+to\s+live\s+for)\b/i, label: 'suicide' },
  { pattern: /\b(don'?t|do\s+not|doesn'?t)\s+want\s+to\s+(be\s+alive|live|be\s+here)\b/i, label: 'suicide' },
  { pattern: /\b(cut|cutting|hurt|hurting|harm|harming|burn|burning)\s+(myself|my\s?self)\b/i, label: 'self_harm' },
  { pattern: /\boverdos(e|ed|ing)\b/i, label: 'self_harm' },
  { pattern: /\b(plan|planning|intend|intending|going)\s+to\s+(die|kill\s+myself)\b/i, label: 'suicide' },
];

/** Returns the matched label, or null when the text carries no crisis content. */
export function findCrisisContent(text: string): string | null {
  for (const { pattern, label } of CRISIS_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

/**
 * The single gate every addition passes through — used by `applyMemoryUpdate`
 * and by the agent wrapper when it reports what was dropped, so the two can
 * never disagree about what "acceptable" means.
 */
export function checkAddition(kind: unknown, text: unknown): AdditionCheck {
  if (!isMemoryKind(kind)) {
    return { ok: false, kind: String(kind), reason: 'unknown_kind' };
  }
  if (typeof text !== 'string') {
    return { ok: false, kind, reason: 'empty' };
  }

  const trimmed = text.trim().replace(/\s+/g, ' ');

  if (trimmed.length === 0) {
    return { ok: false, kind, reason: 'empty' };
  }
  if (trimmed.length > MAX_MEMORY_TEXT_CHARS) {
    return { ok: false, kind, reason: 'too_long' };
  }
  if (findCrisisContent(trimmed) !== null) {
    return { ok: false, kind, reason: 'crisis_content' };
  }

  return { ok: true, kind, text: trimmed };
}

export function emptyMemoryState(clientId: string, now: string): MemoryState {
  return { clientId, sessionCount: 0, updatedAt: now, items: [] };
}

function compareTimestamps(a: string, b: string): number {
  const parsedA = Date.parse(a);
  const parsedB = Date.parse(b);
  if (!Number.isNaN(parsedA) && !Number.isNaN(parsedB) && parsedA !== parsedB) {
    return parsedA - parsedB;
  }
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Eviction order, applied as a tuple:
 *
 *  1. oldest `lastSeen` first  — staleness is the primary signal
 *  2. fewest `mentions`        — a one-off aside loses to a recurring theme
 *  3. longest `text`           — the wordiest variant of the same theme goes
 *  4. array order              — earliest index first, as a total order
 *
 * Step 3 is what keeps a rambling 240-char summary from displacing three
 * short, specific items. Step 4 exists so the function is a total order: two
 * runs over the same array must evict the same object, or memory stops being
 * reproducible from a session log.
 *
 * Negative return means `a` is evicted before `b`.
 */
function compareEvictionPriority(a: MemoryItem, b: MemoryItem): number {
  const byRecency = compareTimestamps(a.lastSeen, b.lastSeen);
  if (byRecency !== 0) return byRecency;

  if (a.mentions !== b.mentions) return a.mentions - b.mentions;

  if (a.text.length !== b.text.length) return b.text.length - a.text.length;

  return 0;
}

/** Drops items of `kind` until it is within `MEMORY_CAPS[kind]`. */
function applyCap(items: MemoryItem[], kind: MemoryKind): MemoryItem[] {
  const cap = MEMORY_CAPS[kind];
  const ofKind = items.filter((item) => item.kind === kind);

  if (ofKind.length <= cap) return items;

  const evicted = new Set<MemoryItem>();

  for (let removed = ofKind.length - cap; removed > 0; removed -= 1) {
    const candidates = ofKind.filter((item) => !evicted.has(item));
    let victim = candidates[0];
    for (const candidate of candidates) {
      // Strict `<` keeps the earlier array position on a full tie.
      if (compareEvictionPriority(candidate, victim) < 0) victim = candidate;
    }
    evicted.add(victim);
  }

  return items.filter((item) => !evicted.has(item));
}

/**
 * Applies one update to memory.
 *
 * Order of operations matters and is fixed: base state → session increment →
 * additions (in the order given) → per-kind cap after each addition. Capping
 * per addition rather than at the end means a single update carrying eleven
 * themes cannot transiently hold eleven.
 *
 * Dropped additions are skipped silently here; callers that need the reasons
 * (agent.ts does) check them with `checkAddition`.
 */
export function applyMemoryUpdate(state: MemoryState | null, update: MemoryUpdate): MemoryState {
  const now = update.now;
  const clientId = state?.clientId ?? update.clientId ?? '';

  let items: MemoryItem[] = state ? state.items.map((item) => ({ ...item })) : [];
  let sessionCount = state?.sessionCount ?? 0;

  if (update.sessionIncrement) {
    sessionCount += 1;
  }

  for (const addition of update.additions ?? []) {
    const checked = checkAddition(addition?.kind, addition?.text);
    if (!checked.ok) continue;

    const normalised = normaliseMemoryText(checked.text);
    const existing = items.find(
      (item) => item.kind === checked.kind && normaliseMemoryText(item.text) === normalised,
    );

    if (existing) {
      // Provenance survives the repeat: firstSeen is when we first heard it,
      // and the stored text is the original phrasing, not the latest one.
      existing.mentions += 1;
      existing.lastSeen = now;
    } else {
      items.push({
        kind: checked.kind,
        text: checked.text,
        firstSeen: now,
        lastSeen: now,
        mentions: 1,
      });
    }

    items = applyCap(items, checked.kind);
  }

  return { clientId, sessionCount, updatedAt: now, items };
}
