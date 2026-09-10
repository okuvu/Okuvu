import { describe, it, expect } from 'vitest';
import { extractRunSignals, computeScorecard, diffScorecards } from '../lib/scorecard';

describe('extractRunSignals', () => {
  it('extracts from the pipeline.ts/corpus.ts shape ({ result, signals, invariantViolations })', () => {
    const results = {
      result: { type: 'agent_turn', message: 'hi', fallbackUsed: true },
      signals: [{ boundary: 'A1_result', agent: 'A1', payload: 'S3', timestamp: 't' }],
      invariantViolations: [{ rule: 'full-suppression', reason: 'x' }],
    };

    const extracted = extractRunSignals(results);

    expect(extracted.fallbackUsed).toBe(true);
    expect(extracted.invariantViolations).toEqual([{ rule: 'full-suppression', reason: 'x' }]);
    expect(extracted.safetyStates).toEqual(['S3']);
  });

  it('extracts from the conversation.ts/simulator.ts shape ({ turns: [...] })', () => {
    const results = {
      turns: [
        { fallbackUsed: false, invariantViolations: [], safetyState: 'S0' },
        { fallbackUsed: true, invariantViolations: [{ rule: 'signal-ordering' }], safetyState: 'S1' },
      ],
    };

    const extracted = extractRunSignals(results);

    expect(extracted.fallbackUsed).toBe(true);
    expect(extracted.invariantViolations).toEqual([{ rule: 'signal-ordering' }]);
    expect(extracted.safetyStates).toEqual(['S0', 'S1']);
  });

  it('extracts from the faultInjection.ts shape (raw PipelineResult, no wrapper)', () => {
    const results = {
      type: 'agent_turn',
      fallbackUsed: true,
      signals: [{ boundary: 'A1_result', agent: 'A1', payload: 'S2', timestamp: 't' }],
    };

    const extracted = extractRunSignals(results);

    expect(extracted.fallbackUsed).toBe(true);
    expect(extracted.invariantViolations).toEqual([]);
    expect(extracted.safetyStates).toEqual(['S2']);
  });

  it('degrades to empty/zero for an unrecognized shape (e.g. stochastic.ts)', () => {
    const results = { samples: [1, 2, 3], targetMetric: 'x' };

    const extracted = extractRunSignals(results);

    expect(extracted).toEqual({ fallbackUsed: false, invariantViolations: [], safetyStates: [] });
  });

  it('does not throw on null/non-object results', () => {
    expect(extractRunSignals(null)).toEqual({ fallbackUsed: false, invariantViolations: [], safetyStates: [] });
    expect(extractRunSignals('not an object')).toEqual({
      fallbackUsed: false,
      invariantViolations: [],
      safetyStates: [],
    });
  });
});

describe('computeScorecard', () => {
  it('aggregates status counts, canned count, fallback count, and pass rate', () => {
    const runs = [
      { id: 'r1', status: 'pass' as const, canned: true, results: { result: { type: 'agent_turn', fallbackUsed: false } } },
      { id: 'r2', status: 'halt' as const, canned: false, results: { result: { type: 'agent_turn', fallbackUsed: true }, invariantViolations: [] } },
      { id: 'r3', status: 'pass' as const, canned: false, results: { result: { type: 'agent_turn', fallbackUsed: false } } },
    ];

    const scorecard = computeScorecard(runs);

    expect(scorecard.totalRuns).toBe(3);
    expect(scorecard.statusCounts).toEqual({ pass: 2, halt: 1 });
    expect(scorecard.passRate).toBeCloseTo(2 / 3);
    expect(scorecard.cannedCount).toBe(1);
    expect(scorecard.fallbackCount).toBe(1);
  });

  it('returns passRate 0 for an empty run set (not NaN)', () => {
    expect(computeScorecard([]).passRate).toBe(0);
  });

  it('tallies invariant-violation rules and observed safety states across runs', () => {
    const runs = [
      {
        id: 'r1',
        status: 'halt' as const,
        canned: false,
        results: {
          result: { type: 'agent_turn', fallbackUsed: false },
          signals: [{ boundary: 'A1_result', agent: 'A1', payload: 'S4', timestamp: 't' }],
          invariantViolations: [{ rule: 'full-suppression' }],
        },
      },
      {
        id: 'r2',
        status: 'halt' as const,
        canned: false,
        results: {
          result: { type: 'agent_turn', fallbackUsed: false },
          signals: [{ boundary: 'A1_result', agent: 'A1', payload: 'S4', timestamp: 't' }],
          invariantViolations: [{ rule: 'full-suppression' }, { rule: 'signal-ordering' }],
        },
      },
    ];

    const scorecard = computeScorecard(runs);

    expect(scorecard.invariantViolationCounts).toEqual({ 'full-suppression': 2, 'signal-ordering': 1 });
    expect(scorecard.observedSafetyStateCounts).toEqual({ S4: 2 });
  });
});

describe('diffScorecards', () => {
  it('computes passRateDelta and fallbackCountDelta', () => {
    const baseline = computeScorecard([
      { id: 'b1', status: 'pass' as const, canned: false, results: {} },
      { id: 'b2', status: 'halt' as const, canned: false, results: { result: { type: 'agent_turn', fallbackUsed: true } } },
    ]);
    const current = computeScorecard([
      { id: 'c1', status: 'pass' as const, canned: false, results: {} },
      { id: 'c2', status: 'pass' as const, canned: false, results: {} },
    ]);

    const delta = diffScorecards(current, baseline);

    expect(delta.passRateDelta).toBeCloseTo(1 - 0.5);
    expect(delta.fallbackCountDelta).toBe(-1);
  });

  it('flags invariant-violation rules present in current but not in baseline', () => {
    const baseline = computeScorecard([{ id: 'b1', status: 'pass' as const, canned: false, results: {} }]);
    const current = computeScorecard([
      {
        id: 'c1',
        status: 'halt' as const,
        canned: false,
        results: { result: { type: 'agent_turn', fallbackUsed: false }, invariantViolations: [{ rule: 's3-deterministic' }] },
      },
    ]);

    const delta = diffScorecards(current, baseline);

    expect(delta.newInvariantViolationRules).toEqual(['s3-deterministic']);
  });
});
