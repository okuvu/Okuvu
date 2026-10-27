import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { aggregateLearning } from '../agents/a11/agent.js';
import type { SessionSignal } from '../agents/a11/types.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

// A11 must never reach a model. The mock exists so a future refactor that
// quietly imports the LLM path fails here instead of in production.
vi.mock('../lib/generate-content.js', () => ({
  generateContent: mockGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 250,
  DEFAULT_TIMEOUT_MS: 10_000,
}));

function signal(overrides: Partial<SessionSignal> = {}): SessionSignal {
  return {
    sessionId: 'sess_1',
    clientId: 'client_1',
    specialistId: 'spec_a',
    weekIndex: 1,
    outcomeDelta: 2,
    adheredToPlan: true,
    ...overrides,
  };
}

function series(specialistId: string, deltas: number[], adhered: boolean[]): SessionSignal[] {
  return deltas.map((outcomeDelta, index) =>
    signal({
      sessionId: `${specialistId}_sess_${index + 1}`,
      clientId: `client_${specialistId}_${index + 1}`,
      specialistId,
      weekIndex: index,
      outcomeDelta,
      adheredToPlan: adhered[index] ?? false,
    }),
  );
}

describe('A11 Learning Optimiser — aggregateLearning', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('empty input', () => {
    it('returns no aggregates and zero sessions', () => {
      const out = aggregateLearning([]);

      expect(out.aggregates).toEqual([]);
      expect(out.totalSessions).toBe(0);
      expect(out.minSample).toBe(5);
      expect(out.notes).toEqual([]);
    });
  });

  describe('suppression below minSample', () => {
    it('suppresses a specialist with 2 sessions under the default minimum', () => {
      const out = aggregateLearning(series('spec_a', [3, 5], [true, true]));

      expect(out.aggregates).toHaveLength(1);
      expect(out.aggregates[0]).toEqual({
        specialistId: 'spec_a',
        n: 2,
        meanDelta: null,
        adherenceRate: null,
        suppressed: true,
      });
    });

    it('publishes at exactly minSample (5)', () => {
      const out = aggregateLearning(series('spec_a', [2, 4, 6, 8, 10], [true, true, false, true, false]));

      expect(out.aggregates[0].suppressed).toBe(false);
      expect(out.aggregates[0].meanDelta).toBe(6);
      expect(out.aggregates[0].adherenceRate).toBe(0.6);
    });

    it('suppresses at minSample - 1', () => {
      const out = aggregateLearning(series('spec_a', [2, 4, 6, 8], [true, true, true, true]));

      expect(out.aggregates[0].suppressed).toBe(true);
      expect(out.aggregates[0].n).toBe(4);
    });

    it('honours a custom minSample', () => {
      const out = aggregateLearning(series('spec_a', [1, 3], [true, false]), { minSample: 2 });

      expect(out.minSample).toBe(2);
      expect(out.aggregates[0].suppressed).toBe(false);
      expect(out.aggregates[0].meanDelta).toBe(2);
      expect(out.aggregates[0].adherenceRate).toBe(0.5);
    });

    it('never publishes a number off 2 sessions, even with a huge delta', () => {
      const out = aggregateLearning(series('spec_a', [40, 40], [true, true]));

      expect(out.aggregates[0].meanDelta).toBeNull();
      expect(out.aggregates[0].adherenceRate).toBeNull();
    });

    it('records the suppression in notes without naming a client', () => {
      const out = aggregateLearning(series('spec_a', [3, 5], [true, true]));

      expect(out.notes).toContain('suppressed_below_min_sample:spec_a:2<5');
      expect(out.notes.join(' ')).not.toContain('client_');
    });
  });

  describe('hand-computed arithmetic', () => {
    // deltas: 2, 4, 6, 8, 10 -> sum 30 / 5 = 6
    // adhered: true, true, false, true, false -> 3 / 5 = 0.6
    it('computes meanDelta and adherenceRate on a known fixture', () => {
      const signals = [
        signal({ sessionId: 'a1', outcomeDelta: 2, adheredToPlan: true }),
        signal({ sessionId: 'a2', outcomeDelta: 4, adheredToPlan: true }),
        signal({ sessionId: 'a3', outcomeDelta: 6, adheredToPlan: false }),
        signal({ sessionId: 'a4', outcomeDelta: 8, adheredToPlan: true }),
        signal({ sessionId: 'a5', outcomeDelta: 10, adheredToPlan: false }),
      ];

      const out = aggregateLearning(signals, { minSample: 5 });

      expect(out.aggregates[0]).toEqual({
        specialistId: 'spec_a',
        n: 5,
        meanDelta: 6,
        adherenceRate: 0.6,
        suppressed: false,
      });
    });

    it('handles negative deltas', () => {
      const out = aggregateLearning(
        [
          signal({ sessionId: 'a1', outcomeDelta: -1, adheredToPlan: false }),
          signal({ sessionId: 'a2', outcomeDelta: -3, adheredToPlan: false }),
        ],
        { minSample: 2 },
      );

      expect(out.aggregates[0].meanDelta).toBe(-2);
      expect(out.aggregates[0].adherenceRate).toBe(0);
    });

    it('rounds means so binary float noise cannot reach the UI', () => {
      const out = aggregateLearning(
        [
          signal({ sessionId: 'a1', outcomeDelta: 0.1 }),
          signal({ sessionId: 'a2', outcomeDelta: 0.2 }),
        ],
        { minSample: 2 },
      );

      expect(out.aggregates[0].meanDelta).toBe(0.15);
    });

    it('keeps specialists separate', () => {
      const out = aggregateLearning([
        ...series('spec_a', [2, 4, 6, 8, 10], [true, true, true, true, true]),
        ...series('spec_b', [0, 0, 0, 0, 0], [false, false, false, false, false]),
      ]);

      expect(out.aggregates).toHaveLength(2);
      expect(out.aggregates[0].meanDelta).toBe(6);
      expect(out.aggregates[0].adherenceRate).toBe(1);
      expect(out.aggregates[1].meanDelta).toBe(0);
      expect(out.aggregates[1].adherenceRate).toBe(0);
    });
  });

  describe('non-finite outcome deltas', () => {
    it('excludes NaN, recomputes the mean, and adds a note', () => {
      const signals = [
        signal({ sessionId: 'a1', outcomeDelta: 2 }),
        signal({ sessionId: 'a2', outcomeDelta: 4 }),
        signal({ sessionId: 'a3', outcomeDelta: 6 }),
        signal({ sessionId: 'a4', outcomeDelta: 8 }),
        signal({ sessionId: 'a5', outcomeDelta: 10 }),
        signal({ sessionId: 'a6', outcomeDelta: Number.NaN }),
      ];

      const out = aggregateLearning(signals);

      expect(out.aggregates[0].n).toBe(5);
      expect(out.aggregates[0].meanDelta).toBe(6);
      expect(out.notes.some((note) => note.includes('non_finite'))).toBe(true);
    });

    it('excludes Infinity as well as NaN', () => {
      const out = aggregateLearning([
        ...series('spec_a', [2, 2, 2, 2, 2], [true, true, true, true, true]),
        signal({ sessionId: 'inf', outcomeDelta: Number.POSITIVE_INFINITY }),
      ]);

      expect(out.aggregates[0].n).toBe(5);
      expect(out.aggregates[0].meanDelta).toBe(2);
      expect(out.notes).toContain('excluded_non_finite_delta:1');
    });

    it('can drop a specialist below minSample, which then suppresses', () => {
      const out = aggregateLearning([
        ...series('spec_a', [2, 4, 6, 8, 10], [true, true, true, true, true]),
        signal({ sessionId: 'nan', outcomeDelta: Number.NaN }),
      ]);

      expect(out.aggregates[0].n).toBe(5);
      expect(out.aggregates[0].suppressed).toBe(false);

      const pushed = aggregateLearning([
        ...series('spec_b', [2, 4, 6, 8], [true, true, true, true]),
        signal({ sessionId: 'spec_b_nan', specialistId: 'spec_b', outcomeDelta: Number.NaN }),
      ]);

      expect(pushed.aggregates[0].n).toBe(4);
      expect(pushed.aggregates[0].suppressed).toBe(true);
      expect(pushed.aggregates[0].meanDelta).toBeNull();
    });
  });

  describe('deterministic ordering', () => {
    it('sorts aggregates by specialistId regardless of input order', () => {
      const out = aggregateLearning([
        ...series('spec_c', [1, 1, 1, 1, 1], [true, true, true, true, true]),
        ...series('spec_a', [1, 1, 1, 1, 1], [true, true, true, true, true]),
        ...series('spec_b', [1, 1, 1, 1, 1], [true, true, true, true, true]),
      ]);

      expect(out.aggregates.map((a) => a.specialistId)).toEqual(['spec_a', 'spec_b', 'spec_c']);
    });

    it('is stable across repeated calls with shuffled input', () => {
      const one = series('spec_a', [1, 2, 3, 4, 5], [true, false, true, false, true]);
      const two = series('spec_b', [5, 4, 3, 2, 1], [false, true, false, true, false]);

      const forward = aggregateLearning([...one, ...two]);
      const reverse = aggregateLearning([...two, ...one].reverse());

      expect(reverse).toEqual(forward);
    });
  });

  describe('output hygiene', () => {
    it('has no recommendation, prescription or advice field', () => {
      const out = aggregateLearning(series('spec_a', [2, 4, 6, 8, 10], [true, true, true, true, true]));

      for (const aggregate of out.aggregates) {
        const keys = Object.keys(aggregate);
        expect(keys).not.toContain('recommendation');
        expect(keys).not.toContain('prescription');
        expect(keys).not.toContain('advice');
        expect(keys.sort()).toEqual(
          ['adherenceRate', 'meanDelta', 'n', 'specialistId', 'suppressed'].sort(),
        );
      }

      expect(Object.keys(out).sort()).toEqual(
        ['aggregates', 'minSample', 'notes', 'totalSessions'].sort(),
      );
    });

    it('contains no per-client identifier anywhere in the payload', () => {
      const out = aggregateLearning([
        ...series('spec_a', [2, 4, 6, 8, 10], [true, true, true, true, true]),
        ...series('spec_b', [1, 1], [true, false]),
      ]);

      const serialised = JSON.stringify(out);
      expect(serialised).not.toContain('client_');
      expect(serialised).not.toContain('sess_');
      expect(serialised).not.toContain('sessionId');
      expect(serialised).not.toContain('weekIndex');
    });

    it('counts every supplied signal as a total, including excluded ones', () => {
      const out = aggregateLearning([
        ...series('spec_a', [2, 4, 6, 8, 10], [true, true, true, true, true]),
        signal({ sessionId: 'nan', outcomeDelta: Number.NaN }),
      ]);

      expect(out.totalSessions).toBe(6);
      expect(out.aggregates[0].n).toBe(5);
    });

    it('produces empty notes when nothing was suppressed or excluded', () => {
      const out = aggregateLearning(series('spec_a', [2, 4, 6, 8, 10], [true, true, true, true, true]));

      expect(out.notes).toEqual([]);
    });
  });

  describe('determinism — no model in the path', () => {
    it('never calls the LLM path', () => {
      aggregateLearning(series('spec_a', [2, 4, 6, 8, 10], [true, true, true, true, true]));

      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('does not import the generation or JSON-call modules at all', () => {
      const source = readFileSync(new URL('../agents/a11/agent.ts', import.meta.url), 'utf8');

      expect(source).not.toContain('generate-content');
      expect(source).not.toContain('callJson');
      expect(source).not.toContain('generateContent');
    });
  });
});
