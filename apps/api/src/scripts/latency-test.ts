import { processTurn } from '../pipeline/orchestrator.js';
import { prisma } from '../lib/prisma.js';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../../.env') });

const TEST_UID = 'latency-test-user';
const TEST_SESSION_ID = 'latency-test-session';

// ─── A8 (OKUVU — Plumbing Fixes & Rationale v1.0): per-stage latency budgets ──
//
// "Profile per-agent latency, set a budget, track as a retention KPI." The
// 20 Sep review measured 8–23 s PER TURN with no visibility into which stage
// was burning it. processTurn already records per-stage `StageTiming[]` —
// this script now aggregates them and asserts each against an explicit
// budget, so a regression names the guilty stage instead of hiding inside a
// total. Budgets are defaults, not clinical gates (the doc: "not a safety
// gate, but a real retention risk") — override any of them with
// LATENCY_BUDGET_<STAGE>_MS (e.g. LATENCY_BUDGET_A2_RESPONSE_MS=15000).
//
// NOTE on where the KPI lives long-term: the budgets/checks below are the
// script-side half. The run-side half is B2's run identity (build/prompt
// pinning) — a latency number is only comparable across runs when both were
// produced by the same (build, model, prompt).
const DEFAULT_STAGE_BUDGETS_MS: Record<string, number> = {
  A1: 4_000,
  A9_pre: 4_000,
  A8_router: 50,
  layer3_rag: 3_000,
  A2_response: 12_000,
  A9_post: 8_000,
  total_turn: 15_000,
};

function stageBudget(stage: string): number {
  const envName = `LATENCY_BUDGET_${stage.toUpperCase()}_MS`;
  const raw = process.env[envName];
  if (raw && raw.trim() !== '' && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  return DEFAULT_STAGE_BUDGETS_MS[stage] ?? Number.MAX_SAFE_INTEGER;
}

async function setup(): Promise<void> {
  await prisma.user.upsert({
    where: { firebase_uid: TEST_UID },
    update: {},
    create: {
      id: TEST_UID,
      firebase_uid: TEST_UID,
      phone_number: '+910000000000',
    },
  });

  await prisma.sessionLog.create({
    data: {
      id: TEST_SESSION_ID,
      user_id: TEST_UID,
      turn_count: 0,
    },
  }).catch(() => {});
}

const MESSAGES = [
  'I had a rough day at work today',
  'Feeling a bit anxious about tomorrow',
  'I tried the breathing exercise you suggested',
  'My sleep has been better this week',
  'I feel like I am making progress',
  'Had a disagreement with my partner',
  'The grounding technique helped with my panic',
  'I am worried about my presentation',
  'I felt proud of myself for handling a difficult situation',
  'I am grateful for this conversation',
  'I have been feeling lonely lately',
  'The mindfulness exercise was helpful',
  'I am struggling with motivation',
  'I had a good therapy session today',
  'I feel stuck in my current routine',
  'I am trying to be more patient with myself',
  'The weather has been affecting my mood',
  'I reconnected with an old friend',
  'I am learning to accept my emotions',
  'I set a small goal and achieved it',
  'I felt overwhelmed at the grocery store',
  'I am practicing self-compassion',
  'I had a nightmare last night',
  'I am proud of myself for reaching out',
  'I want to work on my communication skills',
];

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function run(): Promise<void> {
  await setup().catch(() => {});

  const latencies: number[] = [];
  // A8: per-stage samples, keyed by StageTiming.stage (plus 'total_turn').
  const stageSamples: Map<string, number[]> = new Map();

  for (let i = 0; i < MESSAGES.length; i++) {
    const start = performance.now();
    const result = await processTurn(TEST_UID, TEST_SESSION_ID, MESSAGES[i]);
    const elapsed = performance.now() - start;
    latencies.push(elapsed);

    const typeStr = result.type === 'agent_turn' ? 'agent_turn' : result.type;
    const fallback = result.type === 'agent_turn' ? result.fallbackUsed : false;
    console.log(`Turn ${i + 1}: ${Math.round(elapsed)}ms | type=${typeStr} | fallback=${fallback}`);

    if (result.type !== 'error') {
      for (const t of result.timing) {
        const arr = stageSamples.get(t.stage) ?? [];
        arr.push(t.elapsedMs);
        stageSamples.set(t.stage, arr);
      }
    }
  }

  latencies.sort((a, b) => a - b);
  if (!stageSamples.has('total_turn')) {
    stageSamples.set('total_turn', [...latencies]);
  }

  console.log('\n--- Latency Results ---');
  console.log(`Total turns: ${latencies.length}`);
  console.log(`p50: ${Math.round(percentile(latencies, 0.5))}ms`);
  console.log(`p95: ${Math.round(percentile(latencies, 0.95))}ms`);
  console.log(`p99: ${Math.round(percentile(latencies, 0.99))}ms`);
  console.log(`Average: ${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms`);
  console.log(`Min: ${Math.round(latencies[0])}ms`);
  console.log(`Max: ${Math.round(latencies[latencies.length - 1])}ms`);
  const e2eBudget = stageBudget('total_turn');
  const e2eP95 = percentile(latencies, 0.95);
  console.log(`Target < ${e2eBudget}ms p95: ${e2eP95 < e2eBudget ? 'PASS' : 'FAIL'}`);

  // ─── A8: per-stage budget report ───
  console.log('\n--- Per-Stage Budgets (A8) ---');
  console.log('stage             n    p50     p95      budget  verdict');
  let allStagesPass = true;
  const stageOrder = [...stageSamples.keys()].sort();
  for (const stage of stageOrder) {
    const samples = [...stageSamples.get(stage)!].sort((a, b) => a - b);
    const p50 = percentile(samples, 0.5);
    const p95 = percentile(samples, 0.95);
    const budget = stageBudget(stage);
    const ok = p95 < budget;
    if (!ok) allStagesPass = false;
    console.log(
      `${stage.padEnd(17)} ${String(samples.length).padStart(3)}  ${String(Math.round(p50)).padStart(5)}  ${String(Math.round(p95)).padStart(7)}  ${String(budget).padStart(7)}  ${ok ? 'PASS' : 'FAIL'}`,
    );
  }
  if (!allStagesPass) {
    console.log(
      '\nBudget breaches: profile the offending stage (model/provider latency, retrieval, timeouts) before large or longitudinal runs — per the A8 note these are retention KPIs, not safety gates.',
    );
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('Latency test failed:', err);
  process.exit(1);
});
