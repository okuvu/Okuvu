import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';

/**
 * E17-S6 — cost is measured from the token counts the service reports, not
 * estimated from prompt length.
 *
 * This drives the *real* Bedrock SDK client at a loopback `bedrock-runtime`
 * stub (the h2c pattern E17-S1 established) that answers with a real
 * Converse-shaped `usage` block, and asserts the numbers reaching the budget
 * counters are exactly the ones in the response. A regression to "count the
 * characters and divide by four" fails here, because the stub's token counts
 * bear no relation to its reply text.
 *
 * Provenance, stated plainly: the `usage` object is shaped like Converse's and
 * travels through the same parse/meter path as production, but the numbers are
 * authored by this stub — this is a simulated usage object, not a live billing
 * record. No AWS account, credentials or network egress are involved.
 */

vi.mock('../lib/redis.js', () => ({
  getRedisClient: () => null,
}));

const USER = 'user-usage';
const SESSION = 'session-usage';

// Deliberately unrelated to the reply text below: 43 characters of "OK, noted."
// is neither 1,234 input tokens nor 567 output tokens by any length heuristic.
const INPUT_TOKENS = 1_234;
const OUTPUT_TOKENS = 567;

interface Stub {
  url: string;
  requests: Array<{ path: string; body: string }>;
  close: () => Promise<void>;
}

type Responder = () => { status: number; headers?: Record<string, string>; body: string };

async function startStub(respond: Responder): Promise<Stub> {
  const requests: Array<{ path: string; body: string }> = [];

  const server = http2.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push({ path: req.headers[':path'] ?? '', body });
      const reply = respond();
      res.writeHead(reply.status, { 'content-type': 'application/json', ...reply.headers });
      res.end(reply.body);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function converseReply(text: string, usage = { inputTokens: INPUT_TOKENS, outputTokens: OUTPUT_TOKENS }): string {
  return JSON.stringify({
    output: { message: { role: 'assistant', content: [{ text }] } },
    stopReason: 'end_turn',
    usage: { ...usage, totalTokens: usage.inputTokens + usage.outputTokens },
    metrics: { latencyMs: 212 },
  });
}

const ENV_KEYS = [
  'BEDROCK_MODEL_ID',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_ENDPOINT_URL',
  'AWS_PROFILE',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'USE_CANNED_LLM_RESPONSE',
] as const;

describe('E17-S6: cost per session is measured from Converse usage', () => {
  const saved: Record<string, string | undefined> = {};
  let stub: Stub;

  beforeEach(async () => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    const budget = await import('../lib/token-budget.js');
    budget.__resetBudgetCounterStore();
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    if (stub) await stub.close();
    const { clearBedrockClient } = await import('../lib/bedrock.js');
    clearBedrockClient();
  });

  async function useStub(next: Stub): Promise<void> {
    process.env.AWS_ENDPOINT_URL = next.url;
    process.env.AWS_REGION = 'ap-south-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    delete process.env.AWS_PROFILE;
    const { clearBedrockClient } = await import('../lib/bedrock.js');
    clearBedrockClient();
  }

  it('returns the service-reported token counts on the result', async () => {
    stub = await startStub(() => ({ status: 200, body: converseReply('OK, noted.') }));
    await useStub(stub);

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent({
      systemInstruction: 'You are a supportive assistant.',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0].path).toBe('/model/qwen.qwen3-32b-v1%3A0/converse');
    expect(result.usage).toEqual({
      inputTokens: INPUT_TOKENS,
      outputTokens: OUTPUT_TOKENS,
      totalTokens: INPUT_TOKENS + OUTPUT_TOKENS,
    });
  });

  it('carries those counts into the session and day counters, priced at list', async () => {
    stub = await startStub(() => ({ status: 200, body: converseReply('OK, noted.') }));
    await useStub(stub);

    const { generateContent } = await import('../lib/bedrock.js');
    const budget = await import('../lib/token-budget.js');

    const measured = await budget.withUsageMetering({ userId: USER, sessionId: SESSION }, () =>
      generateContent({
        systemInstruction: 'You are a supportive assistant.',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      }),
    );

    expect(measured.usage.calls).toBe(1);
    expect(measured.usage.totalTokens).toBe(INPUT_TOKENS + OUTPUT_TOKENS);

    // 1234 × $0.00018/1K + 567 × $0.00071/1K = 0.00022212 + 0.00040257.
    expect(measured.usage.costUsd).toBeCloseTo(0.00062469, 12);

    const { counters, store } = await budget.readBudgetCounters(USER, SESSION);
    expect(store).toBe('memory');
    expect(counters.sessionTokens).toBe(1_801);
    expect(counters.sessionCostMicroUsd).toBe(625); // 0.00062469 USD ≈ 624.69 µ$, rounded
    expect(counters.dayCostMicroUsd).toBe(625);
  });

  it('meters a billed-but-empty candidate — a failure the service still charged for', async () => {
    // stopReason max_tokens with no content blocks: the reply is unusable, but
    // the tokens were spent, so the budget must see them.
    stub = await startStub(() => ({
      status: 200,
      body: JSON.stringify({
        output: { message: { role: 'assistant', content: [] } },
        stopReason: 'max_tokens',
        usage: { inputTokens: 900, outputTokens: 2_048, totalTokens: 2_948 },
      }),
    }));
    await useStub(stub);

    const { generateContent } = await import('../lib/bedrock.js');
    const budget = await import('../lib/token-budget.js');

    const measured = await budget.withUsageMetering({ userId: USER, sessionId: SESSION }, () =>
      generateContent({
        systemInstruction: 'You are a supportive assistant.',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      }),
    );

    expect(measured.result.fallbackUsed).toBe(true);
    expect(measured.usage.calls).toBe(1);
    expect(measured.usage.totalTokens).toBe(2_948);
  });

  it('records nothing when the call never reached a billed model', async () => {
    stub = await startStub(() => ({
      status: 404,
      headers: { 'x-amzn-ErrorType': 'ResourceNotFoundException' },
      body: JSON.stringify({ message: 'model not found' }),
    }));
    await useStub(stub);
    process.env.BEDROCK_MODEL_ID = 'qwen.qwen3-missing-v1:0';

    const { generateContent } = await import('../lib/bedrock.js');
    const budget = await import('../lib/token-budget.js');

    const measured = await budget.withUsageMetering({ userId: USER, sessionId: SESSION }, () =>
      generateContent({
        systemInstruction: 'You are a supportive assistant.',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      }),
    );

    expect(measured.result.fallbackUsed).toBe(true);
    expect(measured.usage.calls).toBe(0);

    const { counters } = await budget.readBudgetCounters(USER, SESSION);
    expect(counters.sessionTokens).toBe(0);
    expect(counters.sessionCostMicroUsd).toBe(0);
  });

  it('stops admitting turns once the measured session spend reaches the budget', async () => {
    stub = await startStub(() => ({ status: 200, body: converseReply('OK, noted.') }));
    await useStub(stub);

    const { generateContent } = await import('../lib/bedrock.js');
    const budget = await import('../lib/token-budget.js');

    // A budget just under two measured turns, so the second one is the boundary.
    const config = { sessionTokenBudget: 2_000, dailyCostBudgetUsd: 100 };

    const first = await budget.admitTurn({ userId: USER, sessionId: SESSION, message: 'hi', config });
    expect(first.action).toBe('proceed');

    await budget.withUsageMetering({ userId: USER, sessionId: SESSION }, () =>
      generateContent({
        systemInstruction: 'sys',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      }),
    );

    // 1,801 of 2,000 tokens spent: still under, so still admitted.
    const second = await budget.admitTurn({ userId: USER, sessionId: SESSION, message: 'hi', config });
    expect(second.action).toBe('proceed');

    await budget.withUsageMetering({ userId: USER, sessionId: SESSION }, () =>
      generateContent({
        systemInstruction: 'sys',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      }),
    );

    // 3,602 of 2,000: the third turn is refused, with the session code.
    const third = await budget.admitTurn({ userId: USER, sessionId: SESSION, message: 'hi', config });
    expect(third.action).toBe('refuse');
    if (third.action !== 'refuse') throw new Error('unreachable');
    expect(third.budget.code).toBe(budget.BUDGET_EXCEEDED_SESSION);
    expect(third.budget.statusCode).toBe(429);
    expect(third.budget.used.sessionTokens).toBe(3_602);
  });
});
