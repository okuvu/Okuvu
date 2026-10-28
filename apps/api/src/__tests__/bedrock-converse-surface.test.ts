import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';

/**
 * E17-S1 — the agent runtime calls Bedrock through the **Converse** API.
 *
 * The existing `bedrock.test.ts` mocks `@aws-sdk/client-bedrock-runtime` wholesale, so it can
 * only assert that *some* command object carried a Converse-shaped `input`. It cannot tell
 * `ConverseCommand` from `InvokeModelCommand` wrapped in the same body, and it never sees the
 * HTTP request the SDK builds. That is exactly the gap E17-S2 found: `InvokeModel` with a raw
 * `messages` body fails and `Converse` succeeds, so "it returned text" is not proof of surface.
 *
 * These tests therefore drive the *real* SDK client against a loopback `bedrock-runtime`
 * stub (h2c — the transport the SDK actually negotiates for this client version) and assert
 * the request the runtime emits:
 *
 *   POST /model/<modelId>/converse
 *
 * A swap to `InvokeModelCommand` changes that path to `/model/<modelId>/invoke` and the body
 * to a raw string, so both assertions below fail loudly rather than silently changing API.
 *
 * No AWS account, credentials or network egress are involved: the endpoint is overridden with
 * `AWS_ENDPOINT_URL` (the same override E17-S2 used) and the stub answers in-process.
 */

const SAFE_FALLBACK = "I'm here to support you. Could you tell me more about how you're feeling?";

interface RecordedRequest {
  method: string;
  path: string;
  body: string;
}

interface Stub {
  url: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
}

type Responder = (req: RecordedRequest) => {
  status: number;
  headers?: Record<string, string>;
  body: string;
};

/** A loopback `bedrock-runtime` that records every request and answers with `respond`. */
async function startStub(respond: Responder): Promise<Stub> {
  const requests: RecordedRequest[] = [];

  const server = http2.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const recorded = { method: req.method ?? '', path: req.headers[':path'] ?? '', body };
      requests.push(recorded);
      const reply = respond(recorded);
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
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

function converseReply(text: string): string {
  return JSON.stringify({
    output: { message: { role: 'assistant', content: [{ text }] } },
    stopReason: 'end_turn',
    usage: { inputTokens: 18, outputTokens: 2, totalTokens: 20 },
    metrics: { latencyMs: 141 },
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
  'LLM_PROVIDER',
] as const;

describe('E17-S1: the runtime calls bedrock-runtime Converse', () => {
  const saved: Record<string, string | undefined> = {};
  let stub: Stub;

  /** Point the product module at `stub` and drop the memoised SDK client. */
  async function useStub(next: Stub): Promise<void> {
    process.env.AWS_ENDPOINT_URL = next.url;
    process.env.AWS_REGION = 'ap-south-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    delete process.env.AWS_PROFILE;
    const { clearBedrockClient } = await import('../lib/bedrock.js');
    clearBedrockClient();
  }

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
    const { clearBedrockClient } = await import('../lib/bedrock.js');
    clearBedrockClient();
  });

  it('POSTs to /model/<modelId>/converse and returns a non-empty reply', async () => {
    stub = await startStub(() => ({ status: 200, body: converseReply('OK') }));
    await useStub(stub);

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent({
      systemInstruction: 'You are a supportive assistant.',
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK' }] }],
    });

    // Surface: exactly one call, and it is the Converse action for the configured model.
    expect(stub.requests).toHaveLength(1);
    const [request] = stub.requests;
    expect(request.method).toBe('POST');
    expect(request.path).toBe('/model/qwen.qwen3-32b-v1%3A0/converse');
    expect(request.path.endsWith('/converse')).toBe(true);

    // The InvokeModel shape must not appear: neither its path nor its raw-messages body.
    expect(request.path).not.toContain('/invoke');
    const sentBody = JSON.parse(request.body) as Record<string, unknown>;
    expect(sentBody.messages).toEqual([
      { role: 'user', content: [{ text: 'Reply with the single word OK' }] },
    ]);
    expect(sentBody.system).toEqual([{ text: 'You are a supportive assistant.' }]);
    expect(sentBody.inferenceConfig).toMatchObject({ maxTokens: 2048 });
    // InvokeModel-style raw fields — the body shape E17-S2 proved this model rejects.
    expect(sentBody).not.toHaveProperty('prompt');
    expect(sentBody).not.toHaveProperty('max_tokens');

    // Outcome: a real, non-empty assistant reply, not a fallback.
    expect(result.text).toBe('OK');
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.fallbackUsed).toBe(false);
    expect(result.failureReason).toBeUndefined();
    expect(result.model).toBe('qwen.qwen3-32b-v1:0');
  });

  it('sends the Converse path for the configured model, so the id comes from configuration', async () => {
    stub = await startStub(() => ({ status: 200, body: converseReply('OK') }));
    await useStub(stub);
    process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0';

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent({
      systemInstruction: 'You are a supportive assistant.',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    // Same API surface, different model id — the id is configuration, not the surface.
    expect(stub.requests[0].path).toBe('/model/amazon.nova-lite-v1%3A0/converse');
    expect(JSON.parse(stub.requests[0].body).modelId).toBeUndefined();
    expect(result.model).toBe('amazon.nova-lite-v1:0');
  });

  it('fails closed with the documented fallback when the model is unreachable', async () => {
    // A real model id that is not in this account/region answers ResourceNotFoundException;
    // the stub reproduces that response so the SDK raises its own error type.
    stub = await startStub(() => ({
      status: 404,
      headers: {
        'x-amzn-ErrorType': 'ResourceNotFoundException:http://internal.amazon.com/coral/com.amazon.bedrock/',
      },
      body: JSON.stringify({
        message: 'This model is marked by the provider as deprecated.',
      }),
    }));
    await useStub(stub);
    process.env.BEDROCK_MODEL_ID = 'qwen.qwen3-missing-v1:0';

    const { generateContent } = await import('../lib/bedrock.js');

    // The documented contract (generate-content.ts:28-32, docs/AGENT-CODE-STANDARD.md §4):
    // a provider failure degrades to fallbackUsed:true — it never throws and never surfaces
    // a 500-shaped error to the caller.
    const result = await generateContent({
      systemInstruction: 'You are a supportive assistant.',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(stub.requests[0].path).toBe('/model/qwen.qwen3-missing-v1%3A0/converse');
    expect(result.text).toBe(SAFE_FALLBACK);
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('api_error');
    expect(result.model).toBe('qwen.qwen3-missing-v1:0');
    expect(result.canned).toBe(false);
  });

  it('does not retry a missing model into a different API surface', async () => {
    stub = await startStub(() => ({
      status: 404,
      headers: { 'x-amzn-ErrorType': 'ResourceNotFoundException' },
      body: JSON.stringify({ message: 'model not found' }),
    }));
    await useStub(stub);
    process.env.BEDROCK_MODEL_ID = 'qwen.qwen3-missing-v1:0';

    const { generateContent } = await import('../lib/bedrock.js');
    await generateContent({
      systemInstruction: 'You are a supportive assistant.',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    // Every attempt (the SDK does not retry a 404, but assert regardless) used Converse.
    expect(stub.requests.length).toBeGreaterThan(0);
    for (const request of stub.requests) {
      expect(request.path).toMatch(/\/converse$/);
    }
  });
});
