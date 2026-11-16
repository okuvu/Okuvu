import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';

/**
 * E17-S6 — the flex lane, asserted on the wire rather than on intent.
 *
 * The tier is a field in the Converse body (`serviceTier`). A unit test on
 * `decideServiceTier()` can show what we *meant* to send; only the runtime's own
 * request proves what we sent. So these tests drive the real SDK client against
 * a loopback `bedrock-runtime` stub, the same way `bedrock-converse-surface`
 * proves the surface.
 *
 * Three properties matter:
 *
 *  1. a `dialogue` call carries `serviceTier: {type:'flex'}` when enabled;
 *  2. a `safety`/`review` call never carries it, whatever the flag says;
 *  3. a refused flex call is re-run once on the guaranteed tier — and the answer
 *     the caller sees comes from that second attempt, not from the refusal.
 */

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

type Responder = (req: RecordedRequest, index: number) => { status: number; body: string };

async function startStub(respond: Responder): Promise<Stub> {
  const requests: RecordedRequest[] = [];

  const server = http2.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const recorded = { method: req.method ?? '', path: req.headers[':path'] ?? '', body };
      requests.push(recorded);
      const reply = respond(recorded, requests.length - 1);
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(reply.body);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
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
  'AWS_ENDPOINT_URL',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_PROFILE',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'OKUVU_BEDROCK_FLEX',
  'USE_CANNED_LLM_RESPONSE',
] as const;

describe('E17-S6: Bedrock service tier on the wire', () => {
  const saved: Record<string, string | undefined> = {};
  let stub: Stub | undefined;

  async function useStub(endpoint: Stub): Promise<void> {
    stub = endpoint;
    process.env.AWS_ENDPOINT_URL = endpoint.url;
    process.env.AWS_REGION = 'ap-south-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    delete process.env.AWS_PROFILE;
    const { clearBedrockClient } = await import('../lib/bedrock.js');
    clearBedrockClient();
  }

  const params = (callRole: 'safety' | 'review' | 'dialogue' | 'background' | undefined) => ({
    systemInstruction: 'You are a supportive assistant.',
    contents: [{ role: 'user' as const, parts: [{ text: 'hello' }] }],
    ...(callRole ? { callRole } : {}),
  });

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

  it('sends serviceTier flex for a dialogue turn when enabled', async () => {
    await useStub(await startStub(() => ({ status: 200, body: converseReply('OK') })));
    process.env.OKUVU_BEDROCK_FLEX = 'true';

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent(params('dialogue'));

    expect(result.fallbackUsed).toBe(false);
    expect(stub!.requests).toHaveLength(1);
    const body = JSON.parse(stub!.requests[0].body) as Record<string, unknown>;
    expect(body.serviceTier).toEqual({ type: 'flex' });
  });

  it.each(['safety', 'review'] as const)('never sends a service tier for the %s role', async (role) => {
    await useStub(await startStub(() => ({ status: 200, body: converseReply('OK') })));
    process.env.OKUVU_BEDROCK_FLEX = 'true';

    const { generateContent } = await import('../lib/bedrock.js');
    await generateContent(params(role));

    const body = JSON.parse(stub!.requests[0].body) as Record<string, unknown>;
    expect(body).not.toHaveProperty('serviceTier');
  });

  it('sends no service tier at all when the flag is off — the existing behaviour', async () => {
    await useStub(await startStub(() => ({ status: 200, body: converseReply('OK') })));

    const { generateContent } = await import('../lib/bedrock.js');
    await generateContent(params('dialogue'));

    expect(stub!.requests).toHaveLength(1);
    const body = JSON.parse(stub!.requests[0].body) as Record<string, unknown>;
    expect(body).not.toHaveProperty('serviceTier');
  });

  it('re-runs a refused flex call once on the guaranteed tier and returns its answer', async () => {
    await useStub(
      await startStub((_req, index) =>
        index === 0
          ? {
              status: 400,
              body: JSON.stringify({
                message: 'This model does not support the flex service tier.',
                __type: 'ValidationException',
              }),
            }
          : { status: 200, body: converseReply('ANSWERED ON DEFAULT') },
      ),
    );
    process.env.OKUVU_BEDROCK_FLEX = 'true';

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent(params('dialogue'));

    expect(stub!.requests).toHaveLength(2);
    const first = JSON.parse(stub!.requests[0].body) as Record<string, unknown>;
    const second = JSON.parse(stub!.requests[1].body) as Record<string, unknown>;
    expect(first.serviceTier).toEqual({ type: 'flex' });
    expect(second).not.toHaveProperty('serviceTier');

    expect(result.text).toBe('ANSWERED ON DEFAULT');
    expect(result.fallbackUsed).toBe(false);
  });

  it('makes a single attempt for a safety call even when that attempt fails', async () => {
    await useStub(
      await startStub(() => ({
        status: 400,
        body: JSON.stringify({ message: 'nope', __type: 'ValidationException' }),
      })),
    );
    process.env.OKUVU_BEDROCK_FLEX = 'true';

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent(params('safety'));

    expect(stub!.requests).toHaveLength(1);
    expect(result.fallbackUsed).toBe(true);
  });
});
