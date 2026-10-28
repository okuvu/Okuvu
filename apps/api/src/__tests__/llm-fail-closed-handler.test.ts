import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';

/**
 * E17-S1 — an unreachable model returns the *documented* fail-closed response instead of a
 * generic 500.
 *
 * The documented contract lives in two places:
 *   • `apps/api/src/lib/generate-content.ts:28-32` — "The Bedrock branch keeps the same
 *     fail-closed stance via `bedrock.ts` (errors → `fallbackUsed:true`, never fabricated
 *     text)."
 *   • `docs/AGENT-CODE-STANDARD.md` §4 "Fail closed" — a technical failure returns the most
 *     conservative value, never a plausible default.
 *
 * `POST /journal/prompt` is the shortest real request handler that reaches Bedrock: route →
 * `generateJournalPrompt` → `generateContent` → `bedrock.ts` → the SDK. The test drives that
 * whole chain with nothing mocked except Prisma and the Bedrock endpoint (stubbed in-process,
 * h2c — the transport this SDK negotiates), so a `ResourceNotFoundException` from the model
 * must surface as the curated fallback prompt with HTTP 200 — not as `INTERNAL_SERVER_ERROR`
 * / 500.
 */

const mockUserFindUnique = vi.hoisted(() => vi.fn());

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
  },
}));

import { buildApp } from '../app.js';
import { getFallbackJournalPrompt } from '../agents/journal-prompt/fallback-prompts.js';
import { clearBedrockClient } from '../lib/bedrock.js';

interface Stub {
  url: string;
  paths: string[];
  close: () => Promise<void>;
}

async function startConverseStub(
  respond: () => { status: number; headers?: Record<string, string>; body: string },
): Promise<Stub> {
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
    close: () =>
      new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function structuredReply(prompt: string): string {
  return JSON.stringify({
    output: {
      message: {
        role: 'assistant',
        content: [
          { toolUse: { toolUseId: 't1', name: 'emit_structured_json', input: { prompt } } },
        ],
      },
    },
    stopReason: 'tool_use',
  });
}

const ORIGINAL_ENV = { ...process.env };

const ENV_KEYS = [
  'LLM_PROVIDER',
  'BEDROCK_MODEL_ID',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_ENDPOINT_URL',
  'AWS_PROFILE',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'USE_CANNED_LLM_RESPONSE',
] as const;

describe('E17-S1: an unreachable model fails closed at the request handler', () => {
  let app: ReturnType<typeof buildApp>;
  let stub: Stub | undefined;

  beforeEach(() => {
    const base: Record<string, string | undefined> = { ...ORIGINAL_ENV };
    for (const key of ENV_KEYS) delete base[key];
    // The Bedrock path this story is about, with dev auth so the handler is reachable.
    base.LOCAL_DEV_BYPASS_AUTH = 'true';
    base.LLM_PROVIDER = 'bedrock';
    process.env = base as NodeJS.ProcessEnv;

    mockUserFindUnique.mockResolvedValue({ id: 'user-1', user_memory: null });
    clearBedrockClient();
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    if (stub) await stub.close();
    stub = undefined;
    clearBedrockClient();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  async function pointAt(next: Stub): Promise<void> {
    stub = next;
    process.env.AWS_ENDPOINT_URL = next.url;
    process.env.AWS_REGION = 'ap-south-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    delete process.env.AWS_PROFILE;
    clearBedrockClient();
  }

  it('returns the curated fallback prompt (200), not a 500, when the model is unreachable', async () => {
    await pointAt(
      await startConverseStub(() => ({
        status: 404,
        headers: { 'x-amzn-ErrorType': 'ResourceNotFoundException' },
        body: JSON.stringify({ message: 'This model is marked by the provider as deprecated.' }),
      })),
    );
    process.env.BEDROCK_MODEL_ID = 'qwen.qwen3-missing-v1:0';

    const response = await app.inject({ method: 'POST', url: '/journal/prompt' });

    // The call was made, over Converse, for the configured model.
    expect(stub?.paths).toEqual(['POST /model/qwen.qwen3-missing-v1%3A0/converse']);

    // Documented fail-closed behaviour: a usable, curated prompt — never a generic 500 and
    // never an empty body.
    expect(response.statusCode).toBe(200);
    expect(response.statusCode).not.toBe(500);
    const body = response.json() as { prompt?: string; error?: { code: string } };
    expect(body.error).toBeUndefined();
    expect(body.prompt).toBe(getFallbackJournalPrompt());
    expect((body.prompt ?? '').length).toBeGreaterThan(0);
  });

  it('returns a non-empty model reply from the same handler when Converse succeeds', async () => {
    await pointAt(
      await startConverseStub(() => ({
        status: 200,
        body: structuredReply('What made today different?'),
      })),
    );
    process.env.BEDROCK_MODEL_ID = 'qwen.qwen3-32b-v1:0';

    const response = await app.inject({ method: 'POST', url: '/journal/prompt' });

    expect(stub?.paths).toEqual(['POST /model/qwen.qwen3-32b-v1%3A0/converse']);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ prompt: 'What made today different?' });
  });
});
