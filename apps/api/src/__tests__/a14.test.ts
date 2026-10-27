import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BAND_THRESHOLDS,
  INSTRUMENT_MAX_SCORE,
  bandForTotal,
  directionForChange,
  scoreAssessment,
} from '../agents/a14/scoring.js';
import { A14_AGENT_ID, assessSubmission, isSupportedInstrument } from '../agents/a14/agent.js';
import type { AssessmentItem, AssessmentSubmission } from '../agents/a14/types.js';

const SUBMITTED_AT = '2026-03-04T09:00:00.000Z';

function makeItems(scores: number[]): AssessmentItem[] {
  return scores.map((score, index) => ({ id: `q${index + 1}`, score: score as 0 | 1 | 2 | 3 }));
}

/** Greedy split of a total into nine 0–3 item scores, for band tests. */
function scoresForTotal(total: number): Array<0 | 1 | 2 | 3> {
  const scores: Array<0 | 1 | 2 | 3> = [];
  let remaining = total;
  for (let index = 0; index < 9; index += 1) {
    const score = Math.min(3, remaining);
    scores.push(score as 0 | 1 | 2 | 3);
    remaining -= score;
  }
  return scores;
}

function submission(overrides: Partial<AssessmentSubmission> = {}): AssessmentSubmission {
  return {
    clientId: 'client-1',
    instrument: 'okuvu-wellbeing-9',
    submittedAt: SUBMITTED_AT,
    items: makeItems([0, 1, 2, 3, 0, 1, 2, 3, 0]),
    ...overrides,
  };
}

function scored(overrides: Partial<AssessmentSubmission> = {}, total?: number, previousTotal?: number) {
  const input = total === undefined ? submission(overrides) : submission({ items: makeItems(scoresForTotal(total)), ...overrides });
  const result = scoreAssessment(
    input,
    previousTotal === undefined ? undefined : { total: previousTotal, submittedAt: '2026-02-01T09:00:00.000Z' },
  );
  if (!result.ok) throw new Error(`expected a scored result, got: ${result.errors.join('; ')}`);
  return result;
}

describe('A14 Assessment & Measurement — scoreAssessment', () => {
  describe('the happy path', () => {
    it('scores a valid submission and echoes the instrument', () => {
      const result = scored();

      expect(result.ok).toBe(true);
      expect(result.clientId).toBe('client-1');
      expect(result.instrument).toBe('okuvu-wellbeing-9');
      expect(result.total).toBe(12);
      expect(result.maxScore).toBe(27);
      expect(result.band).toBe('moderate');
    });

    it('sums items rather than trusting any caller-supplied total', () => {
      const result = scoreAssessment({
        ...submission(),
        items: makeItems([3, 3, 3, 3, 3, 3, 3, 3, 3]),
        // A caller sneaking a total in must be ignored.
        total: 0,
      } as unknown as AssessmentSubmission);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.total).toBe(INSTRUMENT_MAX_SCORE);
    });

    it('keeps maxScore equal to nine items at three points', () => {
      expect(INSTRUMENT_MAX_SCORE).toBe(9 * 3);
    });

    it('stamps scoredAt with an ISO timestamp', () => {
      const result = scored();
      expect(Number.isNaN(Date.parse(result.scoredAt))).toBe(false);
      expect(result.scoredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('band boundaries', () => {
    const cases: Array<[number, string]> = [
      [0, 'minimal'],
      [4, 'minimal'],
      [5, 'mild'],
      [9, 'mild'],
      [10, 'moderate'],
      [14, 'moderate'],
      [15, 'high'],
      [27, 'high'],
    ];

    it.each(cases)('total %i falls in %s', (total, band) => {
      expect(scored({}, total).band).toBe(band);
    });

    it('documents the thresholds it tests', () => {
      expect(BAND_THRESHOLDS).toEqual({ minimalMax: 4, mildMax: 9, moderateMax: 14 });
      expect(bandForTotal(4)).toBe('minimal');
      expect(bandForTotal(5)).toBe('mild');
      expect(bandForTotal(14)).toBe('moderate');
      expect(bandForTotal(15)).toBe('high');
    });
  });

  describe('change and direction', () => {
    it('reports first_measure with a null change when there is no previous score', () => {
      const result = scored({}, 12);
      expect(result.change).toBeNull();
      expect(result.changeDirection).toBe('first_measure');
    });

    it('treats an explicit null previous as a first measurement', () => {
      const result = scoreAssessment(submission(), null);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.change).toBeNull();
        expect(result.changeDirection).toBe('first_measure');
      }
    });

    it('computes change as total minus previous total', () => {
      const result = scored({}, 12, 7);
      expect(result.change).toBe(5);
      expect(result.changeDirection).toBe('worsening');
    });

    it('calls a fall of more than two points improving', () => {
      const result = scored({}, 9, 14);
      expect(result.change).toBe(-5);
      expect(result.changeDirection).toBe('improving');
    });

    it('calls a rise of more than two points worsening', () => {
      const result = scored({}, 14, 9);
      expect(result.change).toBe(5);
      expect(result.changeDirection).toBe('worsening');
    });

    it('treats ±2 as stable', () => {
      expect(scored({}, 12, 10).changeDirection).toBe('stable');
      expect(scored({}, 10, 12).changeDirection).toBe('stable');
    });

    it('treats no movement as stable', () => {
      const result = scored({}, 12, 12);
      expect(result.change).toBe(0);
      expect(result.changeDirection).toBe('stable');
    });

    it('reads direction from the change, not the band', () => {
      // 19 → 16 stays "high" (both above the moderate ceiling) yet is real
      // improvement; 18 → 16 is inside the noise band and must read stable.
      const result = scored({}, 16, 19);
      expect(result.band).toBe('high');
      expect(result.change).toBe(-3);
      expect(result.changeDirection).toBe('improving');
      expect(scored({}, 16, 18).changeDirection).toBe('stable');
      expect(directionForChange(-2)).toBe('stable');
      expect(directionForChange(-3)).toBe('improving');
      expect(directionForChange(3)).toBe('worsening');
      expect(directionForChange(null)).toBe('first_measure');
    });
  });

  describe('invalid input returns every error and never scores', () => {
    it('rejects a submission with eight items', () => {
      const result = scoreAssessment(submission({ items: makeItems([1, 1, 1, 1, 1, 1, 1, 1]) }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual(['items: expected exactly 9, received 8']);
      }
    });

    it('rejects a submission with ten items', () => {
      const result = scoreAssessment(submission({ items: makeItems(new Array(10).fill(1)) }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('expected exactly 9, received 10');
    });

    it('rejects duplicate item ids', () => {
      const items = makeItems([1, 1, 1, 1, 1, 1, 1, 1, 1]);
      items[4] = { id: 'q1', score: 2 };
      const result = scoreAssessment(submission({ items }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('duplicate id "q1"');
        expect(result.errors[0]).toContain('items[4]');
      }
    });

    const badScores: Array<[unknown, string]> = [
      [4, '4'],
      [-1, '-1'],
      [1.5, '1.5'],
      ['2', '"2"'],
    ];

    it.each(badScores)('rejects a score of %s', (badScore, rendered) => {
      const items = makeItems([1, 1, 1, 1, 1, 1, 1, 1, 1]);
      items[2] = { id: 'q3', score: badScore as 0 | 1 | 2 | 3 };
      const result = scoreAssessment(submission({ items }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('items[2].score: must be an integer 0-3');
        expect(result.errors[0]).toContain(rendered);
      }
    });

    it('rejects a missing score', () => {
      const items = makeItems([1, 1, 1, 1, 1, 1, 1, 1, 1]);
      items[0] = { id: 'q1' } as unknown as AssessmentItem;
      const result = scoreAssessment(submission({ items }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('received undefined');
    });

    it('rejects an unknown instrument', () => {
      const result = scoreAssessment(submission({ instrument: 'phq-9' as 'okuvu-wellbeing-9' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('instrument: must be "okuvu-wellbeing-9"');
      }
    });

    it('rejects an empty or non-string clientId', () => {
      const empty = scoreAssessment(submission({ clientId: '   ' }));
      expect(empty.ok).toBe(false);
      if (!empty.ok) expect(empty.errors[0]).toContain('clientId: must be a non-empty string');

      const missing = scoreAssessment(submission({ clientId: undefined as unknown as string }));
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.errors[0]).toContain('received undefined');
    });

    it.each([
      '2026-03-04',
      'not a date',
      '2026-03-04T09:00:00',
      '',
    ])('rejects submittedAt %s', (badTimestamp) => {
      const result = scoreAssessment(submission({ submittedAt: badTimestamp }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('submittedAt: must be an ISO-8601 timestamp');
    });

    it('rejects a non-array items field', () => {
      const result = scoreAssessment(submission({ items: 'nine things' as unknown as AssessmentItem[] }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('items: must be an array');
    });

    it('rejects a non-object item', () => {
      const items = makeItems([1, 1, 1, 1, 1, 1, 1, 1, 1]) as unknown[];
      items[7] = null;
      const result = scoreAssessment(submission({ items: items as AssessmentItem[] }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('items[7]: must be an object');
    });

    it('lists every problem in one response, not one per round-trip', () => {
      const items = makeItems([1, 1, 1, 1, 1, 1, 1, 1]);
      items[0] = { id: 'q1', score: 4 as unknown as 1 };
      items[1] = { id: 'q1', score: 2 };

      const result = scoreAssessment({
        clientId: '',
        instrument: 'phq-9',
        submittedAt: '2026-03-04',
        items,
      } as unknown as AssessmentSubmission);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.errors).toHaveLength(6);
      expect(result.errors.some((error) => error.startsWith('clientId:'))).toBe(true);
      expect(result.errors.some((error) => error.startsWith('instrument:'))).toBe(true);
      expect(result.errors.some((error) => error.startsWith('submittedAt:'))).toBe(true);
      expect(result.errors.some((error) => error.startsWith('items: expected exactly 9'))).toBe(true);
      expect(result.errors.some((error) => error.startsWith('items[0].score:'))).toBe(true);
      expect(result.errors.some((error) => error.startsWith('items[1].id: duplicate'))).toBe(true);
    });

    it('rejects a corrupted previous score rather than inventing a change', () => {
      const badTotal = scoreAssessment(submission(), { total: 28, submittedAt: SUBMITTED_AT });
      expect(badTotal.ok).toBe(false);
      if (!badTotal.ok) {
        expect(badTotal.errors).toHaveLength(1);
        expect(badTotal.errors[0]).toContain('previous.total: must be an integer 0-27');
      }

      const nonInteger = scoreAssessment(submission(), { total: 12.5, submittedAt: SUBMITTED_AT });
      expect(nonInteger.ok).toBe(false);

      const badTimestamp = scoreAssessment(submission(), { total: 12, submittedAt: 'yesterday' });
      expect(badTimestamp.ok).toBe(false);
      if (!badTimestamp.ok) expect(badTimestamp.errors[0]).toContain('previous.submittedAt:');

      const notAnObject = scoreAssessment(
        submission(),
        'twelve' as unknown as { total: number; submittedAt: string },
      );
      expect(notAnObject.ok).toBe(false);
      if (!notAnObject.ok) expect(notAnObject.errors[0]).toContain('previous: must be an object');
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'nine'],
      ['a number', 9],
      ['an array', [1, 2, 3]],
      ['an empty object', {}],
      ['items of nulls', { clientId: 'c', instrument: 'okuvu-wellbeing-9', submittedAt: SUBMITTED_AT, items: [null, null] }],
    ])('never throws on %s', (_label, garbage) => {
      const call = () => scoreAssessment(garbage as unknown as AssessmentSubmission);
      expect(call).not.toThrow();

      const result = call();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.every((error) => typeof error === 'string' && error.length > 0)).toBe(true);
      }
    });

    it('echoes clientId when known and empties it when the submission is unusable', () => {
      const known = scoreAssessment(submission({ items: makeItems([1, 1]) }));
      expect(known.ok).toBe(false);
      if (!known.ok) expect(known.clientId).toBe('client-1');

      const unknown = scoreAssessment(null as unknown as AssessmentSubmission);
      expect(unknown.ok).toBe(false);
      if (!unknown.ok) expect(unknown.clientId).toBe('');
    });
  });

  describe('diagnosis is structurally forbidden', () => {
    it('returns bandIsDiagnostic: false and interpretedAsDiagnosis: false', () => {
      const result = scored();

      // Compile-time assertion: both fields are the literal `false`, so this
      // assignment fails to typecheck if anyone widens them to boolean.
      const bandFlag: false = result.bandIsDiagnostic;
      const diagnosisFlag: false = result.interpretedAsDiagnosis;

      expect(bandFlag).toBe(false);
      expect(diagnosisFlag).toBe(false);
    });

    it('carries the disclaimer on every band, including high', () => {
      for (const total of [0, 4, 5, 9, 10, 14, 15, 27]) {
        const result = scored({}, total);
        expect(result.bandIsDiagnostic).toBe(false);
        expect(result.interpretedAsDiagnosis).toBe(false);
      }
    });
  });

  describe('agent wrapper', () => {
    it('wraps a scored result without prose', () => {
      const out = assessSubmission({ submission: submission() });

      expect(out.agentId).toBe(A14_AGENT_ID);
      expect(out.fallbackUsed).toBe(false);
      expect(out.failureReason).toBeNull();
      expect(out.errors).toEqual([]);
      expect(out.payload?.total).toBe(12);
      expect(Object.keys(out).sort()).toEqual(
        ['agentId', 'errors', 'failureReason', 'fallbackUsed', 'payload'].sort(),
      );
    });

    it('returns a null payload and every error on an invalid submission', () => {
      const out = assessSubmission({ submission: submission({ items: makeItems([1, 1]) }) });

      expect(out.payload).toBeNull();
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('invalid_submission');
      expect(out.errors.length).toBeGreaterThan(0);
    });

    it('passes the previous score through', () => {
      const out = assessSubmission({
        submission: submission(),
        previous: { total: 20, submittedAt: '2026-02-01T09:00:00.000Z' },
      });

      expect(out.payload?.change).toBe(-8);
      expect(out.payload?.changeDirection).toBe('improving');
    });

    it('never throws, even on undefined input', () => {
      expect(() => assessSubmission(undefined as unknown as { submission: AssessmentSubmission })).not.toThrow();
      const out = assessSubmission(undefined as unknown as { submission: AssessmentSubmission });
      expect(out.payload).toBeNull();
      expect(out.agentId).toBe('A14');
    });

    it('knows only the okuvu-wellbeing-9 instrument', () => {
      expect(isSupportedInstrument('okuvu-wellbeing-9')).toBe(true);
      expect(isSupportedInstrument('phq-9')).toBe(false);
      expect(isSupportedInstrument('gad-7')).toBe(false);
    });
  });

  it('never imports an LLM client', () => {
    for (const file of ['../agents/a14/agent.ts', '../agents/a14/scoring.ts', '../agents/a14/types.ts']) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(source).not.toContain('generate-content');
      expect(source).not.toContain('generateContent');
    }
  });
});
