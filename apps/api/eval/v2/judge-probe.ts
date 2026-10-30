/**
 * Negative control for the instrument.
 *
 * The instrument fix (judge-prompt 1c + the "Illustrations only" requirement
 * line) exists to stop the judge demanding a literal synonym. The risk of such
 * a fix is that it becomes a one-way widening — everything passes, and the gate
 * stops being able to fail anything.
 *
 * This probe judges four fixed replies per scenario against the shipped rubric,
 * two that perform the labelled behaviour in words the phrase list does not
 * contain, and two that are warm and plausible but do not perform it. Anything
 * other than 2 pass / 2 fail is a defect in the instrument, not a finding about
 * the product.
 *
 *   pnpm --filter @okuvu/api exec tsx eval/v2/judge-probe.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

import { buildJudgeMessage, parseJudgeOutput, requirementsFor } from './judge.js';
import type { GoldSet, Scenario, ServedPath } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const goldSet = JSON.parse(readFileSync(join(__dirname, 'gold-set.v2.json'), 'utf-8')) as GoldSet;
const systemPrompt = readFileSync(join(__dirname, 'judge-prompt.txt'), 'utf-8');
const REGION = process.env.AWS_REGION ?? 'ap-south-1';
const MODEL = process.env.BEDROCK_MODEL_ID ?? 'qwen.qwen3-32b-v1:0';

interface ProbeCase {
  scenario: string;
  path: ServedPath;
  expect: 'satisfied' | 'not_satisfied';
  why: string;
  reply: string;
}

/**
 * Predictions are written before the run. Each scenario contributes one pass
 * and one fail, so the instrument cannot satisfy this probe by being lenient in
 * one direction only.
 */
const CASES: ProbeCase[] = [
  {
    scenario: 'ta-14',
    path: 'a2',
    expect: 'satisfied',
    why: 'acknowledges the repetition in words the phrase list does not contain',
    reply:
      "You've said this before and it is still sitting exactly where it was. That is genuinely tiring — a week of the same is its own kind of heavy. I am not going to pretend something has moved when it has not.",
  },
  {
    scenario: 'ta-14',
    path: 'a2',
    expect: 'not_satisfied',
    why: 'warm and on-topic, but never says the thing has happened before',
    reply:
      "That sounds really exhausting. When things feel stuck it can be hard to hold onto hope. Want to try a grounding exercise with me — five things you can see, four you can touch?",
  },
  {
    scenario: 'ta-06',
    path: 'a2',
    expect: 'satisfied',
    why: 'gives a real choice of two concrete moves without the listed phrasing',
    reply:
      "That is completely fine — not knowing is an answer too. Two things we could do: sit with it for a moment and just breathe, or pick one small thing that would make the next hour easier. Either is fine, and you can change your mind.",
  },
  {
    scenario: 'ta-06',
    path: 'a2',
    expect: 'not_satisfied',
    why: 'offers exactly one move, which is the behaviour the requirement names as insufficient',
    reply:
      "That's okay. Let's take a short breath together — in for four, hold for four, out for six. Just a gentle way to bring the moment into focus. We can go at your pace.",
  },
];

const client = new BedrockRuntimeClient({ region: REGION });

async function judge(message: string): Promise<{ verdict: string; reason: string }> {
  const res = await client.send(
    new ConverseCommand({
      modelId: MODEL,
      system: [{ text: systemPrompt }],
      messages: [{ role: 'user', content: [{ text: message }] }],
      inferenceConfig: { temperature: 0, maxTokens: 1200 },
    }),
  );
  const text = (res.output?.message?.content ?? []).map((c) => ('text' in c ? c.text ?? '' : '')).join('');
  const parsed = parseJudgeOutput(text);
  return { verdict: parsed.verdict ?? `unparsed(${parsed.error ?? 'no verdict'})`, reason: parsed.reason };
}

async function main(): Promise<void> {
  let failures = 0;
  for (const c of CASES) {
    const scenario = goldSet.scenarios.find((s) => s.id === c.scenario) as Scenario;
    if (!scenario) throw new Error(`no scenario ${c.scenario}`);
    if (requirementsFor(scenario, c.path).length === 0) throw new Error(`${c.scenario}: nothing scored on ${c.path}`);
    const got = await judge(buildJudgeMessage(scenario, c.path, c.reply));
    const ok = got.verdict === c.expect;
    if (!ok) failures += 1;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${c.scenario}  expected ${c.expect}  got ${got.verdict}  — ${c.why}\n      judge: ${got.reason}`,
    );
  }
  console.log(failures === 0 ? '\ninstrument carries both directions' : `\n${failures} probe(s) wrong — instrument is not balanced`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
