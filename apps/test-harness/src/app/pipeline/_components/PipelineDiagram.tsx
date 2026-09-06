'use client';

import { AGENT_ORDER } from '@/lib/dependency-graph';
import type { AgentNodeState, AgentNodeStatus } from './deriveAgentStatuses';

// Node color states are derived purely from AGENT_ORDER + the AgentNodeStatus
// computed by deriveAgentStatuses.ts (itself sourced from dependency-graph.ts)
// — nothing here is hand-coded per agent beyond a display subtitle.
const NODE_STYLES: Record<AgentNodeState, string> = {
  selected:
    'border-transparent bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-[var(--shadow-soft)]',
  auto: 'border-transparent bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]',
  inactive:
    'border-[var(--color-outline-variant)] bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] opacity-50',
  skipped:
    'border-dashed border-[var(--color-outline-variant)] bg-transparent text-[var(--color-on-surface-variant)] opacity-40',
};

const STATE_LABELS: Record<AgentNodeState, string> = {
  selected: 'Selected',
  auto: 'Auto',
  inactive: 'Inactive',
  skipped: 'Skipped',
};

// Purely a display subtitle lookup — layout/order still comes from AGENT_ORDER.
const AGENT_SUBTITLE: Record<string, string> = {
  A1: 'Safety',
  'A9-pre': 'Governance (pre)',
  A8: 'Router',
  A2: 'Therapy response',
  'A9-post': 'Response review',
  A13: 'Session summary',
  A15: 'Memory extraction',
};

export default function PipelineDiagram({ statuses }: { statuses: AgentNodeStatus[] }) {
  const byAgent = new Map(statuses.map((s) => [s.agent, s]));

  return (
    <div
      className="flex items-stretch gap-1 overflow-x-auto pb-2"
      role="list"
      aria-label="Pipeline diagram"
    >
      {AGENT_ORDER.map((agent, i) => {
        const status = byAgent.get(agent);
        const state = status?.state ?? 'inactive';
        const nodeDescription = [
          agent,
          AGENT_SUBTITLE[agent] ?? null,
          STATE_LABELS[state],
          status?.blocked ? `blocked: ${status.blockedExplanation}` : null,
        ]
          .filter(Boolean)
          .join(', ');

        return (
          <div key={agent} className="flex items-center gap-1">
            {/* role="listitem" + a full aria-label expose the node's state to
                screen readers even though the hover-only `title` tooltip
                cannot be reached without a pointer. The visible sub-labels
                below (subtitle + uppercase state text) are the sighted,
                colorblind-safe equivalent — state is never color-only. */}
            <div
              className={`flex min-w-[112px] flex-col items-center gap-1 rounded-[var(--radius-lg)] border-2 px-3 py-2.5 text-center transition-colors ${NODE_STYLES[state]}`}
              role="listitem"
              aria-label={nodeDescription}
              title={status?.blocked ? status.blockedExplanation : STATE_LABELS[state]}
            >
              <span className="flex items-center gap-1 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)]">
                {status?.blocked ? <span aria-hidden="true">&#128274;</span> : null}
                {state === 'auto' ? <span aria-hidden="true">&#128279;</span> : null}
                {agent}
              </span>
              <span className="text-[10px] leading-tight opacity-80">
                {AGENT_SUBTITLE[agent] ?? agent}
              </span>
              <span className="text-[9px] font-[var(--text-label-sm--font-weight)] uppercase tracking-wide opacity-70">
                {STATE_LABELS[state]}
              </span>
            </div>

            {i < AGENT_ORDER.length - 1 ? (
              <span className="text-lg text-[var(--color-outline-variant)]" aria-hidden="true">
                &#8594;
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
