import { describe, it, expect } from 'vitest';
import { routeTurn } from '../agents/a8-router.js';
import type { RouterInput } from '@okuvu/shared-types';

const s0normal: RouterInput = { safety_state: 'S0', session_count: 5, turn_count: 10 };
const s1normal: RouterInput = { safety_state: 'S1', session_count: 5, turn_count: 10 };
const s2normal: RouterInput = { safety_state: 'S2', session_count: 5, turn_count: 10 };
const s3grounding: RouterInput = { safety_state: 'S3', session_count: 5, turn_count: 10 };
const s4crisis: RouterInput = { safety_state: 'S4', session_count: 5, turn_count: 10 };

describe('A8 Router — 4 Gates', () => {
  describe('Gate 1 — Crisis (S4)', () => {
    it('returns crisis for S4', () => {
      expect(routeTurn(s4crisis)).toEqual({ agent: 'crisis' });
    });

    it('returns crisis for S4 even when first session and first turn (precedence)', () => {
      const input: RouterInput = { safety_state: 'S4', session_count: 1, turn_count: 1 };
      expect(routeTurn(input)).toEqual({ agent: 'crisis' });
    });
  });

  describe('Gate 2 — Grounding (S3)', () => {
    it('returns A2 grounding-only for S3', () => {
      expect(routeTurn(s3grounding)).toEqual({ agent: 'A2', mode: 'grounding-only' });
    });
  });

  describe('Gate 3 — Normal (S0, S1, S2)', () => {
    it('returns A2 normal for S0', () => {
      expect(routeTurn(s0normal)).toEqual({ agent: 'A2', mode: 'normal' });
    });

    it('returns A2 normal for S1', () => {
      expect(routeTurn(s1normal)).toEqual({ agent: 'A2', mode: 'normal' });
    });

    it('returns A2 normal for S2', () => {
      expect(routeTurn(s2normal)).toEqual({ agent: 'A2', mode: 'normal' });
    });
  });

  describe('Gate 4 — Alliance-building (first session + first turn)', () => {
    it('returns A2 alliance-building for first session and first turn with S0', () => {
      const input: RouterInput = { safety_state: 'S0', session_count: 1, turn_count: 1 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'alliance-building' });
    });
  });

  describe('Safety defaults — invalid safety_state', () => {
    it('returns crisis for invalid safety_state (S5)', () => {
      const input = { safety_state: 'S5', session_count: 1, turn_count: 1 } as unknown as RouterInput;
      expect(routeTurn(input)).toEqual({ agent: 'crisis' });
    });

    it('returns crisis for missing safety_state', () => {
      const input = { session_count: 1, turn_count: 1 } as RouterInput;
      expect(routeTurn(input)).toEqual({ agent: 'crisis' });
    });

    it('returns crisis for null safety_state', () => {
      const input: RouterInput = { safety_state: null, session_count: 1, turn_count: 1 };
      expect(routeTurn(input)).toEqual({ agent: 'crisis' });
    });

    it('returns crisis for undefined safety_state', () => {
      const input: RouterInput = { safety_state: undefined, session_count: 1, turn_count: 1 };
      expect(routeTurn(input)).toEqual({ agent: 'crisis' });
    });
  });

  describe('Resilience — missing session or turn data', () => {
    it('handles undefined session_count gracefully (falls to normal)', () => {
      const input = { safety_state: 'S0', turn_count: 1 } as RouterInput;
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'normal' });
    });

    it('handles undefined turn_count gracefully (falls to normal)', () => {
      const input = { safety_state: 'S0', session_count: 1 } as RouterInput;
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'normal' });
    });
  });

  describe('Governance state — routing influence', () => {
    it('returns A2 blocked mode (NOT crisis) when governance is Blocked (safety S0)', () => {
      const input: RouterInput = { safety_state: 'S0', governance_state: 'Blocked', session_count: 5, turn_count: 10 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'blocked' });
    });

    it('returns A2 blocked mode (NOT crisis) when governance is Blocked (safety S2)', () => {
      const input: RouterInput = { safety_state: 'S2', governance_state: 'Blocked', session_count: 5, turn_count: 10 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'blocked' });
    });

    it('still routes to crisis when governance is Blocked but safety is S4 (crisis takes precedence)', () => {
      const input: RouterInput = { safety_state: 'S4', governance_state: 'Blocked', session_count: 5, turn_count: 10 };
      expect(routeTurn(input)).toEqual({ agent: 'crisis' });
    });

    it('Blocked takes precedence over the first-turn alliance-building special case', () => {
      const input: RouterInput = { safety_state: 'S0', governance_state: 'Blocked', session_count: 1, turn_count: 1 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'blocked' });
    });

    it('Blocked takes precedence over S3 grounding-only', () => {
      const input: RouterInput = { safety_state: 'S3', governance_state: 'Blocked', session_count: 5, turn_count: 10 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'blocked' });
    });

    it('routes grounding-only when governance is Restricted (safety S0)', () => {
      const input: RouterInput = { safety_state: 'S0', governance_state: 'Restricted', session_count: 5, turn_count: 10 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'grounding-only' });
    });

    it('routes grounding-only when governance is Restricted (safety S2)', () => {
      const input: RouterInput = { safety_state: 'S2', governance_state: 'Restricted', session_count: 5, turn_count: 10 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'grounding-only' });
    });

    it('alliance-building takes precedence over Restricted governance', () => {
      const input: RouterInput = { safety_state: 'S0', governance_state: 'Restricted', session_count: 1, turn_count: 1 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'alliance-building' });
    });

    it('S3 grounding-only takes precedence over Restricted governance', () => {
      const input: RouterInput = { safety_state: 'S3', governance_state: 'Restricted', session_count: 5, turn_count: 10 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'grounding-only' });
    });

    it('normal behavior when governance is Active', () => {
      const input: RouterInput = { safety_state: 'S0', governance_state: 'Active', session_count: 5, turn_count: 10 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'normal' });
    });

    it('normal behavior when governance is undefined', () => {
      const input: RouterInput = { safety_state: 'S0', session_count: 5, turn_count: 10 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'normal' });
    });
  });

  describe('Determinism', () => {
    it('returns identical output for identical input across 100 calls', () => {
      const input: RouterInput = { safety_state: 'S0', session_count: 5, turn_count: 10 };
      const expected = { agent: 'A2', mode: 'normal' as const };

      for (let i = 0; i < 100; i++) {
        expect(routeTurn(input)).toEqual(expected);
      }
    });
  });

  describe('A8 Router — 4 Gates (exactly one test per gate)', () => {
    it('Gate 1 — Crisis: S4 routes to crisis agent', () => {
      const input: RouterInput = { safety_state: 'S4', session_count: 5, turn_count: 10 };
      expect(routeTurn(input)).toEqual({ agent: 'crisis' });
    });

    it('Gate 2 — Grounding: S3 routes to A2 grounding-only', () => {
      const input: RouterInput = { safety_state: 'S3', session_count: 5, turn_count: 10 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'grounding-only' });
    });

    it('Gate 3 — Alliance-building: first session + first turn routes to A2 alliance-building', () => {
      const input: RouterInput = { safety_state: 'S0', session_count: 1, turn_count: 1 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'alliance-building' });
    });

    it('Gate 4 — Restricted governance: Restricted routes to A2 grounding-only', () => {
      const input: RouterInput = { safety_state: 'S0', governance_state: 'Restricted', session_count: 5, turn_count: 10 };
      expect(routeTurn(input)).toEqual({ agent: 'A2', mode: 'grounding-only' });
    });
  });
});
