/**
 * E17-S18 — the four-arm S-07 emission probe.
 *
 * The question: A2 is the only agent on the turn path whose structured output
 * is *requested in prose* rather than constrained by a schema, and it drops the
 * S-07 block on a large minority of turns. Three hypotheses are on the table —
 * the sheet got bigger, the contract drifted further from the top of it, or the
 * model will not reliably obey a prose request at temperature 0.7. This probe
 * separates them in one session, on one scenario set, with one instrument.
 *
 *   arm 1  base      the shipped v2.4 sheet, unchanged
 *   arm 2  v21       the v2.1 sheet, unchanged (the older, smaller reference)
 *   arm 3  reorder   v2.4 with §10+§11 moved to the front — no wording touched,
 *                    so this arm owes no clinical signature
 *   arm 4  schema    v2.4 with the answer forced through a strict tool schema,
 *                    the mechanism A1/A9-pre/A9-post already use
 *
 * Every arm answers the same scenarios, at the production temperature (0.7).
 * Each reply is then judged by the fixed instrument on the model of record,
 * because an arm that raises emission by flattening the reply is not an
 * improvement.
 *
 *   cd apps/api
 *   AWS_PROFILE=default ./node_modules/.bin/tsx eval/v2/probe-emission-4arm.ts \
 *     --reps 3 --concurrency 6 --out evidence/E17-S18-emission-4arm.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ToolConfiguration,
} from '@aws-sdk/client-bedrock-runtime';

import { buildConversationalPrompt } from '../../src/agents/a2/prompts.js';
import { parseA2Response } from '../../src/agents/a2/agent.js';
import { buildJudgeMessage, parseJudgeOutput, requirementsFor } from './judge.js';
import type { Scenario, ServedPath } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(__dirname, '../..');

const A2_MAX_TOKENS = 2048;
const A2_TEMPERATURE = 0.7;
const JUDGE_MAX_TOKENS = 3000;
const JUDGE_TEMPERATURE = 0;
const CALL_TIMEOUT_MS = 120_000;
const REGION = process.env.AWS_REGION ?? 'ap-south-1';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1];
  }
  return fallback;
}

const REPS = Number(arg('reps', '3'));
const CONCURRENCY = Number(arg('concurrency', '6'));
const OUT = arg('out', 'evidence/E17-S18-emission-4arm.json');
const MODEL_ID = arg('model', 'qwen.qwen3-32b-v1:0');
const JUDGE_MODEL_ID = arg('judge-model', MODEL_ID);
const LIMIT = Number(arg('limit', '0'));

const MODEL_OF_RECORD = 'qwen.qwen3-32b-v1:0';

// ─── the sheets ─────────────────────────────────────────────────────────────

function readSheet(version: string): string {
  return readFileSync(join(API_ROOT, 'src/prompts', `a2-okuvu-${version}.txt`), 'utf-8');
}

const SHEET_V24 = readSheet('v2.4');
const SHEET_V21 = readSheet('v2.1');

/**
 * Move §10 (SIGNAL OUTPUT) and §11 (OUTPUT FORMAT) to the front of the sheet,
 * ahead of §1. Nothing is reworded, reordered inside a section, added or
 * dropped — this is a positional edit only, which is why it needs no clinical
 * signature. `assertReorderIsPositional()` proves that on every run.
 */
function reorderFormatFirst(sheet: string): string {
  const fmtStart = sheet.indexOf('# 10. SIGNAL OUTPUT');
  const reminderStart = sheet.indexOf('# FINAL REMINDER');
  if (fmtStart === -1 || reminderStart === -1 || reminderStart < fmtStart) {
    throw new Error('reorder: §10 or FINAL REMINDER not found, refusing to guess');
  }
  const formatBlock = sheet.slice(fmtStart, reminderStart);
  const withoutFormat = `${sheet.slice(0, fmtStart)}${sheet.slice(reminderStart)}`;
  const firstSection = withoutFormat.indexOf('# 1. WHO YOU ARE');
  if (firstSection === -1) throw new Error('reorder: §1 not found');
  return `${withoutFormat.slice(0, firstSection)}${formatBlock}\n${withoutFormat.slice(firstSection)}`;
}

/** A positional edit changes no line; assert that rather than trusting it. */
function assertReorderIsPositional(before: string, after: string): void {
  const norm = (s: string): string[] =>
    s
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length > 0)
      .sort();
  const a = norm(before);
  const b = norm(after);
  if (a.length !== b.length || a.some((line, i) => line !== b[i])) {
    throw new Error('reorder arm is not positional: the line multiset changed, so it is a wording edit');
  }
}

const SHEET_REORDERED = reorderFormatFirst(SHEET_V24);
assertReorderIsPositional(SHEET_V24, SHEET_REORDERED);

/**
 * The forced schema for arm 4. Every field is required and none is nullable:
 * Bedrock's strict tool use is a narrower dialect than JSON Schema, and a
 * `null` sentinel is exactly the kind of thing that gets a schema rejected on
 * the wire. Empty string means "not applicable" and intensity 0 means "no
 * estimate"; the probe translates both back when counting populated fields.
 */
const SIGNAL_TOOL: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: 'emit_reply_and_signal',
        description: 'Emit this turn to the user and the machine-readable S-07 signal that accompanies it.',
        strict: true,
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              reply: {
                type: 'string',
                description: 'Block 1 — the user-facing reply, plain conversational text, no markdown.',
              },
              technique_used: { type: 'string', description: 'tool id actually used this turn, or "none".' },
              tool_launched: {
                type: 'string',
                description: 'tool id whose interactive version was offered this turn, or "none".',
              },
              taper_state: { type: 'string', enum: ['none', 'solution_reached', 'pacifying', 'nowhere'] },
              closure_offered: { type: 'boolean' },
              frustration_event: { type: 'boolean' },
              homework_referenced: { type: 'boolean' },
              therapist_referral: { type: 'boolean' },
              intensity: { type: 'integer', description: '1-10, or 0 when there is no estimate.' },
              primary_emotion: { type: 'string', description: 'plain English emotion word, or "none".' },
              mood_confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              journal_prompt_suggested: { type: 'string', description: 'suggested prompt text, or "none".' },
            },
            required: [
              'reply',
              'technique_used',
              'tool_launched',
              'taper_state',
              'closure_offered',
              'frustration_event',
              'homework_referenced',
              'therapist_referral',
              'intensity',
              'primary_emotion',
              'mood_confidence',
              'journal_prompt_suggested',
            ],
          },
        },
      },
    },
  ],
  toolChoice: { tool: { name: 'emit_reply_and_signal' } },
};

const SIGNAL_FIELDS = [
  'technique_used',
  'tool_launched',
  'taper_state',
  'closure_offered',
  'frustration_event',
  'homework_referenced',
  'therapist_referral',
  'intensity',
  'primary_emotion',
  'journal_prompt_suggested',
] as const;

// ─── arms ───────────────────────────────────────────────────────────────────

interface Arm {
  name: string;
  sheet: string;
  schema: boolean;
  note: string;
}

const ARMS: Arm[] = [
  { name: 'base', sheet: SHEET_V24, schema: false, note: 'v2.4 as shipped' },
  { name: 'v21', sheet: SHEET_V21, schema: false, note: 'v2.1 as shipped (older, smaller)' },
  { name: 'reorder', sheet: SHEET_REORDERED, schema: false, note: 'v2.4, §10+§11 moved to the front, no wording change' },
  { name: 'schema', sheet: SHEET_V24, schema: true, note: 'v2.4, answer forced through a strict tool schema' },
];

// ─── scenarios ──────────────────────────────────────────────────────────────

const goldSet = JSON.parse(readFileSync(join(__dirname, 'gold-set.v2.json'), 'utf-8')) as {
  scenarios: Scenario[];
};

/**
 * Only the categories where A2 actually answers. Crisis, ingestion and the
 * fail-closed constants are served by deterministic copy that carries no block
 * and is not supposed to — counting them would mix "expected absent" into
 * "dropped" and inflate every arm's rate.
 */
const A2_CATEGORIES = ['scope_boundary', 'clinical_content', 'tone_alliance'] as const;
const PER_CATEGORY = Math.ceil(20 / A2_CATEGORIES.length);

function pickScenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const category of A2_CATEGORIES) {
    out.push(...goldSet.scenarios.filter((s) => s.category === category).slice(0, PER_CATEGORY));
  }
  return out;
}

const SCENARIOS = ((): Scenario[] => {
  const picked = pickScenarios();
  return LIMIT > 0 ? picked.slice(0, LIMIT) : picked;
})();

// ─── calls ──────────────────────────────────────────────────────────────────

interface CallResult {
  text: string;
  toolInput: Record<string, unknown> | null;
  usage: { inputTokens?: number; outputTokens?: number } | null;
  stopReason: string | null;
  error: string | null;
}

const client = new BedrockRuntimeClient({ region: REGION });

async function converse(
  modelId: string,
  system: string,
  user: string,
  maxTokens: number,
  temperature: number,
  tool?: ToolConfiguration,
): Promise<CallResult> {
  try {
    const response = await client.send(
      new ConverseCommand({
        modelId,
        system: [{ text: system }],
        messages: [{ role: 'user', content: [{ text: user }] }],
        inferenceConfig: { maxTokens, temperature },
        ...(tool ? { toolConfig: tool } : {}),
      }),
      { abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS) },
    );
    const blocks = response.output?.message?.content ?? [];
    const text = blocks.map((b) => ('text' in b && b.text ? b.text : '')).join('');
    const toolUse = blocks.find((b) => 'toolUse' in b && b.toolUse);
    const toolInput =
      toolUse && 'toolUse' in toolUse && toolUse.toolUse
        ? ((toolUse.toolUse.input as Record<string, unknown>) ?? null)
        : null;
    return {
      text,
      toolInput,
      usage: (response.usage as CallResult['usage']) ?? null,
      stopReason: response.stopReason ?? null,
      error: null,
    };
  } catch (err) {
    return {
      text: '',
      toolInput: null,
      usage: null,
      stopReason: null,
      error: `${err instanceof Error ? err.name : 'unknown'}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── one turn ───────────────────────────────────────────────────────────────

interface TurnResult {
  scenario: string;
  category: string;
  safety_state: string;
  arm: string;
  rep: number;
  signal_present: boolean;
  fields_populated: number;
  reply_chars: number;
  reply_empty: boolean;
  stop_reason: string | null;
  in_tokens: number;
  out_tokens: number;
  verdict: string;
  judge_error: boolean;
  elapsed_ms: number;
  error: string | null;
  raw_head: string;
}

function normaliseField(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v.length > 0 && v !== 'none' && v !== 'null' && v !== 'n/a';
  }
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'boolean') return true;
  return false;
}

function paramsFor(scenario: Scenario): Parameters<typeof buildConversationalPrompt>[0] {
  return {
    safetyState: (scenario.context.safety_state as string) ?? 'S0',
    sessionHistorySummary: (scenario.context.session_history_summary as string | null) ?? null,
    perceivedIntensity: (scenario.context.perceived_intensity as number | null) ?? null,
    userMemoryContext: (scenario.context.user_memory as string | null) ?? null,
    retrievedContext: (scenario.context.retrieved_context as string | null) ?? null,
    therapistName: (scenario.context.therapist_name as string | null) ?? null,
    carePlanFocus: (scenario.context.care_plan_focus as string | null) ?? null,
    homework: (scenario.context.homework as string | null) ?? null,
    toolkit: (scenario.context.toolkit as string[] | undefined) ?? [],
    languageMode: ((scenario.context.language_mode as 'english' | 'mirror') ?? 'english'),
  };
}

const judgePrompt = readFileSync(join(__dirname, 'judge-prompt.txt'), 'utf-8');

async function runTurn(scenario: Scenario, arm: Arm, rep: number): Promise<TurnResult> {
  const started = Date.now();
  const system = buildConversationalPrompt(paramsFor(scenario), arm.sheet);

  const call = await converse(
    MODEL_ID,
    system,
    scenario.message,
    A2_MAX_TOKENS,
    A2_TEMPERATURE,
    arm.schema ? SIGNAL_TOOL : undefined,
  );

  let reply = '';
  let signal: Record<string, unknown> | null = null;

  if (arm.schema) {
    if (call.toolInput) {
      reply = typeof call.toolInput.reply === 'string' ? call.toolInput.reply : '';
      signal = call.toolInput;
    }
  } else {
    const parsed = parseA2Response(call.text);
    reply = parsed.userContent;
    signal = (parsed.signal as unknown as Record<string, unknown> | null) ?? null;
  }

  let verdict = 'ungraded';
  let judgeError = false;
  if (!call.error && reply.trim().length > 0) {
    const requirements = requirementsFor(scenario, 'a2' as ServedPath);
    if (requirements.length > 0) {
      const judgeCall = await converse(
        JUDGE_MODEL_ID,
        judgePrompt,
        buildJudgeMessage(scenario, 'a2' as ServedPath, reply),
        JUDGE_MAX_TOKENS,
        JUDGE_TEMPERATURE,
      );
      if (judgeCall.error) {
        verdict = 'cannot_tell';
        judgeError = true;
      } else {
        const out = parseJudgeOutput(judgeCall.text);
        verdict = out.verdict ?? 'cannot_tell';
        judgeError = !out.ok;
      }
    }
  }

  return {
    scenario: scenario.id,
    category: scenario.category,
    safety_state: (scenario.context.safety_state as string) ?? 'S0',
    arm: arm.name,
    rep,
    signal_present: signal !== null,
    fields_populated: signal ? SIGNAL_FIELDS.filter((f) => normaliseField(signal![f])).length : 0,
    reply_chars: reply.trim().length,
    reply_empty: reply.trim().length === 0,
    stop_reason: call.stopReason,
    in_tokens: call.usage?.inputTokens ?? 0,
    out_tokens: call.usage?.outputTokens ?? 0,
    verdict,
    judge_error: judgeError,
    elapsed_ms: Date.now() - started,
    error: call.error,
    raw_head: (arm.schema ? JSON.stringify(call.toolInput) : call.text).slice(0, 300) ?? '',
  };
}

// ─── main ───────────────────────────────────────────────────────────────────

function wilsonLower(emitted: number, n: number): number {
  if (n === 0) return 0;
  const p = emitted / n;
  const z = 1.96;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return (centre - spread) / denom;
}

async function main(): Promise<void> {
  const tasks: Array<{ scenario: Scenario; arm: Arm; rep: number }> = [];
  for (const arm of ARMS) {
    for (const scenario of SCENARIOS) {
      for (let rep = 0; rep < REPS; rep++) tasks.push({ scenario, arm, rep });
    }
  }

  process.stderr.write(
    `4-arm S-07 emission probe: ${SCENARIOS.length} scenarios x ${ARMS.length} arms x ${REPS} reps = ${tasks.length} A2 calls on ${MODEL_ID} (${REGION}), judge ${JUDGE_MODEL_ID}\n`,
  );

  let done = 0;
  const rows = await pool(tasks, CONCURRENCY, async (t) => {
    const row = await runTurn(t.scenario, t.arm, t.rep);
    done += 1;
    if (done % 20 === 0) process.stderr.write(`  ${done}/${tasks.length}\n`);
    return row;
  });

  const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

  const summaries = ARMS.map((arm) => {
    const subset = rows.filter((r) => r.arm === arm.name);
    const ok = subset.filter((r) => !r.error);
    const missing = ok.filter((r) => !r.signal_present).length;
    const emitted = ok.length - missing;
    const judged = subset.filter((r) => r.verdict === 'satisfied' || r.verdict === 'not_satisfied');
    const satisfied = judged.filter((r) => r.verdict === 'satisfied').length;
    return {
      arm: arm.name,
      note: arm.note,
      schema_forced: arm.schema,
      sheet_sha256: sha(arm.sheet),
      sheet_chars: arm.sheet.length,
      turns: subset.length,
      errors: subset.filter((r) => r.error).length,
      signal_missing: missing,
      emission_pct: ok.length > 0 ? Math.round((emitted / ok.length) * 1000) / 10 : 0,
      emission_wilson_lower: Math.round(wilsonLower(emitted, ok.length) * 1000) / 10,
      full_fields: ok.filter((r) => r.fields_populated === SIGNAL_FIELDS.length).length,
      mean_fields_populated:
        ok.length > 0 ? Math.round((ok.reduce((a, r) => a + r.fields_populated, 0) / ok.length) * 10) / 10 : 0,
      empty_replies: subset.filter((r) => r.reply_empty).length,
      judged: judged.length,
      satisfied,
      satisfied_pct: judged.length > 0 ? Math.round((satisfied / judged.length) * 1000) / 10 : 0,
      mean_reply_chars:
        ok.length > 0 ? Math.round(ok.reduce((a, r) => a + r.reply_chars, 0) / ok.length) : 0,
    };
  });

  const byCategory = A2_CATEGORIES.map((category) => {
    const row: Record<string, unknown> = { category };
    for (const arm of ARMS) {
      const subset = rows.filter((r) => r.arm === arm.name && r.category === category && !r.error);
      const emitted = subset.filter((r) => r.signal_present).length;
      row[arm.name] =
        subset.length > 0 ? `${emitted}/${subset.length} (${Math.round((emitted / subset.length) * 100)}%)` : 'n/a';
    }
    return row;
  });

  const byScenario = SCENARIOS.map((scenario) => {
    const row: Record<string, unknown> = { id: scenario.id, category: scenario.category };
    for (const arm of ARMS) {
      const subset = rows.filter((r) => r.arm === arm.name && r.scenario === scenario.id && !r.error);
      row[arm.name] = `${subset.filter((r) => r.signal_present).length}/${subset.length}`;
    }
    return row;
  });

  const inTokens = rows.reduce((a, r) => a + r.in_tokens, 0);
  const outTokens = rows.reduce((a, r) => a + r.out_tokens, 0);
  const listPriceUsd = (inTokens / 1e6) * 0.18 + (outTokens / 1e6) * 0.71;

  const report = {
    probe: 'E17-S18 four-arm S-07 emission',
    generated_at: new Date().toISOString(),
    question:
      'A2 drops its machine block on a minority of turns. Is that sheet size, the distance of the contract from the top of the sheet, or prose-vs-schema at temperature 0.7?',
    model: MODEL_ID,
    model_of_record: MODEL_OF_RECORD,
    judge_model: JUDGE_MODEL_ID,
    judge_fixed_across_arms: JUDGE_MODEL_ID === MODEL_OF_RECORD,
    region: REGION,
    temperature: A2_TEMPERATURE,
    reps: REPS,
    concurrency: CONCURRENCY,
    a2_calls: rows.length,
    tokens: { input: inTokens, output: outTokens },
    list_price_usd: Math.round(listPriceUsd * 1000) / 1000,
    scenarios: SCENARIOS.map((s) => ({ id: s.id, category: s.category, safety_state: s.context.safety_state })),
    safety_state_spread: SCENARIOS.reduce<Record<string, number>>((acc, s) => {
      const k = (s.context.safety_state as string) ?? 'S0';
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
    arms: summaries,
    by_category: byCategory,
    by_scenario: byScenario,
    turns: rows,
  };

  const repoRoot = ((): string => {
    try {
      return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: API_ROOT, encoding: 'utf-8' }).trim();
    } catch {
      return API_ROOT;
    }
  })();
  const outPath = OUT.startsWith('/') ? OUT : join(repoRoot, OUT);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`\n4-arm S-07 emission probe — ${SCENARIOS.length} scenarios x ${ARMS.length} arms x ${REPS} reps`);
  console.log(`model ${MODEL_ID} (${REGION}) temperature ${A2_TEMPERATURE}; judge fixed on ${JUDGE_MODEL_ID}`);
  console.log(
    `A2 calls ${rows.length}, tokens ${inTokens} in / ${outTokens} out, list price $${report.list_price_usd}\n`,
  );
  console.log('arm        sheet   turns  emitted  missing  emission%  (95% low)  full-fields  mean-fields  empty  judged  satisfied  mean-chars');
  for (const s of summaries) {
    console.log(
      `${s.arm.padEnd(10)} ${String(s.sheet_chars).padStart(6)} ${String(s.turns).padStart(6)} ${String(
        s.turns - s.errors - s.signal_missing,
      ).padStart(8)} ${String(s.signal_missing).padStart(8)} ${String(s.emission_pct).padStart(9)}% ${String(
        s.emission_wilson_lower,
      ).padStart(10)}% ${String(s.full_fields).padStart(12)} ${String(s.mean_fields_populated).padStart(
        12,
      )} ${String(s.empty_replies).padStart(6)} ${String(s.judged).padStart(7)} ${String(s.satisfied_pct).padStart(
        9,
      )}% ${String(s.mean_reply_chars).padStart(10)}`,
    );
  }
  console.log('\nby category (emitted/turns)');
  for (const row of byCategory) console.log(JSON.stringify(row));
  console.log(`\nsafety-state spread of the probe set: ${JSON.stringify(report.safety_state_spread)}`);
  console.log(`\nwritten to ${outPath}`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
