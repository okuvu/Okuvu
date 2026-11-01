import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * E17-S6 — budget counters, refusals and measured-cost accounting.
 *
 * The counters live behind `getRedisClient()`, so Redis is the only thing faked
 * here: the module under test (`token-budget.ts`) is real in every case, which
 * is what makes the "refused at the boundary" and "still enforced without
 * Redis" assertions mean anything.
 */

vi.mock('../lib/redis.js', () => ({
  getRedisClient: vi.fn(),
}));

import { getRedisClient } from '../lib/redis.js';
import {
  BUDGET_EXCEEDED_DAY,
  BUDGET_EXCEEDED_SESSION,
  BUDGET_EXCEEDED_STATUS,
  DEFAULT_DAILY_COST_BUDGET_USD,
  DEFAULT_SESSION_TOKEN_BUDGET,
  INPUT_PRICE_PER_1K_TOKENS_USD,
  OUTPUT_PRICE_PER_1K_TOKENS_USD,
  __resetBudgetCounterStore,
  addBudgetUsage,
  admitTurn,
  checkBudget,
  costMicroUsdForUsage,
  costUsdForUsage,
  currentTurnUsage,
  dayCostKey,
  microUsdToUsd,
  readBudgetCounters,
  recordModelUsage,
  resolveBudgetConfig,
  sessionCostKey,
  sessionTokenKey,
  withUsageMetering,
} from '../lib/token-budget.js';

const USER = 'user-1';
const SESSION = 'session-1';

/** Minimal in-memory ioredis stand-in: mget + a pipeline of incrby/expire/expireat. */
function fakeRedis() {
  const values = new Map<string, number>();
  const expiries = new Map<string, number>();

  const pipeline = {
    incrby: vi.fn((key: string, by: number) => {
      values.set(key, (values.get(key) ?? 0) + by);
      return pipeline;
    }),
    expire: vi.fn((key: string, seconds: number) => {
      expiries.set(key, seconds);
      return pipeline;
    }),
    expireat: vi.fn((key: string, at: number) => {
      expiries.set(key, at);
      return pipeline;
    }),
    exec: vi.fn(async () => []),
  };

  const client = {
    mget: vi.fn(async (...keys: string[]) =>
      keys.map((key) => (values.has(key) ? String(values.get(key)) : null)),
    ),
    pipeline: vi.fn(() => pipeline),
  };

  return { client, values, expiries, pipeline };
}

beforeEach(() => {
  __resetBudgetCounterStore();
  vi.clearAllMocks();
  vi.mocked(getRedisClient).mockReturnValue(null);
});

afterEach(() => {
  __resetBudgetCounterStore();
});

describe('E17-S6 pricing — recorded ap-south-1 list price for qwen.qwen3-32b-v1:0', () => {
  it('pins the exact list prices the story was given', () => {
    expect(INPUT_PRICE_PER_1K_TOKENS_USD).toBe(0.00018);
    expect(OUTPUT_PRICE_PER_1K_TOKENS_USD).toBe(0.00071);
  });

  it('prices input and output tokens separately', () => {
    // 2000 input × 0.00018/1K = 0.00036; 500 output × 0.00071/1K = 0.000355.
    expect(costUsdForUsage({ inputTokens: 2000, outputTokens: 500 })).toBeCloseTo(0.000715, 12);
    // The two rates are not interchangeable: pricing output at the input rate
    // would report 0.00054 instead — this assertion is what catches that.
    expect(costUsdForUsage({ inputTokens: 0, outputTokens: 1 })).toBeGreaterThan(
      costUsdForUsage({ inputTokens: 1, outputTokens: 0 }),
    );
  });

  it('stores cost as integer micro-USD so repeated additions cannot drift', () => {
    expect(costMicroUsdForUsage({ inputTokens: 1000, outputTokens: 1000 })).toBe(890);
    expect(microUsdToUsd(890)).toBe(0.00089);
  });

  it('reports zero for a call with no usage rather than inventing a number', () => {
    expect(costUsdForUsage({ inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

describe('E17-S6 budget config', () => {
  it('falls back to the documented defaults when the env vars are absent', () => {
    const config = resolveBudgetConfig({} as NodeJS.ProcessEnv);
    expect(config.sessionTokenBudget).toBe(DEFAULT_SESSION_TOKEN_BUDGET);
    expect(config.dailyCostBudgetUsd).toBe(DEFAULT_DAILY_COST_BUDGET_USD);
  });

  it('reads overrides, so ops can tighten a budget without a code deploy', () => {
    const config = resolveBudgetConfig({
      SESSION_TOKEN_BUDGET: '1000',
      DAILY_COST_BUDGET_USD: '0.25',
    } as NodeJS.ProcessEnv);
    expect(config).toEqual({ sessionTokenBudget: 1000, dailyCostBudgetUsd: 0.25 });
  });

  it.each(['0', '-5', 'abc', '', '  '])(
    'treats an unusable value (%j) as absent — never as a zero budget that would refuse every turn',
    (raw) => {
      const config = resolveBudgetConfig({
        SESSION_TOKEN_BUDGET: raw,
        DAILY_COST_BUDGET_USD: raw,
      } as NodeJS.ProcessEnv);
      expect(config.sessionTokenBudget).toBe(DEFAULT_SESSION_TOKEN_BUDGET);
      expect(config.dailyCostBudgetUsd).toBe(DEFAULT_DAILY_COST_BUDGET_USD);
    },
  );
});

describe('E17-S6 per-session token budget (Redis-backed)', () => {
  it('admits a turn under budget', async () => {
    const redis = fakeRedis();
    vi.mocked(getRedisClient).mockReturnValue(redis.client as never);
    redis.values.set(sessionTokenKey(SESSION), 1_000);

    const decision = await checkBudget({
      userId: USER,
      sessionId: SESSION,
      config: { sessionTokenBudget: 5_000, dailyCostBudgetUsd: 10 },
    });

    expect(decision.allowed).toBe(true);
    expect(decision.used.sessionTokens).toBe(1_000);
    expect(decision.store).toBe('redis');
  });

  it('admits the turn one token under the boundary', async () => {
    const redis = fakeRedis();
    vi.mocked(getRedisClient).mockReturnValue(redis.client as never);
    redis.values.set(sessionTokenKey(SESSION), 4_999);

    const decision = await checkBudget({
      userId: USER,
      sessionId: SESSION,
      config: { sessionTokenBudget: 5_000, dailyCostBudgetUsd: 10 },
    });

    expect(decision.allowed).toBe(true);
  });

  it('refuses at the boundary itself — a fully-spent budget has no headroom', async () => {
    const redis = fakeRedis();
    vi.mocked(getRedisClient).mockReturnValue(redis.client as never);
    redis.values.set(sessionTokenKey(SESSION), 5_000);

    const decision = await checkBudget({
      userId: USER,
      sessionId: SESSION,
      config: { sessionTokenBudget: 5_000, dailyCostBudgetUsd: 10 },
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.code).toBe(BUDGET_EXCEEDED_SESSION);
    expect(decision.statusCode).toBe(BUDGET_EXCEEDED_STATUS);
    expect(decision.statusCode).toBe(429);
    expect(decision.used.sessionTokens).toBe(5_000);
    expect(decision.limits.sessionTokens).toBe(5_000);
  });

  it('refuses well past the boundary, and the refusal carries no error-throwing side effect', async () => {
    const redis = fakeRedis();
    vi.mocked(getRedisClient).mockReturnValue(redis.client as never);
    redis.values.set(sessionTokenKey(SESSION), 12_345);

    const decision = await checkBudget({
      userId: USER,
      sessionId: SESSION,
      config: { sessionTokenBudget: 5_000, dailyCostBudgetUsd: 10 },
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.code).toBe(BUDGET_EXCEEDED_SESSION);
    expect(decision.message).toContain('12345/5000');
  });

  it('persists measured usage to the session and day counters with an expiry', async () => {
    const redis = fakeRedis();
    vi.mocked(getRedisClient).mockReturnValue(redis.client as never);

    await addBudgetUsage({
      userId: USER,
      sessionId: SESSION,
      usage: { inputTokens: 1_000, outputTokens: 1_000 },
    });

    // 2000 tokens on the session counter; 890 µ$ (0.00089 USD) on session + day.
    expect(redis.values.get(sessionTokenKey(SESSION))).toBe(2_000);
    expect(redis.values.get(sessionCostKey(SESSION))).toBe(890);
    expect(redis.values.get(dayCostKey(USER))).toBe(890);
    expect(redis.expiries.get(sessionTokenKey(SESSION))).toBeGreaterThan(0);
    expect(redis.expiries.get(dayCostKey(USER))).toBeGreaterThan(0);
  });

  it('accumulates across turns, so the budget reflects the whole session', async () => {
    const redis = fakeRedis();
    vi.mocked(getRedisClient).mockReturnValue(redis.client as never);

    await addBudgetUsage({ userId: USER, sessionId: SESSION, usage: { inputTokens: 900, outputTokens: 100 } });
    await addBudgetUsage({ userId: USER, sessionId: SESSION, usage: { inputTokens: 900, outputTokens: 100 } });

    const { counters } = await readBudgetCounters(USER, SESSION);
    expect(counters.sessionTokens).toBe(2_000);
    expect(counters.sessionCostMicroUsd).toBe(2 * Math.round(900 * 0.18 + 100 * 0.71));
    expect(counters.dayCostMicroUsd).toBe(counters.sessionCostMicroUsd);
  });
});

describe('E17-S6 per-day cost budget', () => {
  it('admits a turn while the day is under budget', async () => {
    const redis = fakeRedis();
    vi.mocked(getRedisClient).mockReturnValue(redis.client as never);
    redis.values.set(dayCostKey(USER), 100_000); // $0.10

    const decision = await checkBudget({
      userId: USER,
      sessionId: SESSION,
      config: { sessionTokenBudget: 1_000_000, dailyCostBudgetUsd: 0.5 },
    });

    expect(decision.allowed).toBe(true);
    expect(decision.used.dailyCostUsd).toBeCloseTo(0.1, 10);
  });

  it('refuses at the day boundary, with its own code', async () => {
    const redis = fakeRedis();
    vi.mocked(getRedisClient).mockReturnValue(redis.client as never);
    redis.values.set(dayCostKey(USER), 500_000); // exactly $0.50

    const decision = await checkBudget({
      userId: USER,
      sessionId: SESSION,
      config: { sessionTokenBudget: 1_000_000, dailyCostBudgetUsd: 0.5 },
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.code).toBe(BUDGET_EXCEEDED_DAY);
    expect(decision.statusCode).toBe(429);
    expect(decision.limits.dailyCostUsd).toBe(0.5);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('refuses on a day that is over budget even when the session is untouched', async () => {
    const redis = fakeRedis();
    vi.mocked(getRedisClient).mockReturnValue(redis.client as never);
    redis.values.set(dayCostKey(USER), 900_000); // $0.90

    const decision = await checkBudget({
      userId: USER,
      sessionId: SESSION,
      config: { sessionTokenBudget: 1_000_000, dailyCostBudgetUsd: 0.5 },
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.code).toBe(BUDGET_EXCEEDED_DAY);
  });

  it('applies the day budget to a call with no session (the journal prompt path)', async () => {
    const redis = fakeRedis();
    vi.mocked(getRedisClient).mockReturnValue(redis.client as never);
    redis.values.set(dayCostKey(USER), 600_000);

    const decision = await checkBudget({
      userId: USER,
      sessionId: null,
      config: { sessionTokenBudget: 1_000_000, dailyCostBudgetUsd: 0.5 },
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.code).toBe(BUDGET_EXCEEDED_DAY);
    // No session ⇒ no per-session limit is claimed or enforced.
    expect(decision.limits.sessionTokens).toBeNull();
  });
});

describe('E17-S6 Redis-unavailable behaviour — degrades, does not go unbounded', () => {
  it('keeps counting in-process when REDIS_URL is unset, and still refuses at the boundary', async () => {
    vi.mocked(getRedisClient).mockReturnValue(null);

    await addBudgetUsage({
      userId: USER,
      sessionId: SESSION,
      usage: { inputTokens: 4_000, outputTokens: 1_000 },
    });

    const under = await checkBudget({
      userId: USER,
      sessionId: SESSION,
      config: { sessionTokenBudget: 10_000, dailyCostBudgetUsd: 10 },
    });
    expect(under.allowed).toBe(true);
    expect(under.store).toBe('memory');

    await addBudgetUsage({
      userId: USER,
      sessionId: SESSION,
      usage: { inputTokens: 4_000, outputTokens: 4_000 },
    });

    const over = await checkBudget({
      userId: USER,
      sessionId: SESSION,
      config: { sessionTokenBudget: 10_000, dailyCostBudgetUsd: 10 },
    });
    expect(over.allowed).toBe(false);
    if (over.allowed) throw new Error('unreachable');
    expect(over.code).toBe(BUDGET_EXCEEDED_SESSION);
    expect(over.store).toBe('memory');
  });

  it('falls back to the in-process store when Redis throws on read, instead of erroring the turn', async () => {
    const redis = fakeRedis();
    redis.client.mget.mockRejectedValueOnce(new Error('connection reset'));
    vi.mocked(getRedisClient).mockReturnValue(redis.client as never);

    const decision = await checkBudget({
      userId: USER,
      sessionId: SESSION,
      config: { sessionTokenBudget: 5_000, dailyCostBudgetUsd: 5 },
    });

    // Fail-closed on *spend*, not on infrastructure: the turn is admitted
    // because nothing has been counted, and the counter that refused it would
    // have been a Red-is-down outage, which is the failure this must not cause.
    expect(decision.allowed).toBe(true);
    expect(decision.store).toBe('memory');
  });

  it('still refuses from the in-process store after a Redis write failure', async () => {
    // A Redis that is up for neither direction — the shape of a real outage.
    const brokenRedis = {
      mget: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
      pipeline: vi.fn(() => {
        throw new Error('ECONNREFUSED');
      }),
    };
    vi.mocked(getRedisClient).mockReturnValue(brokenRedis as never);

    await addBudgetUsage({
      userId: USER,
      sessionId: SESSION,
      usage: { inputTokens: 5_000, outputTokens: 0 },
    });

    const decision = await checkBudget({
      userId: USER,
      sessionId: SESSION,
      config: { sessionTokenBudget: 5_000, dailyCostBudgetUsd: 5 },
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.code).toBe(BUDGET_EXCEEDED_SESSION);
    expect(decision.store).toBe('memory');
  });
});

describe('E17-S6 turn admission — the crisis path outranks the budget', () => {
  const tight = { sessionTokenBudget: 1_000, dailyCostBudgetUsd: 0.001 };

  beforeEach(() => {
    vi.mocked(getRedisClient).mockReturnValue(null);
  });

  it('proceeds when under budget', async () => {
    const admission = await admitTurn({ userId: USER, sessionId: SESSION, message: 'hello', config: tight });
    expect(admission.action).toBe('proceed');
  });

  it('refuses an ordinary message over budget', async () => {
    await addBudgetUsage({ userId: USER, sessionId: SESSION, usage: { inputTokens: 900, outputTokens: 200 } });

    const admission = await admitTurn({ userId: USER, sessionId: SESSION, message: 'hello', config: tight });
    expect(admission.action).toBe('refuse');
    if (admission.action !== 'refuse') throw new Error('unreachable');
    expect(admission.budget.code).toBe(BUDGET_EXCEEDED_SESSION);
  });

  it('admits an over-budget message that carries explicit crisis language', async () => {
    await addBudgetUsage({ userId: USER, sessionId: SESSION, usage: { inputTokens: 900, outputTokens: 200 } });

    const admission = await admitTurn({
      userId: USER,
      sessionId: SESSION,
      message: 'I want to die',
      config: tight,
    });

    expect(admission.action).toBe('crisis_bypass');
    if (admission.action !== 'crisis_bypass') throw new Error('unreachable');
    expect(admission.reason).toBe('crisis_language');
    // The refusal that was overridden is still reported, so the log shows both
    // facts: over budget, and admitted anyway for a safety reason.
    expect(admission.budget.code).toBe(BUDGET_EXCEEDED_SESSION);
  });

  it('does not label an in-budget crisis message as a bypass', async () => {
    const admission = await admitTurn({
      userId: USER,
      sessionId: SESSION,
      message: 'I want to die',
      config: tight,
    });
    expect(admission.action).toBe('proceed');
  });
});

describe('E17-S6 measured usage metering', () => {
  it('sums every model call in a turn and prices the total', async () => {
    const measured = await withUsageMetering({ userId: USER, sessionId: SESSION }, async () => {
      // The three calls a real turn makes: A1, A2, A9-post.
      recordModelUsage({ inputTokens: 800, outputTokens: 40 });
      recordModelUsage({ inputTokens: 1_400, outputTokens: 220 });
      recordModelUsage({ inputTokens: 700, outputTokens: 30 });
      return 'turn-result';
    });

    expect(measured.result).toBe('turn-result');
    expect(measured.usage.calls).toBe(3);
    expect(measured.usage.inputTokens).toBe(2_900);
    expect(measured.usage.outputTokens).toBe(290);
    expect(measured.usage.totalTokens).toBe(3_190);
    expect(measured.usage.costUsd).toBeCloseTo(2.9 * 0.00018 + 0.29 * 0.00071, 12);

    // And the measurement is what the budget counts, not a guess.
    const { counters } = await readBudgetCounters(USER, SESSION);
    expect(counters.sessionTokens).toBe(3_190);
    expect(counters.sessionCostMicroUsd).toBe(
      Math.round(2_900 * 0.18 + 290 * 0.71),
    );
  });

  it('records nothing for a call that reported no usage', async () => {
    const measured = await withUsageMetering({ userId: USER, sessionId: SESSION }, async () => {
      recordModelUsage(undefined);
      return 'ok';
    });

    expect(measured.usage.calls).toBe(0);
    expect(measured.usage.totalTokens).toBe(0);
    const { counters } = await readBudgetCounters(USER, SESSION);
    expect(counters.sessionTokens).toBe(0);
  });

  it('persists usage for a turn that throws, and rethrows the original error', async () => {
    await expect(
      withUsageMetering({ userId: USER, sessionId: SESSION }, async () => {
        recordModelUsage({ inputTokens: 500, outputTokens: 50 });
        throw new Error('turn blew up');
      }),
    ).rejects.toThrow('turn blew up');

    const { counters } = await readBudgetCounters(USER, SESSION);
    expect(counters.sessionTokens).toBe(550);
  });

  it('is inert outside a metered turn — no context, no counters, no throw', async () => {
    expect(() => recordModelUsage({ inputTokens: 10, outputTokens: 10 })).not.toThrow();
    expect(currentTurnUsage()).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      calls: 0,
      costUsd: 0,
    });

    const { counters } = await readBudgetCounters(USER, SESSION);
    expect(counters.sessionTokens).toBe(0);
  });

  it('does not leak usage from one turn into the next', async () => {
    await withUsageMetering({ userId: USER, sessionId: SESSION }, async () => {
      recordModelUsage({ inputTokens: 100, outputTokens: 10 });
    });

    const second = await withUsageMetering({ userId: USER, sessionId: SESSION }, async () => 'ok');
    expect(second.usage.calls).toBe(0);
  });
});
