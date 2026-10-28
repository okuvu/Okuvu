import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';

/**
 * E17-S1 — the worker is a deployed task that calls Bedrock too, through its own copy of
 * `apps/api/src/lib/bedrock.ts` (`apps/worker/src/lib/bedrock.ts`). The worker's existing
 * `bedrock.test.ts` mocks the whole SDK module, so it cannot tell which API surface was used.
 * This test drives the real SDK against a loopback `bedrock-runtime` stub and asserts the
 * request path: `POST /model/<modelId>/converse`.
 *
 * Documented divergence (see evidence/E17-S1.md): on failure the worker returns
 * `{ text: '', fallbackUsed: true }` (`apps/worker/src/lib/bedrock.ts:255-258`) rather than the
 * API's `SAFE_FALLBACK` sentence. That is the worker's existing contract and is asserted as-is
 * here, not changed by this story.
 */

const SAFE_FALLBACK = "I'm here to support you. Could you tell me more about how you're feeling?";

interface Stub {
  url: string;
  paths: string[];
  close: () => Promise<void>;
}

async function startStub(respond: () => { status: number; headers?: Record<string, string>; body: string }): Promise<Stub> {
  const paths: string[] = [];
  const server = http2.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      paths.push(`${req.method} ${req.headers[':path']}`);
      const reply = respond();
      res.writeHead(reply.status, { 'content-type': 'application/json', ...reply.headers });
      res.end(reply.body);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    paths,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

function converseReply(text: string): string {
  return JSON.stringify({
    output: { message: { role: 'assistant', content: [{ text }] } },
    stopReason: 'end_turn',
    usage: { inputTokens: 18, outputTokens: 2, totalTokens: 20 },
  });
}

const ENV_KEYS = [
  'BEDROCK_MODEL_ID',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_PROFILE',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_ENDPOINT_URL',
  'USE_CANNED_LLM_RESPONSE',
] as const;

describe('E17-S1: the worker calls bedrock-runtime Converse', () => {
  const saved: Record<string, string | undefined> = {};
  let stub: Stub | undefined;

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    if (stub) await stub.close();
    stub = undefined;
    const { clearBedrockClient } = await import('../lib/bedrock.js');
    clearBedrockClient();
  });

  async function useStub(next: Stub): Promise<void> {
    stub = next;
    process.env.AWS_ENDPOINT_URL = next.url;
    process.env.AWS_REGION = 'ap-south-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    delete process.env.AWS_PROFILE;
    const { clearBedrockClient } = await import('../lib/bedrock.js');
    clearBedrockClient();
  }

  it('POSTs to /model/<modelId>/converse and returns the reply text', async () => {
    await useStub(await startStub(() => ({ status: 200, body: converseReply('OK') })));

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK' }] }],
    });

    expect(stub?.paths).toEqual(['POST /model/qwen.qwen3-32b-v1%3A0/converse']);
    expect(result.text).toBe('OK');
    expect(result.fallbackUsed).toBe(false);
  });

  it('fails closed on ResourceNotFoundException without throwing', async () => {
    await useStub(
      await startStub(() => ({
        status: 404,
        headers: { 'x-amzn-ErrorType': 'ResourceNotFoundException' },
        body: JSON.stringify({ message: 'model not found' }),
      })),
    );
    process.env.BEDROCK_MODEL_ID = 'qwen.qwen3-missing-v1:0';

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent({
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(stub?.paths).toEqual(['POST /model/qwen.qwen3-missing-v1%3A0/converse']);
    // E17-S4 closed the asymmetry E17-S1 §7 recorded: the worker now returns the
    // same curated sentence as the api instead of '' — fallbackUsed on every
    // technical failure, never a thrown error, and never an empty text a caller
    // could mistake for a summary.
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('api_error');
    expect(result.failureKind).toBe('unavailable');
    expect(result.text).toBe(SAFE_FALLBACK);
  });
});
