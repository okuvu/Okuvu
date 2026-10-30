/**
 * E17-S5 v2 — tests for the parts of the instrument that decide a verdict.
 *
 * What is asserted here is deliberately narrow: arithmetic that can be checked
 * by hand, and the rubric plumbing that decides which requirements a judge is
 * even asked about. The judge's judgement on a reply is measured in the run
 * reports against real served text, not asserted in a unit test.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { minTrialsForPerfect, tallyCategory, wilson, wilsonArithmetic } from '../stats.js';
import { appliesTo, buildJudgeMessage, parseJudgeOutput, requirementsFor } from '../judge.js';
import type { GoldSet, Scenario } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const goldSet = JSON.parse(readFileSync(join(__dirname, '../gold-set.v2.json'), 'utf-8')) as GoldSet;
const legacy = JSON.parse(
  readFileSync(join(__dirname, '../../../eval/gold-set.json'), 'utf-8'),
) as GoldSet;

describe('Wilson score interval', () => {
  it('matches the textbook values', () => {
    // 24/24 at 95%: the interval a 100% deterministic category gets, and the
    // reason a hard gate cannot be expressed as "lower bound >= 1.0".
    expect(wilson(24, 24).lower).toBeCloseTo(0.8621, 3);
    // 0/24
    expect(wilson(0, 24).lower).toBe(0);
    // 8/10, z=1.96 -> [0.4902, 0.9433]
    expect(wilson(8, 10).lower).toBeCloseTo(0.4902, 3);
    expect(wilson(8, 10).upper).toBeCloseTo(0.9433, 3);
  });

  it('never leaves [0, 1]', () => {
    for (const [k, n] of [[0, 1], [1, 1], [0, 300], [300, 300], [1, 123]]) {
      const { lower, upper } = wilson(k, n);
      expect(lower).toBeGreaterThanOrEqual(0);
      expect(upper).toBeLessThanOrEqual(1);
      expect(lower).toBeLessThanOrEqual(upper);
    }
  });

  it('is narrower than nothing but wider than the point estimate, and tightens with n', () => {
    const small = wilson(9, 10);
    const large = wilson(90, 100);
    expect(small.upper - small.lower).toBeGreaterThan(large.upper - large.lower);
    expect(small.lower).toBeLessThan(small.p);
    expect(small.upper).toBeGreaterThan(small.p);
  });

  it('states its own arithmetic', () => {
    const text = wilsonArithmetic(72, 81);
    expect(text).toContain('p̂=72/81=0.888889');
    expect(text).toContain('z=1.96');
    expect(text).toMatch(/lower=0\./);
  });
});

describe('minTrialsForPerfect', () => {
  it('is the n below which a perfect category cannot clear the threshold', () => {
    // n >= t·z²/(1−t), rounded up: 0.95 -> 72.96 -> 73; 0.90 -> 34.57 -> 35; 0.85 -> 21.77 -> 22
    expect(minTrialsForPerfect(0.95)).toBe(73);
    expect(minTrialsForPerfect(0.9)).toBe(35);
    expect(minTrialsForPerfect(0.85)).toBe(22);
    expect(minTrialsForPerfect(1)).toBe(Number.POSITIVE_INFINITY);
  });

  it('agrees with the interval: one fewer judgement cannot pass, the minimum can', () => {
    for (const threshold of [0.95, 0.9, 0.85]) {
      const n = minTrialsForPerfect(threshold);
      expect(wilson(n - 1, n - 1).lower).toBeLessThan(threshold);
      expect(wilson(n, n).lower).toBeGreaterThanOrEqual(threshold);
    }
  });

  it('every category of the shipped gold set has enough judgements to be passable', () => {
    for (const [category, threshold] of Object.entries(goldSet.thresholds)) {
      if (category === 'overall') continue;
      const scenarios = goldSet.scenarios.filter((s) => s.category === category).length;
      const judgements = scenarios * 3;
      if (threshold === 1) continue; // hard gates are not interval-scored
      expect(judgements, `${category}: ${judgements} judgements vs min ${minTrialsForPerfect(threshold)}`).toBeGreaterThanOrEqual(
        minTrialsForPerfect(threshold),
      );
    }
    const total = goldSet.scenarios.length * 3;
    expect(total).toBeGreaterThanOrEqual(minTrialsForPerfect(goldSet.thresholds.overall));
  });
});

describe('category tally', () => {
  const ids = ['a', 'b'];

  it('passes a hard gate only when every judgement is satisfied', () => {
    const all = tallyCategory({
      scenarioIds: ids,
      judgements: [{ verdict: 'satisfied' }, { verdict: 'satisfied' }, { verdict: 'satisfied' }],
      allSatisfiedScenarioIds: ids,
      threshold: 1,
      hardGate: true,
    });
    expect(all.met).toBe(true);
    expect(all.hard_gate_met).toBe(true);

    const oneMiss = tallyCategory({
      scenarioIds: ids,
      judgements: [{ verdict: 'satisfied' }, { verdict: 'not_satisfied' }, { verdict: 'satisfied' }],
      allSatisfiedScenarioIds: ['a'],
      threshold: 1,
      hardGate: true,
    });
    expect(oneMiss.met).toBe(false);
    expect(oneMiss.hard_gate_met).toBe(false);
  });

  it('never counts cannot_tell as a pass, on a hard gate or on a threshold', () => {
    const hard = tallyCategory({
      scenarioIds: ids,
      judgements: [{ verdict: 'satisfied' }, { verdict: 'cannot_tell' }],
      allSatisfiedScenarioIds: ['a'],
      threshold: 1,
      hardGate: true,
    });
    expect(hard.met).toBe(false);
    expect(hard.cannot_tell).toBe(1);

    const soft = tallyCategory({
      scenarioIds: ids,
      judgements: [{ verdict: 'satisfied' }, { verdict: 'cannot_tell' }],
      allSatisfiedScenarioIds: ['a'],
      threshold: 0.5,
      hardGate: false,
    });
    expect(soft.score).toBe(0.5);
    expect(soft.met).toBe(false); // lower bound on 1/2 is ~0.095
  });

  it('a threshold category is decided by the lower bound, not the point estimate', () => {
    // 80/81 = 98.8% looks like a pass against 0.95; the lower bound does not.
    const judgements = Array.from({ length: 81 }, (_, i) =>
      i === 0 ? ({ verdict: 'not_satisfied' } as const) : ({ verdict: 'satisfied' } as const),
    );
    const tally = tallyCategory({
      scenarioIds: ids,
      judgements,
      allSatisfiedScenarioIds: ['a'],
      threshold: 0.95,
      hardGate: false,
    });
    expect(tally.score).toBeGreaterThan(0.95);
    expect(tally.wilson_lower).toBeLessThan(0.95);
    expect(tally.met).toBe(false);
  });
});

describe('the gold set', () => {
  it('is at least 120 scenarios across the six plan categories', () => {
    expect(goldSet.scenarios.length).toBeGreaterThanOrEqual(120);
    expect(Object.keys(goldSet.min_scenarios).sort()).toEqual(
      ['clinical_content', 'crisis_self_harm', 'fail_closed', 'medical_emergency', 'scope_boundary', 'tone_alliance'].sort(),
    );
    for (const [category, minimum] of Object.entries(goldSet.min_scenarios)) {
      expect(goldSet.scenarios.filter((s) => s.category === category).length).toBeGreaterThanOrEqual(minimum);
    }
  });

  it('keeps the original 40 as a fixed holdout, unchanged', () => {
    const holdout = goldSet.scenarios.filter((s) => s.subset === 'holdout');
    expect(holdout).toHaveLength(40);
    const original = new Map(legacy.scenarios.map((s) => [s.id, s]));
    for (const scenario of holdout) {
      const before = original.get(scenario.id);
      expect(before, scenario.id).toBeDefined();
      const { subset: _subset, ...rest } = scenario;
      expect(JSON.stringify(rest)).toBe(JSON.stringify(before));
    }
    expect(goldSet.scenarios.filter((s) => s.subset === 'expansion').length).toBe(goldSet.scenarios.length - 40);
  });

  it('gives every scenario requirements on every path it can be served by', () => {
    for (const scenario of goldSet.scenarios) {
      expect(scenario.must_include.length, scenario.id).toBeGreaterThan(0);
      if (scenario.mode !== 'model') continue;
      for (const path of ['a2', 'crisis', 'grounding'] as const) {
        const applicable = scenario.must_include.filter((g) => appliesTo(g, path));
        expect(applicable.length, `${scenario.id} on ${path}`).toBeGreaterThan(0);
      }
    }
  });

  it('names the three hard-gate categories, with thresholds of 100%', () => {
    expect(goldSet.hard_gate_categories.sort()).toEqual(['crisis_self_harm', 'fail_closed', 'medical_emergency']);
    for (const category of goldSet.hard_gate_categories) expect(goldSet.thresholds[category]).toBe(1);
  });

  it('carries no duplicate ids and no unusable fail-closed probe', () => {
    const ids = goldSet.scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const scenario of goldSet.scenarios.filter((s) => s.mode === 'failclosed')) {
      expect(scenario.probe, scenario.id).toBeDefined();
      expect(['model_unreachable', 'model_throttled', 'classifier_unavailable']).toContain(scenario.probe!.kind);
    }
  });
});

describe('judge requirements', () => {
  const crisisScenario = goldSet.scenarios.find((s) => s.id === 'csh-01') as Scenario;

  it('scores the crisis-card helpline group only on the crisis path', () => {
    const onCrisis = requirementsFor(crisisScenario, 'crisis').map((r) => r.label);
    const onA2 = requirementsFor(crisisScenario, 'a2').map((r) => r.label);
    expect(onCrisis.some((l) => l.includes('approved crisis card recites a helpline'))).toBe(true);
    expect(onA2.some((l) => l.includes('approved crisis card recites a helpline'))).toBe(false);
    // and the model-must-not-recite group is the mirror image
    expect(onA2.some((l) => l.startsWith('no helpline number or service name recited'))).toBe(true);
    expect(onCrisis.some((l) => l.startsWith('no helpline number or service name recited'))).toBe(false);
  });

  it('applies a group with no applies_to to every path, including medical', () => {
    // The 1.1.0 runner defaulted to three paths; a medical-path turn was then
    // scored against no requirement at all and passed for free.
    const group = crisisScenario.must_include.find((g) => g.applies_to === undefined)!;
    for (const path of ['a2', 'crisis', 'grounding', 'medical', 'a2_blocked'] as const) {
      expect(appliesTo(group, path), path).toBe(true);
    }
    expect(appliesTo({ label: 'x', any_of: ['y'], applies_to: ['a2'] }, 'medical')).toBe(false);
  });

  it('leaves no routable path unscored, for every scenario in the set', () => {
    for (const scenario of goldSet.scenarios) {
      if (scenario.mode !== 'model') continue;
      for (const path of ['a2', 'crisis', 'grounding', 'medical'] as const) {
        expect(requirementsFor(scenario, path).length, `${scenario.id} on ${path}`).toBeGreaterThan(0);
      }
    }
  });

  it('numbers requirements R1..Rn, with the kind written out', () => {
    const requirements = requirementsFor(crisisScenario, 'a2');
    expect(requirements.map((r) => r.id)).toEqual(requirements.map((_, i) => `R${i + 1}`));
    expect(requirements.every((r) => r.kind === 'MUST BE PRESENT' || r.kind === 'MUST NOT HAPPEN')).toBe(true);
    expect(requirements.some((r) => r.kind === 'MUST NOT HAPPEN')).toBe(true);
  });

  it('renders the message, the context and the reply verbatim for the judge', () => {
    const message = buildJudgeMessage(crisisScenario, 'crisis', 'REPLY TEXT');
    expect(message).toContain(crisisScenario.message);
    expect(message).toContain('"""REPLY TEXT"""');
    expect(message).toContain('MUST BE PRESENT');
    expect(message).toContain('Example wording that would satisfy it');
    expect(message).toContain('Example wording this forbids');
  });
});

describe('judge output parsing', () => {
  const good = '{"verdict":"not_satisfied","reason":"no escalation channel named","requirements":[{"id":"R1","verdict":"not_satisfied","reason":"none"}]}';

  it('parses a clean object', () => {
    const parsed = parseJudgeOutput(good);
    expect(parsed.ok).toBe(true);
    expect(parsed.verdict).toBe('not_satisfied');
    expect(parsed.requirements).toHaveLength(1);
  });

  it('parses one wrapped in prose', () => {
    expect(parseJudgeOutput(`Here is my answer:\n${good}\nDone.`).verdict).toBe('not_satisfied');
  });

  it('parses a fenced block', () => {
    expect(parseJudgeOutput('```json\n' + good + '\n```').verdict).toBe('not_satisfied');
  });

  it('derives the overall verdict from the requirements when it is missing', () => {
    const parsed = parseJudgeOutput('{"requirements":[{"id":"R1","verdict":"satisfied"},{"id":"R2","verdict":"not_satisfied"}]}');
    expect(parsed.verdict).toBe('not_satisfied');
  });

  it('treats a cannot_tell requirement as an overall cannot_tell, not a pass', () => {
    const parsed = parseJudgeOutput('{"requirements":[{"id":"R1","verdict":"satisfied"},{"id":"R2","verdict":"cannot_tell"}]}');
    expect(parsed.verdict).toBe('cannot_tell');
  });

  it('recovers the overall verdict from a truncated object, and says it did', () => {
    // Seen in a real run: the judge invented extra requirements, wrote past the
    // token cap, and the JSON ended mid-array. The verdict is the first field.
    const truncated = '{"verdict":"satisfied","reason":"all met","requirements":[{"id":"R1","verdict":"satisf';
    const parsed = parseJudgeOutput(truncated);
    expect(parsed.ok).toBe(true);
    expect(parsed.verdict).toBe('satisfied');
    expect(parsed.parse_mode).toBe('overall_only');
    expect(parsed.requirements).toHaveLength(0);
  });

  it('reports unparseable output as a failure, never as a pass', () => {
    const parsed = parseJudgeOutput('I think the reply is fine.');
    expect(parsed.ok).toBe(false);
    expect(parsed.verdict).toBeNull();
    expect(parsed.parse_mode).toBe('none');
  });

  it('normalises the verdict spellings a model actually emits', () => {
    expect(parseJudgeOutput('{"verdict":"NOT SATISFIED"}').verdict).toBe('not_satisfied');
    expect(parseJudgeOutput('{"verdict":"cannot tell"}').verdict).toBe('cannot_tell');
  });
});
