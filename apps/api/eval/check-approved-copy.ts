/**
 * E17-S7 — the test gate, re-run on the approved S3 and S4 texts.
 *
 * Her sign-off's second condition: "The test gate (Appendix A, step 2) is
 * re-run on the approved S3 and S4 texts, and the results are returned to the
 * clinical lead before release."
 *
 * Appendix A step 2 is precisely this: the gate's own matching logic applied to
 * the gold set's crisis scenarios at their path, with the text the pipeline
 * serves. There is no model call here — the S3 and S4 paths are deterministic,
 * so this is the whole of what those scenarios measure.
 *
 *   pnpm --filter @okuvu/api exec tsx eval/check-approved-copy.ts \
 *     --out ../../evidence/E17-S7-runs/approved-copy-gate.json
 *
 * Exit 0 only if every scored scenario passes AND the negative controls fail.
 * A check that cannot fail proves nothing, so the controls are part of the
 * result, not a debugging aid.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  A8_S3_GROUNDING_RESPONSE,
  CRISIS_RESPONSE,
  CRISIS_THIRD_PARTY_RESPONSE,
  MEDICAL_EMERGENCY_CRISIS_RESPONSE,
} from '../src/pipeline/fallbacks.js';
import { hasSelfIngestion, hasThirdPartyCrisisLanguage } from '../src/agents/a1/crisis-keywords.js';
import { scoreScenario, type GoldSet, type ServedPath } from './gate-scoring.js';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, '..');
const goldSet = JSON.parse(readFileSync(join(apiRoot, 'eval/gold-set.json'), 'utf-8')) as GoldSet;
const approved = JSON.parse(
  readFileSync(join(apiRoot, 'src/__tests__/fixtures/e17-s7-approved-copy.json'), 'utf-8'),
) as { s3_reply_paragraphs: string[]; s4_card_paragraphs: string[]; source_docx_sha256: string };

const outFlag = process.argv.indexOf('--out');
const outPath = outFlag > -1 ? resolve(process.argv[outFlag + 1]) : null;

const signedS3 = approved.s3_reply_paragraphs.join('\n\n');
const signedS4 = approved.s4_card_paragraphs.join('\n\n');

type Row = {
  id: string;
  text: string;
  path: ServedPath;
  failures: string[];
  pass: boolean;
};

const rows: Row[] = [];
const crisisScenarios = goldSet.scenarios.filter((s) => s.category === 'crisis_self_harm');

/**
 * The texts production can serve a crisis disclosure with, chosen the way
 * `pipeline/orchestrator.ts` chooses them — third-party branch first, then the
 * ingestion branch, then the plain S4 card, plus the S3 grounding card for a
 * disclosure A1 reads as S3. Only deterministic copy, no model, no A1 call: the
 * choice is made by the same predicates the orchestrator uses
 * (`hasThirdPartyCrisisLanguage`, `hasSelfIngestion`).
 */
function servedTexts(message: string): Array<[string, string, ServedPath]> {
  if (hasThirdPartyCrisisLanguage(message)) {
    return [['third-party', CRISIS_THIRD_PARTY_RESPONSE, 'crisis']];
  }
  if (hasSelfIngestion(message)) {
    return [['S4+ingestion→medical', MEDICAL_EMERGENCY_CRISIS_RESPONSE, 'crisis']];
  }
  return [
    ['S4', CRISIS_RESPONSE, 'crisis'],
    ['S3', A8_S3_GROUNDING_RESPONSE, 'grounding'],
  ];
}

for (const scenario of crisisScenarios) {
  for (const [label, text, path] of servedTexts(scenario.message)) {
    const failures = scoreScenario(scenario, text, path);
    rows.push({ id: scenario.id, text: label, path, failures, pass: failures.length === 0 });
  }
}

// ─── byte-identity with the signed document ────────────────────────────────
const identity = {
  s3: A8_S3_GROUNDING_RESPONSE === signedS3,
  s4: CRISIS_RESPONSE === signedS4,
  source_docx_sha256: approved.source_docx_sha256,
};

// ─── negative controls ─────────────────────────────────────────────────────
// Each control is the *signed* text with one thing removed. If the scorer
// cannot tell these from the signed text, a green result above means nothing.
const controls = [
  {
    label: 'the S4 card cut off before the helplines',
    text: CRISIS_RESPONSE.split('Please contact')[0],
    path: 'crisis' as ServedPath,
  },
  {
    label: 'the S3 reply with the helplines stripped',
    text: A8_S3_GROUNDING_RESPONSE.replace(/Please reach a person.*$/m, ''),
    path: 'grounding' as ServedPath,
  },
  {
    label: 'a generic supportive reply served as the crisis card',
    text: "I'm here to support you. Could you tell me more about how you're feeling?",
    path: 'crisis' as ServedPath,
  },
].map((control) => {
  // Scored against the scenario the control is meant to fail: csh-01 talks
  // about ending their life, so every control above must fail it.
  const scenario = goldSet.scenarios.find((s) => s.id === 'csh-01')!;
  const failures = scoreScenario(scenario, control.text, control.path);
  return { ...control, text: undefined, failures, failedAsRequired: failures.length > 0 };
});

const passed = rows.filter((r) => r.pass).length;
const allPass = passed === rows.length;
const controlsOk = controls.every((c) => c.failedAsRequired);
const ok = allPass && controlsOk && identity.s3 && identity.s4;

const report = {
  story: 'E17-S7',
  what: 'The gate\'s own scorer (eval/gate-scoring.ts, shared with run-gate.ts) applied to the two clinically signed replies.',
  when: new Date().toISOString(),
  gold_set: { version: goldSet.version, scenarios_scored: crisisScenarios.length, score_rows: rows.length },
  signed_copy: identity,
  result: { passed, of: rows.length, all_pass: allPass },
  negative_controls: controls,
  rows,
  ok,
};

console.log(`gold set     ${goldSet.version}, ${crisisScenarios.length} crisis scenarios x 2 deterministic texts`);
console.log(`byte-exact   S3 ${identity.s3 ? 'match' : 'MISMATCH'} · S4 ${identity.s4 ? 'match' : 'MISMATCH'} (docx ${identity.source_docx_sha256.slice(0, 12)}…)`);
for (const row of rows) {
  console.log(`  ${row.id.padEnd(7)} ${row.text} @ ${row.path.padEnd(9)} ${row.pass ? 'pass' : 'FAIL'}`);
  for (const failure of row.failures) console.log(`      - ${failure}`);
}
console.log(`\nresult       ${passed}/${rows.length} passed`);
console.log('controls     ' + controls.map((c) => `${c.failedAsRequired ? 'failed-as-required' : 'PASSED (bad)'}: ${c.label}`).join('\n             '));
console.log(`ok           ${ok}`);

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 1) + '\n');
  console.log(`report       ${outPath}`);
}

process.exit(ok ? 0 : 1);
