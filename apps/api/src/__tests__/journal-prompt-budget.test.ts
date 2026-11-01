import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * E17-S6 — the HTTP half of the budget: `POST /journal/prompt` is a real
 * request-path model call (J2), so an exhausted day budget must answer 429 with
 * the same dedicated code the WebSocket budget notice carries — not a 500 and
 * not a silently degraded prompt.
 */

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/redis.js', () => ({
  getRedisClient: () => null,
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    journalEntry: { create: vi.fn(), findMany: vi.fn() },
  },
}));

const mockGenerateJournalPrompt = vi.hoisted(() => vi.fn());

vi.mock('../agents/journal-prompt/agent.js', () => ({
  generateJournalPrompt: mockGenerateJournalPrompt,
}));

import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { __resetBudgetCounterStore, addBudgetUsage } from '../lib/token-budget.js';

const AUTH_SUBJECT = 'dev-bypass-subject-1';
const INTERNAL_USER_ID = 'user-journal-1';

describe('E17-S6: POST /journal/prompt is charged to the per-day budget', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = {
      ...ORIGINAL_ENV,
      LOCAL_DEV_BYPASS_AUTH: 'true',
      DAILY_COST_BUDGET_USD: '0.5',
    };
    delete process.env.REDIS_URL;
    __resetBudgetCounterStore();

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: INTERNAL_USER_ID,
      user_memory: null,
    } as never);
    mockGenerateJournalPrompt.mockResolvedValue('What made today different?');

    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    __resetBudgetCounterStore();
    vi.clearAllMocks();
  });

  it('returns the generated prompt while the day is under budget', async () => {
    const response = await app.inject({ method: 'POST', url: '/journal/prompt' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ prompt: 'What made today different?' });
    expect(mockGenerateJournalPrompt).toHaveBeenCalledTimes(1);
  });

  it('returns 429 with the dedicated code once the day budget is spent, without calling the model', async () => {
    await addBudgetUsage({
      userId: AUTH_SUBJECT,
      sessionId: null,
      usage: { inputTokens: 2_777_778, outputTokens: 0 }, // $0.50 of a $0.50 day
    });

    const response = await app.inject({ method: 'POST', url: '/journal/prompt' });

    expect(response.statusCode).toBe(429);
    const body = response.json() as { error: Record<string, unknown> };
    expect(body.error.code).toBe('BUDGET_EXCEEDED_DAY');
    expect(body.error.message).toContain('Daily cost budget exhausted');
    expect((body.error.limits as Record<string, unknown>).daily_cost_usd).toBe(0.5);
    expect((body.error.used as Record<string, number>).daily_cost_usd).toBeCloseTo(0.5, 6);
    expect(body.error.retry_after_seconds).toBeGreaterThan(0);

    // The refusal happened before the paid call, which is the point.
    expect(mockGenerateJournalPrompt).not.toHaveBeenCalled();
  });

  it('counts J2 spend, so repeated prompts inside one day are bounded', async () => {
    // Each mocked prompt call records nothing by itself (the model is stubbed),
    // so this asserts the counter path, not the model: seed two prompts' worth
    // and confirm the third is refused.
    await addBudgetUsage({ userId: AUTH_SUBJECT, sessionId: null, usage: { inputTokens: 1_500_000, outputTokens: 0 } });

    const first = await app.inject({ method: 'POST', url: '/journal/prompt' });
    expect(first.statusCode).toBe(200);

    await addBudgetUsage({ userId: AUTH_SUBJECT, sessionId: null, usage: { inputTokens: 1_300_000, outputTokens: 0 } });

    const second = await app.inject({ method: 'POST', url: '/journal/prompt' });
    expect(second.statusCode).toBe(429);
    expect((second.json() as { error: { code: string } }).error.code).toBe('BUDGET_EXCEEDED_DAY');
  });
});
