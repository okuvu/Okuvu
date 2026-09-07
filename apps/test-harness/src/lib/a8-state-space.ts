import type { SafetyState, GovernanceState, RouterDecision } from '@evia/shared-types';
import { routeTurn } from '@evia/api/src/agents/a8-router';

// ─── TH-S13: A8 router decision-table state space ──────────────────────────
//
// Fixed session_count/turn_count baseline (2, 2) so the special
// session_count === 1 && turn_count === 1 first-turn case (which forces
// A2/alliance-building regardless of safety/governance state) never fires,
// per the story spec. This lets us enumerate the "steady state" 5x3 = 15
// cell decision table below.

export const ALL_SAFETY_STATES: readonly SafetyState[] = ['S0', 'S1', 'S2', 'S3', 'S4'];
export const ALL_GOVERNANCE_STATES: readonly GovernanceState[] = ['Active', 'Restricted', 'Blocked'];

export const FIXED_SESSION_COUNT = 2;
export const FIXED_TURN_COUNT = 2;

// Verified 15-cell expected table (safety_state x governance_state), derived
// directly from apps/api/src/agents/a8-router.ts's routeTurn logic with the
// fixed session_count=2, turn_count=2 baseline above.
//
// Fixed 2026-09-07 (OKUVU finding H-2): every Blocked row below used to
// expect {agent: 'crisis'} regardless of safety_state — that was this table
// encoding a real routing bug as "verified/correct" rather than checking
// against actual intended behavior. Crisis is reserved for safety_state=S4
// only; Blocked at any other safety state routes to A2 mode='blocked' (a
// real, persisted turn with a static policy-boundary reply, never silence).
const EXPECTED_TABLE: Record<SafetyState, Record<GovernanceState, RouterDecision>> = {
  S0: {
    Active: { agent: 'A2', mode: 'normal' },
    Restricted: { agent: 'A2', mode: 'grounding-only' },
    Blocked: { agent: 'A2', mode: 'blocked' },
  },
  S1: {
    Active: { agent: 'A2', mode: 'normal' },
    Restricted: { agent: 'A2', mode: 'grounding-only' },
    Blocked: { agent: 'A2', mode: 'blocked' },
  },
  S2: {
    Active: { agent: 'A2', mode: 'normal' },
    Restricted: { agent: 'A2', mode: 'grounding-only' },
    Blocked: { agent: 'A2', mode: 'blocked' },
  },
  S3: {
    Active: { agent: 'A2', mode: 'grounding-only' },
    Restricted: { agent: 'A2', mode: 'grounding-only' },
    Blocked: { agent: 'A2', mode: 'blocked' },
  },
  S4: {
    Active: { agent: 'crisis' },
    Restricted: { agent: 'crisis' },
    Blocked: { agent: 'crisis' },
  },
};

export interface A8StateSpaceCell {
  safety_state: SafetyState;
  governance_state: GovernanceState;
  actual: RouterDecision;
  expected: RouterDecision;
  pass: boolean;
}

function decisionsEqual(a: RouterDecision, b: RouterDecision): boolean {
  return a.agent === b.agent && a.mode === b.mode;
}

/**
 * Enumerate all 15 cells of the A8 router decision table (5 safety states x
 * 3 governance states), calling the real production `routeTurn` for each
 * cell with a fixed session_count/turn_count baseline, and comparing against
 * the verified expected table.
 */
export function enumerateA8Cells(): A8StateSpaceCell[] {
  const cells: A8StateSpaceCell[] = [];

  for (const safety_state of ALL_SAFETY_STATES) {
    for (const governance_state of ALL_GOVERNANCE_STATES) {
      const actual = routeTurn({
        safety_state,
        governance_state,
        session_count: FIXED_SESSION_COUNT,
        turn_count: FIXED_TURN_COUNT,
      });
      const expected = EXPECTED_TABLE[safety_state][governance_state];
      cells.push({
        safety_state,
        governance_state,
        actual,
        expected,
        pass: decisionsEqual(actual, expected),
      });
    }
  }

  return cells;
}
