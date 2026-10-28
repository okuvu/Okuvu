/**
 * E17-S6 — token and cost budgets for the request path.
 *
 * Where the budget lives, and why here: the only code path that spends model
 * tokens *on behalf of a user* is the api task — a WebSocket `USER_TURN`
 * (`routes/websocket.ts` → `pipeline/orchestrator.ts` → A1/A2/A9-post →
 * `lib/bedrock.ts`) and `POST /journal/prompt` (J2). The worker's Converse
 * calls are post-session summary/memory jobs triggered by SQS, not a request
 * path: there is no user waiting on them and no session to attribute them to,
 * so a per-session budget there would have nothing to count against. The
 * worker's spend is therefore *not* metered here (recorded as a known gap in
 * evidence/E17-S6.md), and no caller may treat this module as a tenant-wide
 * cap.
 *
 * Two independent budgets, both checked before a turn is admitted:
 *   • per-session  — tokens (input+output) accumulated for one SessionLog id
 *   • per-day      — USD list-price cost accumulated for one user, UTC day
 *
 * Counting persists in Redis when `REDIS_URL` is set (the same ElastiCache
 * instance `lib/rate-limit.ts` and `@fastify/rate-limit` already use), so the
 * numbers hold across horizontally-scaled ECS tasks. Without Redis — unset in
 * local dev, or a Redis error — it degrades to a per-process in-memory counter.
 * That degradation is deliberate and is *not* the fail-open behaviour
 * `lib/rate-limit.ts` chose: rate limiting protects availability, so "unlimited
 * for a while" is the safe failure; a cost budget protects spend, so the safe
 * failure is "still bounded, just bounded per task". A budget assertion is
 * never *refused* because Redis is down (that would let an infrastructure
 * fault take the product down, and a mental-health chat is not the place for
 * that), but it is also never silently unbounded: with N api tasks the
 * effective day ceiling becomes up to N× the configured value, and the
 * monitorable signal is the `budget_counter_store` warning logged when the
 * fallback engages.
 *
 * Cost is measured, not estimated: `TokenUsage` comes from the Converse
 * response's own `usage.inputTokens` / `usage.outputTokens`
 * (`lib/bedrock.ts`), and is priced at the recorded ap-south-1 list price for
 * `qwen.qwen3-32b-v1:0` (E17-S6 evidence §2). Nothing here guesses a token
 * count from string length.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { BudgetNotice } from '@okuvu/shared-types';
import { getRedisClient } from './redis.js';
import type { TokenUsage } from './llm-types.js';
import { hasCrisisLanguage } from '../agents/a1/crisis-keywords.js';

/** ap-south-1 on-demand list price for qwen.qwen3-32b-v1:0, per 1K tokens. */
export const INPUT_PRICE_PER_1K_TOKENS_USD = 0.00018;
export const OUTPUT_PRICE_PER_1K_TOKENS_USD = 0.00071;

/**
 * Defaults are sized from a real measured turn, not a guess: three Converse
 * calls (A1 + A2 + A9-post) billed 11,625 input + 142 output tokens =
 * $0.00219332 in ap-south-1 (evidence/E17-S6.md §5 — a live call through these
 * modules, not a simulation). So 500K tokens is ~42 real turns, comfortably
 * more than a session bounded by the 15-minute idle close, and $0.75/day is
 * ~340 such turns — roughly a full day of continuous conversation. The ceiling
 * is a runaway guard the product should never feel, not a quota.
 */
export const DEFAULT_SESSION_TOKEN_BUDGET = 500_000;
export const DEFAULT_DAILY_COST_BUDGET_USD = 0.75;

export const BUDGET_EXCEEDED_SESSION = 'BUDGET_EXCEEDED_SESSION' as const;
export const BUDGET_EXCEEDED_DAY = 'BUDGET_EXCEEDED_DAY' as const;
export type BudgetCode = typeof BUDGET_EXCEEDED_SESSION | typeof BUDGET_EXCEEDED_DAY;

/**
 * 429 Too Many Requests — the request is well-formed and the caller is
 * authenticated; what is exhausted is a quota. (On the WebSocket turn path
 * there is no HTTP response to carry it, so the same status travels in the
 * structured budget notice attached to the AGENT_TURN frame; the HTTP path,
 * `POST /journal/prompt`, sets it on the reply.)
 */
export const BUDGET_EXCEEDED_STATUS = 429;

/** Session counters outlive the 15-minute idle close by a wide margin, so a reconnect inside the same session keeps counting. */
const SESSION_COUNTER_TTL_SECONDS = 24 * 60 * 60;
/** Day keys are stamped by UTC date, so an expiry is belt-and-braces rather than load-bearing. */
const DAY_COUNTER_GRACE_SECONDS = 60 * 60;
const KEY_PREFIX = 'okuvu:budget:v1';

export interface BudgetConfig {
  sessionTokenBudget: number;
  dailyCostBudgetUsd: number;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function positiveFloat(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Budget values are configurable so ops can tighten them without a deploy of
 * code, but every read has a working default: an absent or malformed env var
 * is the default, never "0" (which would refuse every turn) and never
 * NaN (which would make every comparison false and never refuse one).
 */
export function resolveBudgetConfig(env: NodeJS.ProcessEnv = process.env): BudgetConfig {
  return {
    sessionTokenBudget: positiveInt(env.SESSION_TOKEN_BUDGET, DEFAULT_SESSION_TOKEN_BUDGET),
    dailyCostBudgetUsd: positiveFloat(env.DAILY_COST_BUDGET_USD, DEFAULT_DAILY_COST_BUDGET_USD),
  };
}

/** USD list-price cost of one model call, from the provider's own token counts. */
export function costUsdForUsage(usage: TokenUsage): number {
  const inputTokens = Number.isFinite(usage.inputTokens) ? Math.max(0, usage.inputTokens) : 0;
  const outputTokens = Number.isFinite(usage.outputTokens) ? Math.max(0, usage.outputTokens) : 0;
  return (
    (inputTokens / 1000) * INPUT_PRICE_PER_1K_TOKENS_USD +
    (outputTokens / 1000) * OUTPUT_PRICE_PER_1K_TOKENS_USD
  );
}

/**
 * The day counter is stored in integer micro-USD so repeated float additions
 * cannot drift into "spent 0.9999999 of 1.0". 1 µ$ = 1e-6 USD.
 */
export function costMicroUsdForUsage(usage: TokenUsage): number {
  return Math.round(costUsdForUsage(usage) * 1_000_000);
}

export function microUsdToUsd(microUsd: number): number {
  return microUsd / 1_000_000;
}

/** UTC calendar day, the window a per-day budget resets on. */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function sessionTokenKey(sessionId: string): string {
  return `${KEY_PREFIX}:session:${sessionId}:tokens`;
}

/**
 * Per-session cost, not just tokens: "measured cost per session" is the number
 * the story asks to record, and tokens alone cannot answer it once input and
 * output are priced differently.
 */
export function sessionCostKey(sessionId: string): string {
  return `${KEY_PREFIX}:session:${sessionId}:microusd`;
}

export function dayCostKey(userId: string, now: Date = new Date()): string {
  return `${KEY_PREFIX}:day:${userId}:${utcDayKey(now)}:microusd`;
}

function secondsUntilUtcDayEnd(now: Date): number {
  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(1, Math.ceil((end - now.getTime()) / 1000));
}

export interface BudgetCounters {
  sessionTokens: number;
  sessionCostMicroUsd: number;
  dayCostMicroUsd: number;
}

export type CounterStore = 'redis' | 'memory';

// ─── Counter storage ────────────────────────────────────────────────────────
//
// Two backends behind the same three operations. Everything below this line is
// storage plumbing; the policy (limits, refusals, messages) sits above it.

interface MemoryEntry {
  value: number;
  expiresAt: number;
}

const memoryCounters = new Map<string, MemoryEntry>();
let fallbackLogged = false;

/**
 * Test seam only: drops in-process counters so one test cannot inherit the
 * spend of another. Redis counters are removed by key in the tests that use
 * them (a fake client), never by flushing a real instance.
 */
export function __resetBudgetCounterStore(): void {
  memoryCounters.clear();
  fallbackLogged = false;
}

function logCounterStoreFallback(reason: 'redis_not_configured' | 'redis_error'): void {
  // Once per process: an outage would otherwise log on every turn.
  if (fallbackLogged) return;
  fallbackLogged = true;
  console.warn(
    { event: 'budget_counter_store', store: 'memory', reason },
    'Budget counters are per-process (Redis unavailable) — the day ceiling is bounded per ECS task, not globally',
  );
}

function memoryRead(key: string, now: number): number {
  const entry = memoryCounters.get(key);
  if (!entry) return 0;
  if (entry.expiresAt <= now) {
    memoryCounters.delete(key);
    return 0;
  }
  return entry.value;
}

function memoryAdd(key: string, amount: number, ttlSeconds: number, now: number): void {
  const existing = memoryCounters.get(key);
  const value = (existing && existing.expiresAt > now ? existing.value : 0) + amount;
  memoryCounters.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
}

async function readCountersFromStore(
  keys: { sessionTokenKey: string | null; sessionCostKey: string | null; dayKey: string },
): Promise<{ counters: BudgetCounters; store: CounterStore }> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const keyList = [
        ...(keys.sessionTokenKey ? [keys.sessionTokenKey] : []),
        ...(keys.sessionCostKey ? [keys.sessionCostKey] : []),
        keys.dayKey,
      ];
      const values = await redis.mget(...keyList);
      let index = 0;
      const sessionRaw = keys.sessionTokenKey ? values[index++] : null;
      const sessionCostRaw = keys.sessionCostKey ? values[index++] : null;
      const dayRaw = values[index];
      return {
        counters: {
          sessionTokens: Number(sessionRaw ?? 0) || 0,
          sessionCostMicroUsd: Number(sessionCostRaw ?? 0) || 0,
          dayCostMicroUsd: Number(dayRaw ?? 0) || 0,
        },
        store: 'redis',
      };
    } catch (err) {
      console.error({ err }, 'Budget counter read failed — falling back to the per-process store');
      logCounterStoreFallback('redis_error');
    }
  } else {
    logCounterStoreFallback('redis_not_configured');
  }

  const now = Date.now();
  return {
    counters: {
      sessionTokens: keys.sessionTokenKey ? memoryRead(keys.sessionTokenKey, now) : 0,
      sessionCostMicroUsd: keys.sessionCostKey ? memoryRead(keys.sessionCostKey, now) : 0,
      dayCostMicroUsd: memoryRead(keys.dayKey, now),
    },
    store: 'memory',
  };
}

async function addCountersToStore(
  entries: Array<{ key: string; amount: number; ttlSeconds: number; expireAt?: number }>,
): Promise<CounterStore> {
  const redis = getRedisClient();

  if (redis) {
    try {
      const pipeline = redis.pipeline();
      for (const entry of entries) {
        pipeline.incrby(entry.key, entry.amount);
        if (entry.expireAt !== undefined) {
          pipeline.expireat(entry.key, entry.expireAt);
        } else {
          pipeline.expire(entry.key, entry.ttlSeconds);
        }
      }
      await pipeline.exec();
      return 'redis';
    } catch (err) {
      console.error({ err }, 'Budget counter write failed — falling back to the per-process store');
      logCounterStoreFallback('redis_error');
    }
  } else {
    logCounterStoreFallback('redis_not_configured');
  }

  const now = Date.now();
  for (const entry of entries) {
    memoryAdd(entry.key, entry.amount, entry.ttlSeconds, now);
  }
  return 'memory';
}

/** Tokens/µUSD currently spent by this user (and session, when one is given). */
export async function readBudgetCounters(
  userId: string,
  sessionId: string | null,
  now: Date = new Date(),
): Promise<{ counters: BudgetCounters; store: CounterStore }> {
  return readCountersFromStore({
    sessionTokenKey: sessionId ? sessionTokenKey(sessionId) : null,
    sessionCostKey: sessionId ? sessionCostKey(sessionId) : null,
    dayKey: dayCostKey(userId, now),
  });
}

/**
 * Persists one turn's measured usage. Best-effort by design: accounting must
 * never turn a served turn into a failed one, so callers use `withUsageMetering`
 * (which swallows storage errors after they are logged).
 */
export async function addBudgetUsage(input: {
  userId: string;
  sessionId?: string | null;
  usage: TokenUsage;
  now?: Date;
}): Promise<CounterStore> {
  const now = input.now ?? new Date();
  const totalTokens = Math.max(0, input.usage.inputTokens + input.usage.outputTokens);
  const costMicroUsd = costMicroUsdForUsage(input.usage);

  const entries: Array<{ key: string; amount: number; ttlSeconds: number; expireAt?: number }> = [];
  if (input.sessionId) {
    entries.push({
      key: sessionTokenKey(input.sessionId),
      amount: totalTokens,
      ttlSeconds: SESSION_COUNTER_TTL_SECONDS,
    });
    entries.push({
      key: sessionCostKey(input.sessionId),
      amount: costMicroUsd,
      ttlSeconds: SESSION_COUNTER_TTL_SECONDS,
    });
  }
  if (costMicroUsd > 0 || totalTokens > 0) {
    entries.push({
      key: dayCostKey(input.userId, now),
      amount: costMicroUsd,
      ttlSeconds: secondsUntilUtcDayEnd(now) + DAY_COUNTER_GRACE_SECONDS,
      expireAt: Math.ceil(now.getTime() / 1000) + secondsUntilUtcDayEnd(now) + DAY_COUNTER_GRACE_SECONDS,
    });
  }

  if (entries.length === 0) {
    return getRedisClient() ? 'redis' : 'memory';
  }

  return addCountersToStore(entries);
}

// ─── Budget checks ──────────────────────────────────────────────────────────

export interface BudgetUsed {
  sessionTokens: number;
  /** Measured list-price cost of this session so far (the story's "cost per session"). */
  sessionCostUsd: number;
  dailyCostUsd: number;
}

export interface BudgetLimits {
  sessionTokens: number | null;
  dailyCostUsd: number | null;
}

export interface BudgetAllowance {
  allowed: true;
  used: BudgetUsed;
  limits: BudgetLimits;
  store: CounterStore;
}

export interface BudgetRefusal {
  allowed: false;
  code: BudgetCode;
  statusCode: number;
  /** Machine-facing one-liner; the user-facing copy lives in pipeline/fallbacks.ts. */
  message: string;
  used: BudgetUsed;
  limits: BudgetLimits;
  retryAfterSeconds: number;
  store: CounterStore;
}

export type BudgetDecision = BudgetAllowance | BudgetRefusal;

/** Session refusals are short: a closed/idle session resets the counter's meaning. */
const SESSION_RETRY_AFTER_SECONDS = 15 * 60;

/**
 * Refuses at the boundary, not past it: a counter equal to the limit means the
 * budget is spent, so there is no headroom for another turn. `used < limit`
 * admits; `used >= limit` refuses.
 */
export async function checkBudget(input: {
  userId: string;
  sessionId?: string | null;
  config?: BudgetConfig;
  now?: Date;
}): Promise<BudgetDecision> {
  const config = input.config ?? resolveBudgetConfig();
  const now = input.now ?? new Date();
  const sessionId = input.sessionId ?? null;

  const { counters, store } = await readBudgetCounters(input.userId, sessionId, now);
  const used: BudgetUsed = {
    sessionTokens: counters.sessionTokens,
    sessionCostUsd: microUsdToUsd(counters.sessionCostMicroUsd),
    dailyCostUsd: microUsdToUsd(counters.dayCostMicroUsd),
  };
  const limits: BudgetLimits = {
    sessionTokens: sessionId ? config.sessionTokenBudget : null,
    dailyCostUsd: config.dailyCostBudgetUsd,
  };

  if (sessionId && counters.sessionTokens >= config.sessionTokenBudget) {
    return {
      allowed: false,
      code: BUDGET_EXCEEDED_SESSION,
      statusCode: BUDGET_EXCEEDED_STATUS,
      message: `Session token budget exhausted (${counters.sessionTokens}/${config.sessionTokenBudget} tokens).`,
      used,
      limits,
      retryAfterSeconds: SESSION_RETRY_AFTER_SECONDS,
      store,
    };
  }

  // Compared in integer micro-USD for the same reason it is stored that way.
  if (counters.dayCostMicroUsd >= Math.round(config.dailyCostBudgetUsd * 1_000_000)) {
    return {
      allowed: false,
      code: BUDGET_EXCEEDED_DAY,
      statusCode: BUDGET_EXCEEDED_STATUS,
      message: `Daily cost budget exhausted ($${used.dailyCostUsd.toFixed(6)}/$${config.dailyCostBudgetUsd.toFixed(2)}).`,
      used,
      limits,
      retryAfterSeconds: secondsUntilUtcDayEnd(now),
      store,
    };
  }

  return { allowed: true, used, limits, store };
}

// ─── Turn admission (budget + the one thing that outranks it) ───────────────

export type TurnAdmission =
  | { action: 'proceed'; budget: BudgetAllowance }
  /**
   * Over budget, but the message carries explicit crisis language. The turn
   * runs anyway. This is the only bypass, it is free (a regex, no model call),
   * and it exists because refusing a disclosure of intent to die in order to
   * protect a cost ceiling inverts the product's entire priority order. The
   * cost of the bypass is one turn's spend, now visible in the usage log as
   * `budget_bypass: 'crisis_language'`; the cost of not having it is a message
   * that never reaches the safety path.
   */
  | { action: 'crisis_bypass'; budget: BudgetRefusal; reason: 'crisis_language' }
  | { action: 'refuse'; budget: BudgetRefusal };

/**
 * The single decision point the request path uses. Everything it needs is in
 * the counters and the message; the caller only renders the outcome.
 */
export async function admitTurn(input: {
  userId: string;
  sessionId: string;
  message: string;
  config?: BudgetConfig;
  now?: Date;
}): Promise<TurnAdmission> {
  const budget = await checkBudget({
    userId: input.userId,
    sessionId: input.sessionId,
    config: input.config,
    now: input.now,
  });

  if (budget.allowed) return { action: 'proceed', budget };

  if (hasCrisisLanguage(input.message)) {
    return { action: 'crisis_bypass', budget, reason: 'crisis_language' };
  }

  return { action: 'refuse', budget };
}

/** Builds the client-facing notice for a refusal; the copy is the governed constant, not `budget.message`. */
export function toBudgetNotice(refusal: BudgetRefusal, message: string): BudgetNotice {
  return {
    code: refusal.code,
    status: BUDGET_EXCEEDED_STATUS as BudgetNotice['status'],
    message,
    used: {
      session_tokens: refusal.used.sessionTokens,
      daily_cost_usd: Number(refusal.used.dailyCostUsd.toFixed(6)),
    },
    limits: {
      session_tokens: refusal.limits.sessionTokens,
      daily_cost_usd: refusal.limits.dailyCostUsd,
    },
    retry_after_seconds: refusal.retryAfterSeconds,
  };
}

// ─── Per-turn usage metering ────────────────────────────────────────────────
//
// A turn fans out into up to four Converse calls (A1, A2, A9-post, plus A9-pre)
// and each reports its own usage. Threading a `usage` field through every
// agent's return type would mean touching four contracts and every test that
// asserts their shape; instead the provider records what it was billed for into
// an async-local context opened around the turn. The provider is the only place
// that sees `usage`, so this is also the only way no call can go unmetered by
// construction — a call made outside a metered context is logged as such rather
// than silently accounted to nobody.

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calls: number;
  costUsd: number;
}

interface MeterState {
  userId: string;
  sessionId: string | null;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

const meterStorage = new AsyncLocalStorage<MeterState>();
let unattributedLogged = false;

function emptyTurnUsage(): TurnUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0, costUsd: 0 };
}

function summarise(state: MeterState | undefined): TurnUsage {
  if (!state) return emptyTurnUsage();
  const usage: TokenUsage = { inputTokens: state.inputTokens, outputTokens: state.outputTokens };
  return {
    inputTokens: state.inputTokens,
    outputTokens: state.outputTokens,
    totalTokens: state.inputTokens + state.outputTokens,
    calls: state.calls,
    costUsd: costUsdForUsage(usage),
  };
}

/**
 * Called by the provider immediately after a successful call, with the token
 * counts the service reported. No usage object (a failed call, a canned reply)
 * means nothing was billed, so nothing is added.
 */
export function recordModelUsage(usage: TokenUsage | undefined): void {
  if (!usage) return;
  const state = meterStorage.getStore();
  if (!state) {
    if (!unattributedLogged) {
      unattributedLogged = true;
      console.warn(
        { event: 'budget_usage_unattributed' },
        'Model usage recorded outside a metered turn — this call is not counted against any budget',
      );
    }
    return;
  }
  const input = Number.isFinite(usage.inputTokens) ? Math.max(0, usage.inputTokens) : 0;
  const output = Number.isFinite(usage.outputTokens) ? Math.max(0, usage.outputTokens) : 0;
  state.inputTokens += input;
  state.outputTokens += output;
  state.calls += 1;
}

/** Usage accumulated by the turn currently on this async context (zeros outside one). */
export function currentTurnUsage(): TurnUsage {
  return summarise(meterStorage.getStore());
}

/**
 * Runs `fn` with usage metering attached to its async context and persists the
 * measured total afterwards. Returns the function's own result untouched plus
 * the measured usage, so the caller can log/attach it.
 *
 * Usage is persisted even when `fn` throws: a turn that blew up after two
 * model calls still spent money, and the counter is the only record of it. The
 * original error is rethrown unchanged, so this cannot mask a failure.
 */
export async function withUsageMetering<T>(
  context: { userId: string; sessionId?: string | null },
  fn: () => Promise<T>,
  now: Date = new Date(),
): Promise<{ result: T; usage: TurnUsage }> {
  const state: MeterState = {
    userId: context.userId,
    sessionId: context.sessionId ?? null,
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
  };

  let result!: T;
  let thrown: unknown;
  let threw = false;

  try {
    result = await meterStorage.run(state, fn);
  } catch (err) {
    thrown = err;
    threw = true;
  }

  const usage = summarise(state);

  if (usage.calls > 0) {
    try {
      await addBudgetUsage({
        userId: context.userId,
        sessionId: context.sessionId ?? null,
        usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
        now,
      });
    } catch (err) {
      // Accounting is not allowed to fail a turn that already succeeded; the
      // under-count is bounded (one turn) and surfaced in the log.
      console.error({ err, event: 'budget_usage_persist_failed' }, 'Measured usage was not persisted');
    }
  }

  if (threw) throw thrown;

  return { result, usage };
}
