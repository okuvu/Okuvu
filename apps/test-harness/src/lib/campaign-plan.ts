/**
 * TH-S38 — campaign planning arithmetic and start-time blockers.
 *
 * Split out from the runner so the /campaign screen can show a dry-run number
 * and its blockers WITHOUT touching the database or making a model call: the
 * estimate is computed from the plan alone, and the preview is the same code
 * path the start button re-checks. Nothing here spends money.
 *
 * Cost honesty (rev 2): the previous version of this file multiplied planned
 * turns by a flat $0.01/turn inherited from the run-batch trigger, which was
 * itself an order-of-magnitude placeholder. That over-estimated a real
 * campaign by ~3.5x, because it ignored the actual per-token prices of the
 * models the pipeline runs on. The numbers below are token arithmetic against
 * quoted rates, and every input token count is documented with its source so
 * it can be re-derived rather than trusted:
 *
 *   RATES — apps/api/src/lib/token-budget.ts, the module the live API bills
 *   against: $0.00018 / 1K input, $0.00071 / 1K output
 *   (= $0.18 / $0.71 per 1M). That is qwen.qwen3-32b-v1:0 on Bedrock
 *   ap-south-1, the model of record, and it is also what apps/test-harness/src/
 *   lib/pricing.ts records for the same model.
 *
 *   PIPELINE INPUT PER TURN — four Converse calls on the live path, each
 *   re-sending its whole system prompt, measured by character count against a
 *   ratio calibrated on a live Bedrock usage record (evidence/E17-S6.md §5a:
 *   43,806 chars of prompt billed 11,625 input tokens = 3.768 chars/token on
 *   this exact mix of English prose, markdown tables and box-drawing):
 *
 *     A1 safety gate      11,763 chars   3,122 tokens
 *     A9-pre governance   12,064 chars   3,201 tokens
 *     A2 companion        49,402 chars  13,110 tokens   (a2-okuvu-v2.4.txt)
 *     A9-post reviewer     9,708 chars   2,576 tokens
 *     subtotal                          22,009 tokens
 *     + mid-session history (A2 receives every prior turn of the session;
 *       ~150 tokens per completed turn, averaged over a 20-turn session)  1,400
 *     total per turn                    23,400 tokens
 *
 *   The previous revision of this constant said 14,900 with the comment
 *   "A2 prompt (~13.5k) + A1 / A9 / history". That counted the A2 prompt and
 *   then treated A1, A9-pre and A9-post as ~1,400 tokens between them; they
 *   are 8,899. A9-pre runs on every turn (orchestrator.ts Promise.allSettled)
 *   and A9-post runs after every real A2 reply, so the estimate was ~36% low
 *   and every campaign ceiling was set against a number that could not hold.
 *
 *   PIPELINE OUTPUT PER TURN — 290 tokens: ~91 for the visible reply (measured
 *   mean 342 chars over 198 real qwen replies in evidence/wave14-runs/run-1.json,
 *   ÷ 3.768) plus the S-07 JSON block (~14 fields, ~90) plus the short JSON
 *   from A1, A9-pre and A9-post (~100 combined).
 *
 *   SIMULATOR — apps/test-harness/src/lib/user-simulator.ts defaults to
 *   google/gemini-2.0-flash-001 at ~$0.10 / $0.40 per 1M. The persona sheet
 *   plus transcript is ~1,600 input tokens per turn, ~90 out.
 *
 *   JUDGE — judge.ts calls generateContent with no model override, so it runs
 *   on the same qwen rate, and it grades ONE reply (~600 in / ~120 out), not a
 *   whole transcript. That is why the old flat $0.01/judge-call allowance was
 *   ~50x too high.
 *
 * Calibration is still an estimate — the input counts are measured character
 * counts, the output counts are a mean plus a schema-derived allowance — but
 * the token basis is now derived from the prompts that actually ship, and a
 * test pins the per-turn figure so it cannot silently drift from them.
 */

import { turnsForSession } from './conversation-runner';

/** USD per 1M tokens. qwen rates match apps/api/src/lib/token-budget.ts. */
export const USD_PER_MILLION = {
  pipelineInput: 0.18,
  pipelineOutput: 0.71,
  simulatorInput: 0.1,
  simulatorOutput: 0.4,
  judgeInput: 0.18,
  judgeOutput: 0.71,
} as const;

/**
 * Token counts per turn. Exported so a test can pin them and an operator can
 * see exactly what the estimate assumes without reading the prose above.
 */
export const TOKENS = {
  /**
   * Four Converse calls on the live path (A1 + A9-pre + A2 + A9-post) plus
   * mid-session history: 22,009 measured + 1,400. Derivation and per-call
   * counts are in this file's header comment; the pipeline-side counts come
   * from `buildSafetyPrompt`, `buildGovernancePrompt`, `buildConversationalPrompt`
   * and `buildA9PostPrompt` as they ship, priced against a live usage record.
   */
  pipelineInputPerTurn: 23_400,
  /** Visible reply (mean 342 chars) + S-07 JSON + the three classifier JSONs. */
  pipelineOutputPerTurn: 290,
  simulatorInputPerTurn: 1_600,
  simulatorOutputPerTurn: 90,
  /** One judge call grades one reply. */
  judgeInputPerCall: 600,
  judgeOutputPerCall: 120,
} as const;

/** USD cost of `tokens` at `usdPerMillion`, kept explicit so no caller divides by 1e6 by hand. */
function usdForTokens(tokens: number, usdPerMillion: number): number {
  return (tokens / 1_000_000) * usdPerMillion;
}

/** USD for one pipeline turn (A1 → A9 → A2), excluding the simulated user. */
export const PIPELINE_TURN_USD =
  usdForTokens(TOKENS.pipelineInputPerTurn, USD_PER_MILLION.pipelineInput) +
  usdForTokens(TOKENS.pipelineOutputPerTurn, USD_PER_MILLION.pipelineOutput);

/** USD for one simulated-user turn. */
export const SIMULATOR_TURN_USD =
  usdForTokens(TOKENS.simulatorInputPerTurn, USD_PER_MILLION.simulatorInput) +
  usdForTokens(TOKENS.simulatorOutputPerTurn, USD_PER_MILLION.simulatorOutput);

/** USD for one judge call. */
export const JUDGE_CALL_USD =
  usdForTokens(TOKENS.judgeInputPerCall, USD_PER_MILLION.judgeInput) +
  usdForTokens(TOKENS.judgeOutputPerCall, USD_PER_MILLION.judgeOutput);

export interface CampaignPlanInput {
  personaCount: number;
  sessions: number;
  turnsMin: number;
  turnsMax: number;
  seed: number;
  judgeEnabled: boolean;
  costCeilingUsd: number;
}

export interface CampaignEstimate {
  personaCount: number;
  sessions: number;
  plannedTurns: number;
  /** plannedTurns × PIPELINE_TURN_USD — the A1→A9→A2 in-process spend. */
  pipelineUsd: number;
  /** plannedTurns × SIMULATOR_TURN_USD — the simulated client. */
  simulatorUsd: number;
  /** One judge call per conversation, when the judge is on. */
  judgeUsd: number;
  totalUsd: number;
  costCeilingUsd: number;
  /** True when the estimate exceeds the ceiling the operator set. */
  overCeiling: boolean;
}

export function estimateCampaign(input: CampaignPlanInput): CampaignEstimate {
  const perPersonaTurns = Array.from({ length: input.sessions }, (_, index) =>
    turnsForSession(input.seed, index + 1, input.turnsMin, input.turnsMax),
  ).reduce((total, turns) => total + turns, 0);

  const plannedTurns = perPersonaTurns * input.personaCount;
  const pipelineUsd = plannedTurns * PIPELINE_TURN_USD;
  const simulatorUsd = plannedTurns * SIMULATOR_TURN_USD;
  const judgeUsd = input.judgeEnabled ? input.personaCount * input.sessions * JUDGE_CALL_USD : 0;
  // Sub-cent campaigns round to $0.00 and a ceiling comparison against $0.00
  // is meaningless, so keep 4 decimal places rather than rounding to cents.
  const totalUsd = Number((pipelineUsd + simulatorUsd + judgeUsd).toFixed(4));

  return {
    personaCount: input.personaCount,
    sessions: input.sessions,
    plannedTurns,
    pipelineUsd: Number(pipelineUsd.toFixed(4)),
    simulatorUsd: Number(simulatorUsd.toFixed(4)),
    judgeUsd: Number(judgeUsd.toFixed(4)),
    totalUsd,
    costCeilingUsd: input.costCeilingUsd,
    overCeiling: totalUsd > input.costCeilingUsd,
  };
}

/**
 * Story-time gap plans, in ms. Story-time is the default: the planned gap is
 * injected as `gap_before_ms` telemetry, so "three days later" costs nothing
 * and no scheduler is needed. Wall-clock is staging-only and this runner does
 * not schedule it — the dropdown is explicit about that.
 */
export function gapPlanFor(sessions: number, preset: 'immediate' | 'day3-day7' | 'weekly'): number[] {
  const DAY = 24 * 3_600_000;
  const patterns: Record<typeof preset, number[]> = {
    immediate: [0],
    'day3-day7': [0, 3 * DAY, 7 * DAY],
    weekly: [0, 7 * DAY, 14 * DAY, 21 * DAY],
  };
  return Array.from({ length: sessions }, (_, index) => patterns[preset][index] ?? patterns[preset][patterns[preset].length - 1]);
}

export type BlockerSeverity = 'block' | 'warn';

export interface CampaignBlocker {
  code: string;
  severity: BlockerSeverity;
  message: string;
}

export interface CampaignBlockerInput {
  environment: 'sandbox' | 'staging' | 'beta';
  target: string;
  personaCount: number;
  /** How many selected personas have no expectedBehavior. */
  rubricMissing: number;
  estimate: CampaignEstimate;
  workerConfigured: boolean;
  /** USE_CANNED_LLM_RESPONSE set in-process. */
  cannedAmbient: boolean;
  /** Message thrown by resolveSimulatorModel(), when it refuses (self-play guard). */
  simulatorModelError: string | null;
  /**
   * True when the simulator would play the client from canned templates. On a
   * staging run this is a block: 20 turns of one repeated line looks like
   * evidence and is not a conversation.
   */
  simulatorCanned?: boolean;
}

/**
 * Everything that would make a campaign fail for a reason the operator did not
 * choose. `block` prevents Start; `warn` allows it while stating what the
 * result will not prove.
 */
export function campaignBlockers(input: CampaignBlockerInput): CampaignBlocker[] {
  const blockers: CampaignBlocker[] = [];

  if (input.personaCount === 0) {
    blockers.push({
      code: 'no_personas',
      severity: 'block',
      message: 'Select at least one persona — a campaign with no clients measures nothing.',
    });
  }

  if (input.target !== 'in-process') {
    blockers.push({
      code: 'live_target_not_built',
      severity: 'block',
      message:
        'The live WebSocket driver (api.okuvu.in with real test accounts) is not built yet. Only the in-process pipeline target can run today.',
    });
  }

  if (input.environment === 'beta') {
    blockers.push({
      code: 'runner_rails',
      severity: 'block',
      message: 'The conversation runner is staging-only (sandbox allowed for dry-runs). Beta and production are refused by its own rails.',
    });
  }

  if (input.cannedAmbient && input.environment !== 'sandbox') {
    blockers.push({
      code: 'canned_leak',
      severity: 'block',
      message: 'USE_CANNED_LLM_RESPONSE is set in this process — a canned run must never be presented as a real-model result outside sandbox.',
    });
  }

  if (!input.workerConfigured) {
    blockers.push({
      code: 'worker_unconfigured',
      severity: 'block',
      message:
        'WORKER_URL is not configured, so the A13/A15 summary/memory stage cannot run. The runner refuses to burn turns in that state — every session would close INCOMPLETE.',
    });
  }

  if (input.simulatorModelError) {
    blockers.push({
      code: 'simulator_self_play',
      severity: 'block',
      message: input.simulatorModelError,
    });
  }

  if (input.simulatorCanned && input.environment !== 'sandbox') {
    blockers.push({
      code: 'simulator_canned',
      severity: 'block',
      message:
        'The simulated client would be a canned template (no simulator model available: set LLM_PROVIDER=bedrock or OPENROUTER_API_KEY). A transcript of one repeated line looks like evidence but measures nothing, so this run is refused outside sandbox.',
    });
  }

  if (input.estimate.overCeiling) {
    blockers.push({
      code: 'over_ceiling',
      severity: 'block',
      message: `The estimate ($${input.estimate.totalUsd.toFixed(2)}) is above the ceiling ($${input.estimate.costCeilingUsd.toFixed(2)}). The ceiling is a hard stop — raise it or shorten the plan.`,
    });
  }

  if (input.rubricMissing > 0) {
    blockers.push({
      code: 'missing_rubric',
      severity: 'warn',
      message: `${input.rubricMissing} selected persona${input.rubricMissing === 1 ? ' has' : 's have'} no expectedBehavior — those conversations will be UNGRADED, never PASS.`,
    });
  }

  return blockers;
}

/** True when a campaign may start: no `block` severity present. */
export function canStart(blockers: CampaignBlocker[]): boolean {
  return !blockers.some((blocker) => blocker.severity === 'block');
}
