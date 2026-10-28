/**
 * The 15-agent roster, as code — the TypeScript counterpart of
 * reference/python-core/okuvu/agents/registry.py.
 *
 * The repo's `apps/api/src/agents/` directory grew organically: A1, A2, A8 and
 * A9 exist, A9-post and J2 are components rather than roster members, and
 * nothing in the codebase states what the full set is or what each agent is
 * allowed to write. That is how a second severity writer gets added in a
 * refactor and nobody notices until two components disagree about a client's
 * risk level mid-crisis.
 *
 * So identity lives here as data, `validateRoster()` enforces the locked rules
 * mechanically, and the roster has tests. Anything not listed here has no
 * write authority.
 */

export type AgentGroup =
  | 'safety'
  | 'process'
  | 'orchestration'
  | 'governance'
  | 'learning'
  | 'delivery'
  | 'measurement'
  | 'context';

/** What an agent may commit. Anything absent from its `writes` is forbidden. */
export type AgentWrite =
  | 'severity'
  | 'selection'
  | 'payload'
  | 'text'
  | 'audio'
  | 'assessment'
  | 'insight'
  | 'aggregate'
  | 'contract'
  | 'memory';

export interface AgentSpec {
  id: string;
  name: string;
  group: AgentGroup;
  purpose: string;
  writes: ReadonlySet<AgentWrite>;
  /** Runs on the turn path (latency-critical) rather than asynchronously. */
  inTurnLoop: boolean;
  /** May produce text a client reads. Only A12 by rule. */
  clientFacing: boolean;
  canVeto: boolean;
  canSelect: boolean;
  /** May *signal* severity. Never commits it — that is A9 alone (rule B1). */
  maySignalSeverity: boolean;
}

/** A8 selects at most this many specialists per turn (rule from the EVIA matrix). */
export const MAX_SPECIALISTS_PER_TURN = 2;

export const ROSTER_IDS = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8',
  'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15',
] as const;

export type AgentId = (typeof ROSTER_IDS)[number];

/**
 * Process-group specialists, i.e. the agents A8 may select. A2 is a
 * specialist by the registry's definition (group 'process', writes payload) —
 * even though the repo's current A2 also happens to produce prose, which is a
 * deviation documented in docs/AGENTS-15.md rather than a second roster rule.
 */
export const SPECIALIST_IDS: readonly string[] = ['A2', 'A3', 'A4', 'A5', 'A6', 'A7'];

const w = (...writes: AgentWrite[]): ReadonlySet<AgentWrite> => new Set(writes);

export const ROSTER: readonly AgentSpec[] = [
  {
    id: 'A1',
    name: 'Alliance & Security Agent',
    group: 'safety',
    purpose: 'Gate every turn on risk; hold the therapeutic alliance frame.',
    writes: w(),
    inTurnLoop: true,
    clientFacing: false,
    canVeto: true,
    canSelect: false,
    // Signal only. B1 gives the commit to A9; a second severity writer is a
    // race condition, not a redundancy.
    maySignalSeverity: true,
  },
  {
    id: 'A2',
    name: 'Emotion Regulation Agent',
    group: 'process',
    purpose: 'Name, validate, down-regulate.',
    writes: w('payload'),
    inTurnLoop: true,
    clientFacing: false,
    canVeto: false,
    canSelect: false,
    maySignalSeverity: false,
  },
  {
    id: 'A3',
    name: 'Cognitive Restructuring Agent',
    group: 'process',
    purpose: 'Surface and gently test a thought; never argue with it.',
    writes: w('payload'),
    inTurnLoop: true,
    clientFacing: false,
    canVeto: false,
    canSelect: false,
    maySignalSeverity: false,
  },
  {
    id: 'A4',
    name: 'Behavioural Activation Agent',
    group: 'process',
    purpose: 'Small, scheduled, real-world action.',
    writes: w('payload'),
    inTurnLoop: true,
    clientFacing: false,
    canVeto: false,
    canSelect: false,
    maySignalSeverity: false,
  },
  {
    id: 'A5',
    name: 'Interpersonal Skills Agent',
    group: 'process',
    purpose: 'Boundaries, repair, asking, refusing.',
    writes: w('payload'),
    inTurnLoop: true,
    clientFacing: false,
    canVeto: false,
    canSelect: false,
    maySignalSeverity: false,
  },
  {
    id: 'A6',
    name: 'Meaning & Values Agent',
    group: 'process',
    purpose: 'What matters here; values-consistent direction.',
    writes: w('payload'),
    inTurnLoop: true,
    clientFacing: false,
    canVeto: false,
    canSelect: false,
    maySignalSeverity: false,
  },
  {
    id: 'A7',
    name: 'Maintenance & Transition Agent',
    group: 'process',
    purpose: 'Consolidate gains; prepare for reduced contact.',
    writes: w('payload'),
    inTurnLoop: true,
    clientFacing: false,
    canVeto: false,
    canSelect: false,
    maySignalSeverity: false,
  },
  {
    id: 'A8',
    name: 'Smart Router & Orchestrator',
    group: 'orchestration',
    purpose: 'Pick <=2 specialists; enforce contract. No prose.',
    writes: w('selection'),
    inTurnLoop: true,
    clientFacing: false,
    canVeto: false,
    canSelect: true,
    maySignalSeverity: false,
  },
  {
    id: 'A9',
    name: 'System Guardian',
    group: 'governance',
    purpose: 'Ethical authority. Passive risk scan. Overrides all, including A1.',
    writes: w('severity'),
    inTurnLoop: true,
    clientFacing: false,
    canVeto: true,
    canSelect: false,
    maySignalSeverity: false,
  },
  {
    id: 'A10',
    name: 'Insight Generator',
    group: 'learning',
    purpose: 'Descriptive patterns for the therapist. Never talks to the client.',
    writes: w('insight'),
    inTurnLoop: false,
    clientFacing: false,
    canVeto: false,
    canSelect: false,
    maySignalSeverity: false,
  },
  {
    id: 'A11',
    name: 'Learning Optimiser',
    group: 'learning',
    purpose: 'Aggregate signal across caseload. Never talks to the client.',
    writes: w('aggregate'),
    inTurnLoop: false,
    clientFacing: false,
    canVeto: false,
    canSelect: false,
    maySignalSeverity: false,
  },
  {
    id: 'A12',
    name: 'Content Compiler',
    group: 'delivery',
    purpose: 'Sole writer of user-facing text.',
    writes: w('text'),
    inTurnLoop: true,
    clientFacing: true,
    canVeto: false,
    canSelect: false,
    maySignalSeverity: false,
  },
  {
    id: 'A13',
    name: 'Delivery / Speaking Agent',
    group: 'delivery',
    purpose: 'Sole writer of audio. No new content.',
    writes: w('audio'),
    inTurnLoop: false,
    clientFacing: false,
    canVeto: false,
    canSelect: false,
    maySignalSeverity: false,
  },
  {
    id: 'A14',
    name: 'Assessment & Measurement Agent',
    group: 'measurement',
    purpose: 'Non-diagnostic change tracking.',
    writes: w('assessment'),
    inTurnLoop: false,
    clientFacing: false,
    canVeto: false,
    canSelect: false,
    maySignalSeverity: false,
  },
  {
    id: 'A15',
    name: 'Memory & Continuity Agent',
    group: 'context',
    purpose: 'Persists contract, memory, continuity.',
    writes: w('contract', 'memory'),
    inTurnLoop: true,
    clientFacing: false,
    canVeto: false,
    canSelect: false,
    maySignalSeverity: false,
  },
];

export const ROSTER_BY_ID: ReadonlyMap<string, AgentSpec> = new Map(ROSTER.map((a) => [a.id, a]));

export function getAgent(id: string): AgentSpec | undefined {
  return ROSTER_BY_ID.get(id);
}

export function specialistSpecs(roster: readonly AgentSpec[] = ROSTER): AgentSpec[] {
  return roster.filter((a) => a.group === 'process');
}

// ─── Mechanical enforcement ───────────────────────────────────────────────

export type RosterViolationCode =
  | 'duplicate_id'
  | 'roster_incomplete'
  | 'severity_writer_ambiguous'
  | 'text_writer_ambiguous'
  | 'audio_writer_ambiguous'
  | 'selection_writer_ambiguous'
  | 'veto_authority_misplaced'
  | 'severity_signal_misplaced'
  | 'client_facing_misplaced'
  | 'specialist_shape_invalid'
  | 'specialist_count_invalid'
  | 'client_facing_not_in_turn_loop';

export interface RosterViolation {
  code: RosterViolationCode;
  detail: string;
}

function idsWriting(roster: readonly AgentSpec[], write: AgentWrite): string[] {
  return roster.filter((a) => a.writes.has(write)).map((a) => a.id);
}

/**
 * Returns every rule violation; empty array means the roster is sound.
 * Returning violations instead of throwing lets a test assert the exact
 * broken rule, and lets a future admin UI show all problems at once.
 */
export function validateRoster(roster: readonly AgentSpec[] = ROSTER): RosterViolation[] {
  const violations: RosterViolation[] = [];

  const seen = new Set<string>();
  for (const agent of roster) {
    if (seen.has(agent.id)) {
      violations.push({ code: 'duplicate_id', detail: `${agent.id} appears more than once` });
    }
    seen.add(agent.id);
  }

  const missing = ROSTER_IDS.filter((id) => !seen.has(id));
  const extra = [...seen].filter((id) => !(ROSTER_IDS as readonly string[]).includes(id));
  if (missing.length > 0 || extra.length > 0) {
    violations.push({
      code: 'roster_incomplete',
      detail: `missing: [${missing.join(', ')}] unexpected: [${extra.join(', ')}]`,
    });
  }

  const expectSingle = (write: AgentWrite, code: RosterViolationCode): void => {
    const writers = idsWriting(roster, write);
    if (writers.length !== 1) {
      violations.push({ code, detail: `${write} is written by [${writers.join(', ')}] — exactly one writer required` });
    }
  };

  expectSingle('severity', 'severity_writer_ambiguous');
  expectSingle('text', 'text_writer_ambiguous');
  expectSingle('audio', 'audio_writer_ambiguous');
  expectSingle('selection', 'selection_writer_ambiguous');

  for (const agent of roster) {
    // B1: A1 may signal risk; only A9 commits it.
    if (agent.maySignalSeverity && agent.writes.has('severity')) {
      violations.push({
        code: 'severity_signal_misplaced',
        detail: `${agent.id} both signals and writes severity`,
      });
    }
    if (agent.clientFacing && !agent.writes.has('text')) {
      violations.push({
        code: 'client_facing_misplaced',
        detail: `${agent.id} is client-facing but does not write text`,
      });
    }
    if (agent.clientFacing && !agent.inTurnLoop) {
      violations.push({
        code: 'client_facing_not_in_turn_loop',
        detail: `${agent.id} is client-facing but sits outside the turn loop`,
      });
    }
    if (agent.canVeto && agent.group !== 'safety' && agent.group !== 'governance') {
      violations.push({
        code: 'veto_authority_misplaced',
        detail: `${agent.id} can veto outside safety/governance`,
      });
    }
  }

  for (const spec of specialistSpecs(roster)) {
    const okShape =
      spec.writes.size === 1 &&
      spec.writes.has('payload') &&
      spec.inTurnLoop &&
      !spec.clientFacing &&
      !spec.canSelect;
    if (!okShape) {
      violations.push({
        code: 'specialist_shape_invalid',
        detail: `${spec.id} must write payload only, run in-turn, and never be client-facing or select`,
      });
    }
  }

  if (specialistSpecs(roster).length !== SPECIALIST_IDS.length) {
    violations.push({
      code: 'specialist_count_invalid',
      detail: `${specialistSpecs(roster).length} specialists defined; the roster fixes ${SPECIALIST_IDS.length} (A2–A7)`,
    });
  }

  return violations;
}

export function assertValidRoster(roster: readonly AgentSpec[] = ROSTER): void {
  const violations = validateRoster(roster);
  if (violations.length > 0) {
    throw new Error(
      `roster invalid: ${violations.map((v) => `${v.code} (${v.detail})`).join('; ')}`,
    );
  }
}
