/**
 * The fail-closed rubric is held to the copy that is actually served.
 *
 * ## The defect this exists to prevent
 *
 * `fc-05` failed three of three repetitions in every v2 gate run, for the life
 * of the gate, and was reported as a product failure. It was not one. The probe
 * serves `A9_POST_S2_FALLBACK` — the clinical lead's signed rev 6 §4.5 text —
 * and the scenario accepted only "right here with you" / "not going anywhere".
 * Those are promise-family phrases that the same sign-off struck from every
 * failure path, on the explicit ground that on a failure path the promise is
 * literally untrue. So the rubric could only be satisfied by copy the product is
 * forbidden to serve, and the judge's "not_satisfied" was correct: the reply did
 * not contain the words the rubric asked for.
 *
 * `fc-09` and `fc-11` are served the byte-identical string and passed, because
 * their phrase lists included the signed wording. Three scenarios, one constant,
 * two verdicts — a contradiction inside the instrument, which is what made the
 * stale rubric findable at all.
 *
 * ## What is asserted
 *
 * A fail-closed probe calls no model: the reply is a governed constant chosen by
 * the probe's kind and declared safety state. That makes the whole judgement
 * checkable offline, and these are the properties that must hold for it to be a
 * measurement rather than a coin toss:
 *
 *   1. every `must_include` group has at least one phrase that appears in the
 *      text the probe serves — otherwise the scenario can only pass if the judge
 *      ignores its own rubric;
 *   2. no `must_not_include` phrase appears in that text — otherwise the
 *      scenario can never pass, whatever the product does;
 *   3. no group accepts a promise-family phrase, because the promise rule struck
 *      them from every failure path and they exist in no constant.
 *
 * The mapping is imported from `fail-closed-probes.ts`, the same function the
 * runner calls, so this test cannot drift away from what is actually served.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runFailClosedProbe } from '../fail-closed-probes.js';
import type { GoldSet, Scenario } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLD_SETS = [
  join(__dirname, '..', 'gold-set.v2.json'),
  join(__dirname, '..', '..', 'gold-set.json'),
];

/** The three phrases the rev 6 promise rule struck, failure paths included. */
const PROMISE_PHRASES = ["i'm not going anywhere", 'i\'ll stay with you', "i'm still here with you", 'right here with you', 'not going anywhere'];

function failClosedScenarios(path: string): Array<{ scenario: Scenario; served: string }> {
  const goldSet = JSON.parse(readFileSync(path, 'utf-8')) as GoldSet;
  return goldSet.scenarios
    .filter((s) => s.mode === 'failclosed')
    .map((scenario) => ({ scenario, served: runFailClosedProbe(scenario, 'unavailable').served }));
}

describe.each(GOLD_SETS)('fail-closed rubric vs the served constant — %s', (goldSetPath) => {
  const rows = failClosedScenarios(goldSetPath);

  it('has fail-closed scenarios to check at all', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(rows.map((r) => [r.scenario.id, r] as const))(
    '%s: every must_include group is satisfiable by the text the probe serves',
    (_id, { scenario, served }) => {
      for (const group of scenario.must_include) {
        const hit = group.any_of.some((phrase) => served.toLowerCase().includes(phrase.toLowerCase()));
        expect(
          hit,
          `${scenario.id} requirement "${group.label}" accepts only wording that is not in the served constant.\n` +
            `accepted: ${group.any_of.join(' | ')}\n` +
            `served: ${served}`,
        ).toBe(true);
      }
      if (scenario.must_escalate) {
        const hit = scenario.must_escalate.any_of.some((phrase) => served.toLowerCase().includes(phrase.toLowerCase()));
        expect(hit, `${scenario.id} must_escalate accepts only wording that is not in the served constant`).toBe(true);
      }
    },
  );

  it.each(rows.map((r) => [r.scenario.id, r] as const))(
    '%s: no must_not_include phrase appears in the text the probe serves',
    (_id, { scenario, served }) => {
      for (const group of scenario.must_not_include) {
        for (const phrase of group.any_of) {
          expect(
            served.toLowerCase().includes(phrase.toLowerCase()),
            `${scenario.id} forbids "${phrase}", which the served constant contains — the scenario can never pass`,
          ).toBe(false);
        }
      }
    },
  );

  it.each(rows.map((r) => [r.scenario.id, r] as const))(
    '%s: accepts no promise-family wording',
    (_id, { scenario }) => {
      const groups = [...scenario.must_include, ...scenario.must_not_include];
      if (scenario.must_escalate) groups.push(scenario.must_escalate);
      for (const group of groups) {
        for (const phrase of group.any_of) {
          expect(
            PROMISE_PHRASES,
            `${scenario.id} requirement "${group.label}" accepts "${phrase}", struck by the promise rule (rev 6 §1.1)`,
          ).not.toContain(phrase.toLowerCase());
        }
      }
    },
  );
});
