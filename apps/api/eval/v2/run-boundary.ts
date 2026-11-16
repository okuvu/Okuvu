/**
 * E17-S5 boundary probe — false-positive escalation of the A1 safety gate.
 *
 * Runs the *shipped* `classifySafety()` against a list of ordinary clinical or
 * situational messages whose correct band is S0-S2 (or S2-S3 for third-party
 * risk and intrusive thoughts). Any S3/S4 on those is an over-escalation: the
 * client's "I don't enjoy anything anymore" is answered with a helpline card
 * instead of a reply.
 *
 * No prompt of its own, no retries, one process per arm so the model id cannot
 * leak between arms. The model is whatever BEDROCK_MODEL_ID says, which is the
 * same variable the api task definition uses in production.
 *
 *   BEDROCK_MODEL_ID=zai.glm-4.7-flash LLM_PROVIDER=bedrock AWS_REGION=ap-south-1 \
 *     ./node_modules/.bin/tsx eval/v2/run-boundary.ts \
 *       --set /opt/data/okuvu/model-eval/boundary-set.json \
 *       --out /opt/data/okuvu/model-eval/boundary-glm.jsonl --reps 3
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { classifySafety } from '../../src/agents/a1/agent.js';
import { hasCrisisLanguage } from '../../src/agents/a1/crisis-keywords.js';
import { resolveBedrockModelId } from '../../src/lib/provider-config.js';

interface Item {
  id: string;
  message: string;
  lang: string;
  band: { min: string; max: string };
  why: string;
}

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

const setPath = arg('set');
const outPath = arg('out');
const reps = Number(arg('reps', '3'));
const label = arg('label', process.env.BEDROCK_MODEL_ID ?? 'default');

const set = JSON.parse(readFileSync(setPath, 'utf-8')) as { items: Item[] };
const model = resolveBedrockModelId();
const started = new Date().toISOString();

writeFileSync(
  outPath,
  JSON.stringify({
    meta: {
      label,
      model,
      provider: process.env.LLM_PROVIDER ?? null,
      region: process.env.AWS_REGION ?? null,
      set: setPath,
      set_sha256: createHash('sha256').update(readFileSync(setPath)).digest('hex'),
      reps,
      started,
    },
  }) + '\n',
);

let n = 0;
for (const item of set.items) {
  const floorFires = hasCrisisLanguage(item.message);
  for (let rep = 1; rep <= reps; rep++) {
    const t0 = Date.now();
    let out;
    let error: string | null = null;
    try {
      out = await classifySafety({ message: item.message, recentHistory: [] });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      out = null;
    }
    const row = {
      id: item.id,
      lang: item.lang,
      band: item.band,
      rep,
      safetyState: out?.safetyState ?? null,
      crisis_language_detected: out?.crisis_language_detected ?? null,
      basis: out?.basis ?? null,
      signal_strength: out?.signal_strength ?? null,
      notes: out?.notes ?? null,
      fallbackUsed: out?.fallbackUsed ?? null,
      keyword_floor_fires: floorFires,
      latency_ms: Date.now() - t0,
      error,
    };
    appendFileSync(outPath, JSON.stringify(row) + '\n');
    n++;
  }
  process.stdout.write(`  ${item.id} ${item.band.min}-${item.band.max} done (${n} calls)\n`);
}

console.log(`\n${label}: ${n} calls, model=${model}, out=${outPath}`);
