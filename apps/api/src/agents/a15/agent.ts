/**
 * A15 — the boundary between the session and long-term memory.
 *
 * A15 is deterministic and model-free: memory is *recorded*, not summarised
 * by an LLM. A model asked to "extract what's important" from a session will
 * eventually extract an interpretation ("client is resistant") that then
 * becomes permanent context for every later turn.
 *
 * Two jobs here:
 *
 *  1. `updateMemory` — apply an update inside the fail-closed envelope, and
 *     report what was dropped so a silent memory hole is visible in logs.
 *  2. `buildMemoryContext` — the small, bounded string other agents receive
 *     as prior-session context. This is internal prompt context, never
 *     client-facing prose: A12 remains the sole writer of anything a client
 *     reads.
 */

import { applyMemoryUpdate, checkAddition, emptyMemoryState, normaliseMemoryText } from './memory.js';
import type { AdditionRejection } from './memory.js';
import type { MemoryState, MemoryUpdate } from './types.js';

export const A15_AGENT_ID = 'A15' as const;

/**
 * Context budget handed to downstream agents (A3 takes it as
 * `userMemoryContext`). Small on purpose: memory is a hint that saves the
 * client from repeating themselves, not a dossier that crowds out what they
 * just said.
 */
export const MAX_MEMORY_CONTEXT_CHARS = 1200;

export interface DroppedAddition {
  kind: string;
  reason: AdditionRejection;
  /** Normalised text, so logs are searchable without persisting the content. */
  text: string;
}

export interface A15Input {
  state: MemoryState | null;
  update: MemoryUpdate;
}

export interface A15Output {
  agentId: typeof A15_AGENT_ID;
  /** Always a state — memory is additive, so there is no null payload path. */
  state: MemoryState;
  memoryContext: string | null;
  fallbackUsed: boolean;
  failureReason: string | null;
  droppedAdditions: DroppedAddition[];
}

function collectDropped(update: MemoryUpdate): DroppedAddition[] {
  const dropped: DroppedAddition[] = [];

  for (const addition of update.additions ?? []) {
    const checked = checkAddition(addition?.kind, addition?.text);
    if (checked.ok) continue;
    dropped.push({
      kind: checked.kind,
      reason: checked.reason,
      text: typeof addition?.text === 'string' ? normaliseMemoryText(addition.text) : '',
    });
  }

  return dropped;
}

/**
 * Renders memory as bounded context for other agents.
 *
 * Returns null when there is nothing to say, so callers can pass it straight
 * through as `userMemoryContext` without inventing an empty header. Item order
 * is the stored order, which is deterministic — a context string that shuffles
 * between runs defeats prompt caching and makes transcript diffs unreadable.
 */
export function buildMemoryContext(state: MemoryState | null): string | null {
  if (!state || state.items.length === 0) return null;

  const lines: string[] = [`Sessions so far: ${state.sessionCount}`];
  let length = lines[0].length;

  for (const item of state.items) {
    const line = `- [${item.kind}] ${item.text}`;
    if (length + 1 + line.length > MAX_MEMORY_CONTEXT_CHARS) break;
    lines.push(line);
    length += 1 + line.length;
  }

  return lines.join('\n');
}

/**
 * Applies an update to memory. Never throws.
 *
 * On an unexpected failure it returns the *previous* state with
 * `fallbackUsed: true` rather than throwing inside the turn loop: losing this
 * session's memory is recoverable on the next update, and a crash mid-turn
 * costs the client the conversation.
 */
export function updateMemory(input: A15Input): A15Output {
  const { state, update } = input;
  const droppedAdditions = collectDropped(update);

  try {
    const next = applyMemoryUpdate(state, update);
    return {
      agentId: A15_AGENT_ID,
      state: next,
      memoryContext: buildMemoryContext(next),
      fallbackUsed: false,
      failureReason: null,
      droppedAdditions,
    };
  } catch {
    const safe = state ?? emptyMemoryState(update.clientId ?? '', update.now);
    return {
      agentId: A15_AGENT_ID,
      state: { clientId: safe.clientId, sessionCount: safe.sessionCount, updatedAt: safe.updatedAt, items: safe.items.map((item) => ({ ...item })) },
      memoryContext: null,
      fallbackUsed: true,
      failureReason: 'memory_update_failed',
      droppedAdditions,
    };
  }
}
