import type { TestAgentId } from '@evia/shared-types';
import { AGENT_ORDER, tryDisable } from '@/lib/dependency-graph';

export type AgentNodeState = 'selected' | 'auto' | 'inactive' | 'skipped';

export interface AgentNodeStatus {
  agent: TestAgentId;
  state: AgentNodeState;
  /** Agents that require this one to stay active (only populated when state === 'auto'). */
  requiredBy: TestAgentId[];
  /** True when this agent is active and disabling it would be blocked by another active agent. */
  blocked: boolean;
  /** dependency-graph.ts's tryDisable() explanation, only set when blocked. */
  blockedExplanation: string;
}

/**
 * Pure derivation of per-node diagram/toggle state from dependency-graph.ts's
 * outputs (`active`, `manuallySelected`, `autoActivated` from computeActivation,
 * plus a live `tryDisable` check per active agent) and the mock-mode bypass
 * set. No transitive-closure or block-checking logic is computed here — it is
 * only read off dependency-graph.ts's return values.
 */
export function deriveAgentStatuses(params: {
  active: TestAgentId[];
  manuallySelected: TestAgentId[];
  autoActivated: Map<TestAgentId, TestAgentId[]>;
  skipped: Set<TestAgentId>;
}): AgentNodeStatus[] {
  const { active, manuallySelected, autoActivated, skipped } = params;
  const manualSet = new Set(manuallySelected);

  return AGENT_ORDER.map((agent) => {
    if (skipped.has(agent)) {
      return { agent, state: 'skipped' as const, requiredBy: [], blocked: false, blockedExplanation: '' };
    }

    const isActive = active.includes(agent);
    let state: AgentNodeState = 'inactive';
    let requiredBy: TestAgentId[] = [];

    if (isActive && autoActivated.has(agent) && !manualSet.has(agent)) {
      state = 'auto';
      requiredBy = autoActivated.get(agent) ?? [];
    } else if (isActive) {
      state = 'selected';
    }

    let blocked = false;
    let blockedExplanation = '';
    if (isActive) {
      const check = tryDisable(agent, active);
      blocked = !check.allowed;
      blockedExplanation = check.explanation;
    }

    return { agent, state, requiredBy, blocked, blockedExplanation };
  });
}
