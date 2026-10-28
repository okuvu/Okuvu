/**
 * A15 — Memory & Continuity.
 *
 * Long-term memory is the most dangerous artifact this system produces. A
 * wrong note about a client does not decay: it is replayed into every future
 * prompt, treated as established fact, and slowly turns into the therapist's
 * impression of the person. So the rules are narrow:
 *
 *  - memory stores *context*, never clinical judgement (no severity, no
 *    diagnosis, no risk level — that is A9's, and only in the session).
 *  - memory is capped per kind and evicts mechanically. Nothing "important"
 *    is kept because it felt important.
 *  - crisis narratives are never persisted. A disclosure of self-harm belongs
 *    in the safety path and the clinical record, not in a prompt fragment
 *    replayed for months.
 *
 * The data shape is deliberately boring: flat items with a kind, a normalised
 * text, and provenance (firstSeen / lastSeen / mentions). Anything richer
 * becomes an ontology nobody maintains.
 */

/**
 * The six kinds of thing A15 remembers. Closed union: adding a seventh is a
 * deliberate edit here plus caps in `MEMORY_CAPS`, not an arbitrary tag.
 *
 *  - `life_context`      — stable facts about the client's life
 *  - `current_stressors` — what is hard right now (short-lived)
 *  - `recurring_themes`  — patterns that come back across sessions
 *  - `what_helps`        — things the client says have helped
 *  - `what_doesnt_help`  — things that have not
 *  - `significant_events`— bereavement, moves, job changes, dates
 */
export type MemoryKind =
  | 'life_context'
  | 'current_stressors'
  | 'recurring_themes'
  | 'what_helps'
  | 'what_doesnt_help'
  | 'significant_events';

/**
 * One remembered item.
 *
 * `firstSeen` is immutable once set — "when did we first hear this" is the
 * only field that makes a memory auditable. `mentions` counts how many times
 * it has come up, which is both useful context and the secondary eviction
 * key, so a one-off aside loses to a theme the client keeps returning to.
 */
export interface MemoryItem {
  kind: MemoryKind;
  text: string;
  firstSeen: string;
  lastSeen: string;
  mentions: number;
}

export interface MemoryState {
  clientId: string;
  sessionCount: number;
  updatedAt: string;
  items: MemoryItem[];
}

export interface MemoryUpdate {
  /** ISO-8601 timestamp of this update; becomes `updatedAt` and `lastSeen`. */
  now: string;
  /** Adds 1 to `sessionCount`. Defaults to no change. */
  sessionIncrement?: boolean;
  additions?: Array<{ kind: MemoryKind; text: string }>;
  /**
   * Only consulted when `state` is null (creation). When a state exists its
   * `clientId` always wins — an update cannot re-address memory to a
   * different client, which is how one client's context ends up in another's
   * prompt.
   */
  clientId?: string;
}

/**
 * Per-kind caps. Chosen rather than uniform because the kinds have different
 * shelf lives: `current_stressors` churn every few weeks and a stale stressor
 * is actively misleading, while `significant_events` are the few durable
 * facts worth keeping.
 *
 * On overflow the oldest `lastSeen` is evicted first (see `applyMemoryUpdate`),
 * so these caps bound prompt size without a summarisation model in the loop.
 */
export const MEMORY_CAPS: Record<MemoryKind, number> = {
  life_context: 8,
  current_stressors: 6,
  recurring_themes: 8,
  what_helps: 8,
  what_doesnt_help: 8,
  significant_events: 10,
};

/** Hard ceiling on a single memory item, matching the payload char budget. */
export const MAX_MEMORY_TEXT_CHARS = 240;
