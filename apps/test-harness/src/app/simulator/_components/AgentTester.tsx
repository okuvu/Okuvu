'use client';

import AgentRunner from '@/app/agents/_components/AgentRunner';
import PanelHeader from './PanelHeader';

/**
 * The Simulator's conversation pane always runs the full pipeline
 * (A1 -> A9-pre -> A8 -> A2 -> A9-post) — there was no way to pick a single
 * agent and test it in isolation without leaving for the separate /agents
 * page. This section reuses that page's AgentRunner unchanged (it's a
 * self-contained component with its own tRPC calls, no props needed) rather
 * than forking a second implementation.
 */
export default function AgentTester() {
  return (
    <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-simulator-surface)] p-[var(--spacing-md)] shadow-[var(--shadow-soft)]">
      <PanelHeader icon="smart_toy">Agent tester</PanelHeader>
      <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
        Test one agent in isolation with a mocked session context, instead of running the full
        conversation pipeline.
      </p>
      <AgentRunner />
    </div>
  );
}
