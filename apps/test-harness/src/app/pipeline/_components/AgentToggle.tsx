'use client';

import type { TestAgentId } from '@evia/shared-types';
import type { AgentNodeState, AgentNodeStatus } from './deriveAgentStatuses';

const CHIP_STYLES: Record<AgentNodeState, string> = {
  selected: 'bg-[var(--color-primary)] text-[var(--color-on-primary)] border-transparent',
  auto: 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] border-transparent',
  inactive:
    'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)]',
  skipped:
    'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border-dashed border-[var(--color-outline-variant)] opacity-60',
};

/**
 * One toggle per agent. Rendering only — the actual computeActivation() /
 * tryDisable() calls live in page.tsx (both sourced exclusively from
 * dependency-graph.ts) and are wired in via onEnable/onDisable. This keeps
 * a single source of truth for {active, manuallySelected, autoActivated}
 * instead of duplicating dependency-graph calls per toggle.
 */
export default function AgentToggle({
  status,
  onEnable,
  onDisable,
}: {
  status: AgentNodeStatus;
  onEnable: (agent: TestAgentId) => void;
  onDisable: (agent: TestAgentId) => void;
}) {
  const { agent, state, requiredBy, blocked, blockedExplanation } = status;
  const checked = state === 'selected' || state === 'auto';
  const isSkipped = state === 'skipped';

  const stateLabel =
    state === 'auto'
      ? `Auto (required by ${requiredBy.join(', ') || 'another active agent'})`
      : state === 'skipped'
        ? `${agent} is bypassed by Mock Mode`
        : state === 'selected'
          ? 'Selected'
          : 'Inactive';

  const title = blocked ? blockedExplanation : stateLabel;

  // Full, state-aware label read by screen readers — the visible chip only
  // shows an icon (lock/link) as a non-color cue, so the label carries the
  // rest of the state description that a sighted user gets from color/icon.
  const ariaLabel = `${agent}: ${stateLabel}${blocked ? `. Blocked: ${blockedExplanation}` : ''}`;

  const handleChange = () => {
    if (isSkipped) return;
    if (checked) {
      onDisable(agent);
    } else {
      onEnable(agent);
    }
  };

  return (
    <label
      className={`flex select-none items-center gap-1.5 rounded-[var(--radius-full)] border px-3 py-1.5 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] transition-colors ${CHIP_STYLES[state]} ${
        isSkipped ? 'cursor-not-allowed' : 'cursor-pointer'
      }`}
      title={title}
    >
      {/*
        A native <input type="checkbox"> inside a <label> is keyboard-
        operable for free: it sits in the natural Tab order and Space
        toggles it (checked/unchecked is announced by the browser's own
        accessibility tree via the native "checked" state — no custom
        role/aria-checked needed). `sr-only` hides it visually without
        removing it from that order, so Tab+Space already works here.
      */}
      <input
        type="checkbox"
        checked={checked}
        disabled={isSkipped}
        onChange={handleChange}
        className="sr-only"
        aria-label={ariaLabel}
      />
      {blocked ? <span aria-hidden="true">&#128274;</span> : null}
      {state === 'auto' ? <span aria-hidden="true">&#128279;</span> : null}
      {agent}
    </label>
  );
}
