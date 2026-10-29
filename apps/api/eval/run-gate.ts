/**
 * E17-S5 — the eval gate runner.
 *
 * Runs the committed gold set (`eval/gold-set.json`) and prints/serialises a
 * deterministic score report. The gate is defined in `plan/ORCHESTRATION-v1.md`
 * §8; this file implements it and nothing more:
 *
 *   • the system prompt is the PRODUCT'S OWN — `buildConversationalPrompt()`
 *     over `src/prompts/a2-okuvu-v2.1.txt`, the same function the A2 agent
 *     calls in the api task. This runner has no prompt text of its own, so the
 *     gate cannot drift from what ships;
 *   • the model call is a live Converse call to the pinned model id
 *     (`provider-config.ts` DEFAULT_BEDROCK_MODEL_ID) in ap-south-1, with the
 *     production defaults (`maxTokens` 2048, `temperature` 0.7 — lib/bedrock.ts);
 *   • **no retries.** Every call is a single attempt. A throttle, a timeout or
 *     any other exception fails the RUN (`run_ok:false`) instead of being
 *     retried, because plan §8 defines a clean run as one with zero retries;
 *   • scoring is rubric matching only — no LLM judge. Matching runs over the
 *     user-facing text after the product's own `parseA2Response()` strips the
 *     S-07 machine block, exactly as the api task does before delivery;
 *   • `mode:"failclosed"` scenarios call no model by design: they drive the
 *     real fail-closed selectors (`fallbacks.ts`), the real crisis floor
 *     (`hasCrisisLanguage`) and the real failure classifier
 *     (`classifyLlmFailure`) with a genuinely failing Converse call, then score
 *     the text the product would serve.
 *
 * Usage:
 *   pnpm --filter @okuvu/api eval:gate -- --label run-1 \
 *     --out ../../evidence/E17-S5-runs/run-1.json
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

import { buildConversationalPrompt } from '../src/agents/a2/prompts.js';
import { parseA2Response } from '../src/agents/a2/agent.js';
import { A2_PROMPT_VERSION } from '../src/prompts/index.js';
import { DEFAULT_AWS_REGION, DEFAULT_BEDROCK_MODEL_ID } from '../src/lib/provider-config.js';
import { classifyLlmFailure } from '../src/lib/llm-failure.js';
import { hasCrisisLanguage } from '../src/agents/a1/crisis-keywords.js';
import {
  CRISIS_RESPONSE,
  SAFETY_UNAVAILABLE_RESPONSE,
  getModelUnavailableFallback,
} from '../src/pipeline/fallbacks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(__dirname, '..');

/** Repo root from git itself — a hard-coded `../../..` is wrong the moment this moves. */
function repoRoot(): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: API_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return API_ROOT;
  }
}
const REPO_ROOT = repoRoot();
const PROMPT_FILE = join(API_ROOT, 'src/prompts/a2-okuvu-v2.1.txt');

// Production inference defaults — must stay identical to lib/bedrock.ts
// (DEFAULT_MAX_OUTPUT_TOKENS = 2048, `temperature ?? 0.7`). A2 passes no
// generationConfig, so these are the values that reach the wire in production.
const MAX_TOKENS = 2048;
const TEMPERATURE = 0.7;
const CALL_TIMEOUT_MS = 60_000;

type RubricGroup = { label: string; any_of: string[] };

interface Scenario {
  id: string;
  mode: 'model' | 'failclosed';
  category: string;
  message: string;
  context: Record<string, unknown>;
  must_include: RubricGroup[];
  must_not_include: RubricGroup[];
  must_escalate: RubricGroup | null;
  probe?: { kind: string; safety_state: string | null; message: string };
}

interface GoldSet {
  version: string;
  thresholds: Record<string, number>;
  min_scenarios: Record<string, number>;
  scenarios: Scenario[];
}

interface ScenarioResult {
  id: string;
  category: string;
  mode: string;
  pass: boolean;
  failed_groups: string[];
  reply_chars: number;
  reply: string;
  /** A2 must emit its S-07 machine block every turn (prompt §11). Diagnostic, not scored. */
  signal_present?: boolean;
  served_text?: string;
  model_call?: { ok: boolean; usage: unknown; stop_reason: string | null; error: string | null };
  elapsed_ms: number;
}

// ─── rubric matching ────────────────────────────────────────────────────────

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;

/**
 * A rubric phrase is a literal, matched case-insensitively as a whole word
 * (lookaround, so "now" never matches "know"), with any run of whitespace
 * standing in for a space. A trailing plural is optional on the last word, so
 * "long day" matches "long days" — plural inflection is not a behavioural
 * difference and a rubric should not punish it. A phrase prefixed `re:` is an
 * explicit regex — the only place structure (markdown bullets) needs matching
 * rather than wording.
 */
function phraseToRegex(phrase: string): RegExp {
  if (phrase.startsWith('re:')) return new RegExp(phrase.slice(3), 'im');
  const body = phrase
    .replace(ESCAPE_RE, '\\$&')
    .replace(/\s+/g, '\\s+')
    .replace(/['’]/g, "['’]");
  const optionalPlural = /[a-z]$/.test(body) ? 's?' : '';
  return new RegExp(`(?<![a-z0-9])${body}${optionalPlural}(?![a-z0-9])`, 'i');
}

/** Normalise typographic punctuation so a curly apostrophe cannot fail a rubric. */
function normalise(text: string): string {
  return text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').split(/\r\n/).join('\n');
}

function groupMatches(group: RubricGroup, text: string): boolean {
  return group.any_of.some((phrase) => phraseToRegex(phrase).test(text));
}

function scoreScenario(scenario: Scenario, scoredText: string): string[] {
  const text = normalise(scoredText);
  const failed: string[] = [];

  for (const group of scenario.must_include) {
    if (!groupMatches(group, text)) failed.push(`must_include: ${group.label}`);
  }
  for (const group of scenario.must_not_include) {
    if (groupMatches(group, text)) failed.push(`must_not_include: ${group.label}`);
  }
  if (scenario.must_escalate && !groupMatches(scenario.must_escalate, text)) {
    failed.push(`must_escalate: ${scenario.must_escalate.label}`);
  }
  return failed;
}

// ─── execution ──────────────────────────────────────────────────────────────

let modelCalls = 0;
let modelCallFailures = 0;
let probeCalls = 0;
let probeFailures = 0;

async function callModel(
  client: BedrockRuntimeClient,
  modelId: string,
  systemInstruction: string,
  message: string,
  probe = false,
): Promise<{ text: string; usage: unknown; stopReason: string | null; error: string | null }> {
  // Single attempt. Deliberately no retry/backoff: plan §8 says a throttled or
  // errored call fails the run rather than being retried silently. A probe
  // call is one made to a non-existent model id on purpose (fail_closed
  // scenarios); its failure is the expected outcome and is counted apart from
  // the gate's own calls so it cannot mask — or fake — an unclean run.
  if (probe) probeCalls += 1;
  else modelCalls += 1;
  try {
    const response = await client.send(
      new ConverseCommand({
        modelId,
        system: [{ text: systemInstruction }],
        messages: [{ role: 'user', content: [{ text: message }] }],
        inferenceConfig: { maxTokens: MAX_TOKENS, temperature: TEMPERATURE },
      }),
      { abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS) },
    );
    const text =
      response.output?.message?.content
        ?.map((block) => ('text' in block && block.text ? block.text : ''))
        .join('') ?? '';
    return { text, usage: response.usage ?? null, stopReason: response.stopReason ?? null, error: null };
  } catch (err) {
    if (probe) probeFailures += 1;
    else modelCallFailures += 1;
    const name = err instanceof Error ? err.name : 'unknown';
    const messageText = err instanceof Error ? err.message : String(err);
    return { text: '', usage: null, stopReason: null, error: `${name}: ${messageText}` };
  }
}

/**
 * The fail-closed probes. `model_unreachable` issues a REAL Converse call to a
 * model id that cannot exist, so the failure being handled is a genuine AWS
 * service error, not a synthetic one. `model_throttled` cannot be induced on
 * demand without hammering the service, so a ThrottlingException-shaped error
 * is fed to the real classifier — that is the only simulated input here, and it
 * is recorded as such in the report.
 */
function runFailClosedProbe(
  scenario: Scenario,
  classifierDowngrade?: { kind: string },
): { served: string; detail: string } {
  const probe = scenario.probe!;
  const message = probe.message;

  if (probe.kind === 'classifier_unavailable') {
    // Mirrors pipeline/orchestrator.ts:215-236 — the deterministic crisis floor
    // runs on the same keyword module and can only raise the state to S4.
    const crisisFloorMatched = hasCrisisLanguage(message);
    const safetyState = crisisFloorMatched ? 'S4' : 'S2';
    if (crisisFloorMatched) {
      return { served: CRISIS_RESPONSE, detail: `a1 unavailable, crisis floor matched (${safetyState}) -> crisis path` };
    }
    return { served: SAFETY_UNAVAILABLE_RESPONSE, detail: `a1 unavailable, no crisis language (${safetyState}) -> static substitute, A2 not called` };
  }

  if (probe.kind === 'model_throttled') {
    const synthetic = Object.assign(new Error('Rate exceeded'), { name: 'ThrottlingException' });
    const kind = classifyLlmFailure(synthetic);
    const served = getModelUnavailableFallback(probe.safety_state ?? 'S0');
    return {
      served,
      detail: `classifier=throttled (simulated ThrottlingException) kind=${kind} state=${probe.safety_state} -> getModelUnavailableFallback`,
    };
  }

  // model_unreachable — a real request to a model id that does not exist.
  const threw = classifierDowngrade?.kind ?? 'unavailable';
  const served = getModelUnavailableFallback(probe.safety_state ?? 'S0');
  return {
    served,
    detail: `real Converse error classified as ${threw} state=${probe.safety_state} -> getModelUnavailableFallback`,
  };
}

// ─── report ─────────────────────────────────────────────────────────────────

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main(): Promise<void> {
  const label = arg('label', 'run');
  const outPath = resolve(REPO_ROOT, arg('out', `evidence/E17-S5-runs/${label}.json`));
  const modelId = process.env.BEDROCK_MODEL_ID?.trim() || DEFAULT_BEDROCK_MODEL_ID;
  const region = DEFAULT_AWS_REGION;
  const startedAt = new Date().toISOString();

  const goldSetPath = join(__dirname, 'gold-set.json');
  const goldSet = JSON.parse(readFileSync(goldSetPath, 'utf-8')) as GoldSet;

  // ── the gold set must satisfy plan §8 before anything is measured ─────────
  const shapeErrors: string[] = [];
  const counts: Record<string, number> = {};
  for (const scenario of goldSet.scenarios) {
    counts[scenario.category] = (counts[scenario.category] ?? 0) + 1;
  }
  if (goldSet.scenarios.length < 40) shapeErrors.push(`scenarios=${goldSet.scenarios.length} < 40`);
  for (const [category, minimum] of Object.entries(goldSet.min_scenarios)) {
    const actual = counts[category] ?? 0;
    if (actual < minimum) shapeErrors.push(`${category}=${actual} < ${minimum}`);
  }
  for (const scenario of goldSet.scenarios) {
    if (!goldSet.thresholds[scenario.category]) shapeErrors.push(`${scenario.id}: no threshold for ${scenario.category}`);
    if (scenario.must_include.length === 0) shapeErrors.push(`${scenario.id}: empty must_include`);
  }
  if (shapeErrors.length > 0) {
    console.error(JSON.stringify({ ok: false, stage: 'gold-set-shape', shape_errors: shapeErrors }, null, 2));
    process.exit(2);
  }

  const client = new BedrockRuntimeClient({ region });
  const results: ScenarioResult[] = [];

  for (const scenario of goldSet.scenarios) {
    const scenarioStart = Date.now();

    if (scenario.mode === 'model') {
      const systemInstruction = buildConversationalPrompt({
        safetyState: String(scenario.context.safety_state ?? 'S0'),
        sessionHistorySummary: (scenario.context.session_history_summary as string | null) ?? null,
        perceivedIntensity: (scenario.context.perceived_intensity as number | null) ?? null,
        userMemoryContext: (scenario.context.user_memory as string | null) ?? null,
        retrievedContext: (scenario.context.retrieved_context as string | null) ?? null,
        therapistName: (scenario.context.therapist_name as string | null) ?? null,
        carePlanFocus: (scenario.context.care_plan_focus as string | null) ?? null,
        homework: (scenario.context.homework as string | null) ?? null,
        toolkit: (scenario.context.toolkit as string[] | undefined) ?? [],
        languageMode: ((scenario.context.language_mode as 'english' | 'mirror') ?? 'english'),
      });

      const call = await callModel(client, modelId, systemInstruction, scenario.message);
      if (call.error) {
        results.push({
          id: scenario.id,
          category: scenario.category,
          mode: scenario.mode,
          pass: false,
          failed_groups: [`model call failed (no retry, run failed): ${call.error}`],
          reply_chars: 0,
          reply: '',
          model_call: { ok: false, usage: null, stop_reason: null, error: call.error },
          elapsed_ms: Date.now() - scenarioStart,
        });
        continue;
      }

      // The product strips the S-07 block before delivery; score what the user sees.
      const parsed = parseA2Response(call.text);
      const userFacing = parsed.userContent;
      results.push({
        id: scenario.id,
        category: scenario.category,
        mode: scenario.mode,
        pass: false, // filled below
        failed_groups: scoreScenario(scenario, userFacing),
        reply_chars: userFacing.length,
        reply: userFacing,
        signal_present: parsed.signal !== null,
        model_call: { ok: true, usage: call.usage, stop_reason: call.stopReason, error: null },
        elapsed_ms: Date.now() - scenarioStart,
      });
      results[results.length - 1].pass = results[results.length - 1].failed_groups.length === 0;
    } else {
      // failclosed — one real failing Converse call per run proves the failure
      // shape is genuine; the selection then uses the real product functions.
      let classifiedKind = 'unavailable';
      if (scenario.probe?.kind === 'model_unreachable') {
        const call = await callModel(client, `${modelId}-does-not-exist`, 'probe', 'probe', true);
        if (!call.error) {
          results.push({
            id: scenario.id,
            category: scenario.category,
            mode: scenario.mode,
            pass: false,
            failed_groups: ['probe: expected the unreachable model id to fail, but the call succeeded'],
            reply_chars: 0,
            reply: '',
            model_call: { ok: true, usage: call.usage, stop_reason: call.stopReason, error: null },
            elapsed_ms: Date.now() - scenarioStart,
          });
          continue;
        }
        classifiedKind = classifyLlmFailure(
          Object.assign(new Error(call.error), { name: call.error.split(':')[0] }),
        );
      }

      const { served, detail } = runFailClosedProbe(scenario, { kind: classifiedKind });
      results.push({
        id: scenario.id,
        category: scenario.category,
        mode: scenario.mode,
        pass: false,
        failed_groups: scoreScenario(scenario, served),
        reply_chars: served.length,
        reply: served,
        served_text: served,
        model_call: { ok: true, usage: null, stop_reason: detail, error: null },
        elapsed_ms: Date.now() - scenarioStart,
      });
      results[results.length - 1].pass = results[results.length - 1].failed_groups.length === 0;
    }
  }

  const categories: Record<string, { total: number; passed: number; score: number; threshold: number; met: boolean }> = {};
  for (const category of Object.keys(goldSet.min_scenarios)) {
    const rows = results.filter((r) => r.category === category);
    const passed = rows.filter((r) => r.pass).length;
    const score = rows.length === 0 ? 0 : passed / rows.length;
    const threshold = goldSet.thresholds[category];
    categories[category] = { total: rows.length, passed, score: Number(score.toFixed(4)), threshold, met: score >= threshold };
  }
  const overallPassed = results.filter((r) => r.pass).length;
  const overallScore = results.length === 0 ? 0 : overallPassed / results.length;
  const overall = {
    total: results.length,
    passed: overallPassed,
    score: Number(overallScore.toFixed(4)),
    threshold: goldSet.thresholds.overall,
    met: overallScore >= goldSet.thresholds.overall,
  };

  const promptHash = sha256File(PROMPT_FILE);
  const gateMet =
    overall.met &&
    Object.values(categories).every((c) => c.met) &&
    Object.keys(goldSet.thresholds)
      .filter((k) => k !== 'overall')
      .every((k) => (categories[k] ? categories[k].met : false));

  const report = {
    label,
    story: 'E17-S5',
    plan_reference: 'plan/ORCHESTRATION-v1.md §8',
    started_at_utc: startedAt,
    ended_at_utc: new Date().toISOString(),
    run_ok: modelCallFailures === 0,
    run_ok_reason:
      modelCallFailures === 0
        ? 'no retries: every call was a single attempt and every attempt returned'
        : `${modelCallFailures} model call(s) failed and were NOT retried; the run is not clean`,
    gate_met: gateMet && modelCallFailures === 0,
    model: {
      id: modelId,
      id_source: process.env.BEDROCK_MODEL_ID ? 'env BEDROCK_MODEL_ID' : 'provider-config DEFAULT_BEDROCK_MODEL_ID',
      region,
      api: 'bedrock-runtime Converse',
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    },
    prompt: {
      agent: 'A2',
      version: A2_PROMPT_VERSION,
      file: 'apps/api/src/prompts/a2-okuvu-v2.1.txt',
      sha256: promptHash,
      built_by: 'buildConversationalPrompt() from src/agents/a2/prompts.ts',
    },
    code: {
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
      commit: git(['rev-parse', 'HEAD']),
      // Tracked files only: the run writes its own (untracked) report into the
      // repo, and an untracked report is not a dirty tree under test.
      tracked_tree_dirty_at_run_start: git(['status', '--porcelain', '--untracked-files=no']).length !== 0,
    },
    gold_set: {
      path: 'apps/api/eval/gold-set.json',
      version: goldSet.version,
      sha256: sha256File(goldSetPath),
      scenarios: goldSet.scenarios.length,
      per_category: counts,
    },
    s07_signal_missing: results.filter((r) => r.mode === 'model' && r.signal_present === false).length,
    calls: {
      gate_calls: modelCalls,
      gate_failures: modelCallFailures,
      probe_calls: probeCalls,
      probe_failures_expected: probeFailures,
      retries: 0,
    },
    categories,
    overall,
    failures: results.filter((r) => !r.pass).map((r) => ({ id: r.id, category: r.category, failed_groups: r.failed_groups })),
    results,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');

  console.log(`\nE17-S5 eval gate — ${label}`);
  console.log(`model      ${modelId} (${region}, Converse)`);
  console.log(`prompt     A2 ${A2_PROMPT_VERSION} sha256=${promptHash.slice(0, 16)}…`);
  console.log(`commit     ${report.code.commit} (${report.code.branch})`);
  console.log(`calls      ${modelCalls} gate calls single-attempt, ${modelCallFailures} failed, 0 retries`);
  console.log(`probes     ${probeCalls} deliberate unreachable-model calls, ${probeFailures} failed as expected`);
  console.log('');
  for (const [category, row] of Object.entries(categories)) {
    console.log(
      `  ${category.padEnd(18)} ${String(row.passed).padStart(2)}/${String(row.total).padEnd(2)} ` +
        `${(row.score * 100).toFixed(1).padStart(5)}%  need ${(row.threshold * 100).toFixed(0).padStart(3)}%  ${row.met ? 'PASS' : 'FAIL'}`,
    );
  }
  console.log(
    `  ${'overall'.padEnd(18)} ${String(overall.passed).padStart(2)}/${String(overall.total).padEnd(2)} ` +
      `${(overall.score * 100).toFixed(1).padStart(5)}%  need ${(overall.threshold * 100).toFixed(0).padStart(3)}%  ${overall.met ? 'PASS' : 'FAIL'}`,
  );
  console.log(`\ngate_met   ${report.gate_met}`);
  if (report.failures.length > 0) {
    console.log('\nfailed scenarios');
    for (const failure of report.failures) {
      console.log(`  ${failure.id} (${failure.category})`);
      for (const group of failure.failed_groups) console.log(`    - ${group}`);
    }
  }
  console.log(`\nreport     ${outPath}`);

  process.exit(report.gate_met ? 0 : 1);
}

main().catch((err) => {
  console.error('gate runner crashed:', err);
  process.exit(3);
});
