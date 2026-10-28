import { describe, it, expect } from 'vitest';
import {
  ROSTER,
  ROSTER_IDS,
  SPECIALIST_IDS,
  MAX_SPECIALISTS_PER_TURN,
  getAgent,
  validateRoster,
  assertValidRoster,
  specialistSpecs,
  type AgentSpec,
} from '../agents/roster.js';

function clone(): AgentSpec[] {
  return ROSTER.map((a) => ({ ...a, writes: new Set(a.writes) }));
}

function mutate(id: string, patch: Partial<AgentSpec>): AgentSpec[] {
  const roster = clone();
  const target = roster.find((a) => a.id === id)!;
  Object.assign(target, patch);
  return roster;
}

describe('Agent roster — 15 agents as enforced data', () => {
  it('defines exactly A1 through A15, once each', () => {
    expect(ROSTER).toHaveLength(15);
    expect(ROSTER.map((a) => a.id)).toEqual([...ROSTER_IDS]);
    expect(new Set(ROSTER.map((a) => a.id)).size).toBe(15);
  });

  it('the shipped roster is valid', () => {
    expect(validateRoster()).toEqual([]);
    expect(() => assertValidRoster()).not.toThrow();
  });

  it('looks agents up by id and rejects unknown ids', () => {
    expect(getAgent('A12')?.name).toBe('Content Compiler');
    expect(getAgent('A99')).toBeUndefined();
  });

  describe('authority rules', () => {
    it('has exactly one severity writer — A9', () => {
      const writers = ROSTER.filter((a) => a.writes.has('severity')).map((a) => a.id);
      expect(writers).toEqual(['A9']);
    });

    it('A1 signals severity but never writes it', () => {
      const a1 = getAgent('A1')!;
      expect(a1.maySignalSeverity).toBe(true);
      expect(a1.writes.has('severity')).toBe(false);
    });

    it('has exactly one text writer — A12 — and it is the only client-facing agent', () => {
      expect(ROSTER.filter((a) => a.writes.has('text')).map((a) => a.id)).toEqual(['A12']);
      expect(ROSTER.filter((a) => a.clientFacing).map((a) => a.id)).toEqual(['A12']);
    });

    it('has exactly one audio writer — A13 — and it writes nothing else', () => {
      const a13 = getAgent('A13')!;
      expect([...a13.writes]).toEqual(['audio']);
    });

    it('A10 and A11 never talk to the client', () => {
      for (const id of ['A10', 'A11']) {
        const agent = getAgent(id)!;
        expect(agent.clientFacing).toBe(false);
        expect(agent.writes.has('text')).toBe(false);
      }
    });

    it('only A1 and A9 may veto', () => {
      expect(ROSTER.filter((a) => a.canVeto).map((a) => a.id)).toEqual(['A1', 'A9']);
    });

    it('only A8 may select', () => {
      expect(ROSTER.filter((a) => a.canSelect).map((a) => a.id)).toEqual(['A8']);
    });
  });

  describe('specialists', () => {
    it('are A2 through A7, all payload-only, all in the turn loop', () => {
      const specs = specialistSpecs();
      expect(specs.map((a) => a.id)).toEqual([...SPECIALIST_IDS]);
      for (const spec of specs) {
        expect([...spec.writes]).toEqual(['payload']);
        expect(spec.inTurnLoop).toBe(true);
        expect(spec.clientFacing).toBe(false);
        expect(spec.canSelect).toBe(false);
      }
    });

    it('cap at two per turn', () => {
      expect(MAX_SPECIALISTS_PER_TURN).toBe(2);
    });
  });

  describe('validateRoster catches rule breaks', () => {
    it('catches a duplicate id', () => {
      const roster = clone();
      roster.push({ ...roster[2] });
      expect(validateRoster(roster).map((v) => v.code)).toContain('duplicate_id');
    });

    it('catches a missing agent', () => {
      const roster = clone().filter((a) => a.id !== 'A15');
      expect(validateRoster(roster).map((v) => v.code)).toContain('roster_incomplete');
    });

    it('catches a second severity writer', () => {
      const roster = mutate('A2', { writes: new Set(['payload', 'severity'] as const) });
      expect(validateRoster(roster).map((v) => v.code)).toContain('severity_writer_ambiguous');
    });

    it('catches an agent that both signals and writes severity', () => {
      const roster = mutate('A1', { writes: new Set(['severity'] as const) });
      const codes = validateRoster(roster).map((v) => v.code);
      expect(codes).toContain('severity_signal_misplaced');
    });

    it('catches a second text writer', () => {
      const roster = mutate('A2', { writes: new Set(['payload', 'text'] as const) });
      expect(validateRoster(roster).map((v) => v.code)).toContain('text_writer_ambiguous');
    });

    it('catches a client-facing agent that writes no text', () => {
      const roster = mutate('A4', { clientFacing: true });
      expect(validateRoster(roster).map((v) => v.code)).toContain('client_facing_misplaced');
    });

    it('catches a specialist that emits prose', () => {
      const roster = mutate('A5', { writes: new Set(['payload', 'text'] as const) });
      const codes = validateRoster(roster).map((v) => v.code);
      expect(codes).toContain('specialist_shape_invalid');
    });

    it('catches a specialist that could select itself', () => {
      const roster = mutate('A6', { canSelect: true });
      expect(validateRoster(roster).map((v) => v.code)).toContain('specialist_shape_invalid');
    });

    it('catches veto authority outside safety/governance', () => {
      const roster = mutate('A11', { canVeto: true });
      expect(validateRoster(roster).map((v) => v.code)).toContain('veto_authority_misplaced');
    });

    it('reports every violation, not just the first', () => {
      const roster = mutate('A2', { writes: new Set(['payload', 'severity'] as const) });
      roster.push({ ...roster[4] });
      expect(validateRoster(roster).length).toBeGreaterThan(1);
    });
  });
});
