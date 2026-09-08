import type { TestAgentId } from '@okuvu/shared-types';

// ─── TH-S19: Dependency-Aware Agent Toggle Engine ──────────────────────────
//
// Pure logic module implementing the pipeline's agent-dependency graph and
// the auto-activation / block / mock-mode rules described in
// docs/planning/TEST_HARNESS_Implementation_Plan.md §3.5.
//
// No UI, no router, no tRPC, no DB — this is consumed by TH-S20 (pipeline
// diagram UI) and by TestRun.activatedAgents / manuallySelectedAgents /
// dependencyGraph in later stories.

// ─── The canonical dependency graph ─────────────────────────────────────────
//
//   A9-pre  -> [A1]
//   A8      -> [A1, A9-pre]
//   A2      -> [A1, A9-pre, A8]
//   A9-post -> [A2]
//   A13     -> [A2]
//   A15     -> [A2, A13]
//
// A1 is the root (no dependencies). A10A is out of scope for this graph per
// the story spec — it has no dependents/dependencies here.
export const DEPENDS_ON: Record<TestAgentId, TestAgentId[]> = {
  A1: [],
  'A9-pre': ['A1'],
  A8: ['A1', 'A9-pre'],
  A2: ['A1', 'A9-pre', 'A8'],
  'A9-post': ['A2'],
  A13: ['A2'],
  A15: ['A2', 'A13'],
  A10A: [],
};

// Canonical pipeline order (from orchestrator.ts / plan §3.5), used by TH-S20
// to lay out the pipeline diagram.
export const AGENT_ORDER: TestAgentId[] = ['A1', 'A9-pre', 'A8', 'A2', 'A9-post', 'A13', 'A15'];

// Human-readable labels for building generated explanation strings. This is
// purely a display lookup — the dependency *logic* always comes from
// DEPENDS_ON, never re-derived here.
const AGENT_DESCRIPTIONS: Record<TestAgentId, string> = {
  A1: 'safety classification',
  'A9-pre': 'governance check',
  A8: 'routing decision',
  A2: 'therapy response',
  'A9-post': 'response review',
  A13: 'session summary',
  A15: 'memory extraction',
  A10A: 'A10A',
};

function describe(agent: TestAgentId): string {
  return AGENT_DESCRIPTIONS[agent] ?? agent;
}

/**
 * Walk DEPENDS_ON iteratively to compute the full transitive closure of
 * upstream dependencies for a given agent (not including the agent itself).
 */
function transitiveDependencies(agent: TestAgentId): Set<TestAgentId> {
  const result = new Set<TestAgentId>();
  const stack: TestAgentId[] = [...(DEPENDS_ON[agent] ?? [])];

  while (stack.length > 0) {
    const next = stack.pop()!;
    if (result.has(next)) continue;
    result.add(next);
    for (const upstream of DEPENDS_ON[next] ?? []) {
      if (!result.has(upstream)) stack.push(upstream);
    }
  }

  return result;
}

export interface ActivationResult {
  active: TestAgentId[];
  autoActivated: Map<TestAgentId, TestAgentId[]>;
  manuallySelected: TestAgentId[];
  explanation: string;
}

/**
 * Compute the result of toggling `toggled` ON, given the currently active
 * set. Auto-activates the full transitive closure of `toggled`'s upstream
 * dependencies.
 */
export function computeActivation(
  toggled: TestAgentId,
  currentlyActive: TestAgentId[] = [],
): ActivationResult {
  const currentSet = new Set(currentlyActive);
  const deps = transitiveDependencies(toggled);

  const activeSet = new Set<TestAgentId>([...currentSet, toggled, ...deps]);
  const active = AGENT_ORDER.filter((a) => activeSet.has(a)).concat(
    [...activeSet].filter((a) => !AGENT_ORDER.includes(a)),
  );

  // manuallySelected = everything explicitly clicked on (currentlyActive +
  // toggled), i.e. NOT auto-activated as a dependency side effect.
  const manuallySelectedSet = new Set<TestAgentId>([...currentSet, toggled]);
  const manuallySelected = active.filter((a) => manuallySelectedSet.has(a));

  // Only agents newly added to the active set as a side effect of this
  // toggle (i.e. weren't already active and aren't the toggled agent itself)
  // count as "auto-activated" by *this* action.
  const newlyAutoActivated = [...deps].filter((a) => !currentSet.has(a) && a !== toggled);

  // autoActivated: for each newly-activated dependency agent, list every
  // agent in the final active set whose DEPENDS_ON list (directly) includes
  // it.
  const autoActivated = new Map<TestAgentId, TestAgentId[]>();
  for (const dep of newlyAutoActivated) {
    const requiredBy = active.filter((a) => (DEPENDS_ON[a] ?? []).includes(dep));
    autoActivated.set(dep, requiredBy);
  }

  const explanation = buildActivationExplanation(toggled, newlyAutoActivated);

  return { active, autoActivated, manuallySelected, explanation };
}

function buildActivationExplanation(toggled: TestAgentId, newlyAutoActivated: TestAgentId[]): string {
  if (newlyAutoActivated.length === 0) {
    return `Activated ${toggled}`;
  }

  // Order the auto-activated list by pipeline order for a readable message.
  const ordered = AGENT_ORDER.filter((a) => newlyAutoActivated.includes(a)).concat(
    newlyAutoActivated.filter((a) => !AGENT_ORDER.includes(a)),
  );

  const namesList = ordered.join(', ');
  const reasons = ordered.map((a) => `${describe(a)} (${a})`);
  const reasonsList = joinWithAnd(reasons);

  return `Activated ${namesList} — ${toggled} requires ${reasonsList}`;
}

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export interface DisableCheckResult {
  allowed: boolean;
  blockedBy?: TestAgentId[];
  explanation: string;
}

/**
 * Pure check: can `agent` be disabled given the currently active set? Does
 * not mutate state — the caller removes `agent` from the active set if
 * `allowed` is true.
 */
export function tryDisable(agent: TestAgentId, currentlyActive: TestAgentId[]): DisableCheckResult {
  const blockedBy = currentlyActive.filter(
    (other) => other !== agent && (DEPENDS_ON[other] ?? []).includes(agent),
  );

  if (blockedBy.length > 0) {
    const ordered = AGENT_ORDER.filter((a) => blockedBy.includes(a)).concat(
      blockedBy.filter((a) => !AGENT_ORDER.includes(a)),
    );
    const namesList = joinWithAnd(ordered);
    return {
      allowed: false,
      blockedBy: ordered,
      explanation: `Cannot disable ${agent} — ${namesList} require${ordered.length === 1 ? 's' : ''} ${describe(agent)}`,
    };
  }

  return { allowed: true, explanation: '' };
}

export type MockInput = 'safetyState' | 'governanceState' | 'routerDecision' | 'retrievedContext';

export interface MockModeResult {
  requiredInputs: MockInput[];
}

// Per-agent mock inputs required to run the agent in isolation, bypassing its
// upstream chain (plan §3.5 "Mock Injection for Skipped Agents").
//
// The plan specifies this in detail only for A2: safetyState, governanceState,
// routerDecision, retrievedContext — the four upstream signals A1/A9-pre/A8
// would have produced.
//
// For the rest we reason from the dependency graph about what each agent's
// immediate upstream neighborhood produces, rather than re-deriving the raw
// A1/A9-pre/A8 signals for every downstream agent:
//   - A1 has no dependencies -> no mock inputs needed.
//   - A9-pre depends only on A1 -> needs A1's safety output.
//   - A8 depends on A1 + A9-pre -> needs both their outputs.
//   - A2 depends on A1 + A9-pre + A8 -> needs all four signals (per plan).
//   - A9-post, A13, A15 depend (directly or transitively) only on A2's
//     output, not on the raw upstream safety/governance/router signals — the
//     "mock" for these agents is more naturally A2's own output
//     (retrievedContext stands in as the carrier for "A2's produced
//     context/response" since there is no dedicated MockInput field for it
//     in this story's type; A15 additionally consumes A13's summary but that
//     is out of scope for the four-field MockInput union defined here).
const MOCK_MODE_INPUTS: Record<TestAgentId, MockInput[]> = {
  A1: [],
  'A9-pre': ['safetyState'],
  A8: ['safetyState', 'governanceState'],
  A2: ['safetyState', 'governanceState', 'routerDecision', 'retrievedContext'],
  'A9-post': ['retrievedContext'],
  A13: ['retrievedContext'],
  A15: ['retrievedContext'],
  A10A: [],
};

/**
 * Which mock inputs a user would need to supply to run `agent` in isolation
 * without executing its upstream dependencies.
 */
export function mockModeFor(agent: TestAgentId): MockModeResult {
  return { requiredInputs: [...(MOCK_MODE_INPUTS[agent] ?? [])] };
}
