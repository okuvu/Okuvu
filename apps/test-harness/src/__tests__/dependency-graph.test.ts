import { describe, it, expect } from 'vitest';
import { computeActivation, tryDisable, mockModeFor } from '../lib/dependency-graph';

describe('computeActivation', () => {
  it('toggling A2 on from empty auto-activates A1, A9-pre, A8', () => {
    const result = computeActivation('A2', []);

    expect(new Set(result.active)).toEqual(new Set(['A1', 'A9-pre', 'A8', 'A2']));

    expect(new Set(result.autoActivated.keys())).toEqual(new Set(['A1', 'A9-pre', 'A8']));

    expect(result.explanation).toContain('A1');
    expect(result.explanation).toContain('A9-pre');
    expect(result.explanation).toContain('A8');
  });

  it('a transitive case: toggling A15 on from empty auto-activates its full chain', () => {
    const result = computeActivation('A15', []);

    expect(new Set(result.active)).toEqual(
      new Set(['A1', 'A9-pre', 'A8', 'A2', 'A13', 'A15']),
    );
    expect(result.active).toHaveLength(6);
  });
});

describe('tryDisable', () => {
  it('with A2 active, disabling A1 is blocked because A9-pre and A8 depend on it', () => {
    const result = tryDisable('A1', ['A1', 'A9-pre', 'A8', 'A2']);

    expect(result.allowed).toBe(false);
    expect(result.explanation).toContain('A2');
    expect(result.explanation).toContain('A8');
  });

  it('with only A15 and its dependencies active, disabling A15 is allowed', () => {
    const active = computeActivation('A15', []).active;
    const result = tryDisable('A15', active);

    expect(result.allowed).toBe(true);
  });
});

describe('mockModeFor', () => {
  it('A2 requires exactly the 4 upstream mock fields', () => {
    const result = mockModeFor('A2');
    expect(new Set(result.requiredInputs)).toEqual(
      new Set(['safetyState', 'governanceState', 'routerDecision', 'retrievedContext']),
    );
    expect(result.requiredInputs).toHaveLength(4);
  });

  it('A1 has no upstream dependencies and requires no mock inputs', () => {
    expect(mockModeFor('A1').requiredInputs).toEqual([]);
  });
});
