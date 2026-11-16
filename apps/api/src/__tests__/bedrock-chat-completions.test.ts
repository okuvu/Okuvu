import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';
import { SAFETY_UNAVAILABLE_RESPONSE } from '../pipeline/fallbacks.js';

/**
 * The cache-capable surface: Bedrock's OpenAI-compatible Chat Completions.
 *
 * Why this file exists next to `bedrock-converse-surface.test.ts`: that file
 * pins the Converse fallback (the shipped surface, still used whenever this one
 * refuses). This one pins the new primary surface and the two things the whole
 * change is for — the explicit prompt-cache breakpoint on the instruction block,
 * and the schema still being forced as a tool call rather than hoped for in
 * prose.
 *
 * Two loopback stubs, because the two surfaces speak different protocols: the
 * cache path is a `fetch` (HTTP/1.1) and Converse goes through the SDK, which
 * negotiates h2c for this client. `BEDROCK_ENDPOINT_URL` points this surface at
 * the first and `AWS_ENDPOINT_URL` points the SDK at the second. Real SigV4
 * signing runs against static test credentials, so the request the module builds
 * is the request asserted here — no account, credentials or egress involved.
 */

const SAFE_FALLBACK = SAFETY_UNAVAILABLE_RESPONSE;

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

type Responder = (req: RecordedRequest) => { status: number; body: string } | 'hang';

/** HTTP/1.1 listener — what `fetch` can talk to. */
async function startHttpStub(respond: Responder): Promise<Stub> {
  const requests: RecordedRequest[] = [];

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const recorded = { method: req.method ?? '', path: req.url ?? '', body };
      requests.push(recorded);
      const reply = respond(recorded);
      if (reply === 'hang') return;
      res.writeHead(reply.status, { 'content-type': 'application/json' });
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

/** h2c listener — what the Bedrock SDK client negotiates. */
async function startHttp2Stub(respond: Responder): Promise<Stub> {
  const requests: RecordedRequest[] = [];

  const server = http2.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const recorded = {
        method: req.method ?? '',
        path: (req.headers[':path'] as string | undefined) ?? '',
        body,
      };
      requests.push(recorded);
      const reply = respond(recorded);
      if (reply === 'hang') return;
      res.writeHead(reply.status, { 'content-type': 'application/json' });
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

function chatReply(options: {
  content?: string;
  toolArguments?: string;
  cachedTokens?: number;
  promptTokens?: number;
}): string {
  return JSON.stringify({
    id: 'chatcmpl-test',
    choices: [
      {
        index: 0,
        finish_reason: options.toolArguments ? 'tool_calls' : 'stop',
        message: options.toolArguments
          ? {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'emit_structured_json', arguments: options.toolArguments },
                },
              ],
            }
          : { role: 'assistant', content: options.content ?? '' },
      },
    ],
    usage: {
      prompt_tokens: options.promptTokens ?? 2834,
      completion_tokens: 12,
      total_tokens: (options.promptTokens ?? 2834) + 12,
      prompt_tokens_details: { cached_tokens: options.cachedTokens ?? 2768 },
    },
  });
}

const converseReply = (text: string) =>
  JSON.stringify({
    output: { message: { role: 'assistant', content: [{ text }] } },
    stopReason: 'end_turn',
    usage: { inputTokens: 18, outputTokens: 2, totalTokens: 20 },
  });

const ENV_KEYS = [
  'BEDROCK_PROMPT_CACHE',
  'BEDROCK_MODEL_ID',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_ENDPOINT_URL',
  'BEDROCK_ENDPOINT_URL',
  'AWS_PROFILE',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'USE_CANNED_LLM_RESPONSE',
] as const;

const SAFETY_SCHEMA = {
  type: 'OBJECT' as const,
  properties: {
    safetyState: { type: 'STRING' as const },
    crisis_language_detected: { type: 'BOOLEAN' as const },
    notes: { type: 'STRING' as const, nullable: true },
  },
  required: ['safetyState', 'crisis_language_detected'],
  propertyOrdering: ['safetyState'],
};

describe('Bedrock Chat Completions: the prompt-cache surface', () => {
  const saved: Record<string, string | undefined> = {};
  let chatStub: Stub | undefined;
  let converseStub: Stub | undefined;

  /** Point this surface at `chat` and the SDK client at `converse`, then drop memoised state. */
  async function useStubs(next: { chat?: Stub; converse?: Stub }): Promise<void> {
    if (next.chat) {
      chatStub = next.chat;
      process.env.BEDROCK_ENDPOINT_URL = next.chat.url;
    }
    if (next.converse) {
      converseStub = next.converse;
      process.env.AWS_ENDPOINT_URL = next.converse.url;
    }
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
    if (chatStub) await chatStub.close();
    if (converseStub) await converseStub.close();
    chatStub = undefined;
    converseStub = undefined;
    const { clearBedrockClient } = await import('../lib/bedrock.js');
    clearBedrockClient();
  });

  it('POSTs to /openai/v1/chat/completions with an explicit cache breakpoint on the instruction block', async () => {
    const stub = await startHttpStub(() => ({ status: 200, body: chatReply({ content: 'I hear you.' }) }));
    await useStubs({ chat: stub });

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent({
      systemInstruction: 'SYSTEM INSTRUCTIONS',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    });

    expect(stub.requests).toHaveLength(1);
    const sent = JSON.parse(stub.requests[0].body) as Record<string, unknown>;

    expect(stub.requests[0].method).toBe('POST');
    expect(stub.requests[0].path).toBe('/openai/v1/chat/completions');
    expect(sent.model).toBe('qwen.qwen3-32b-v1:0');

    // The breakpoint is the whole point: byte-identical prefix, billed once.
    expect(sent.messages).toEqual([
      {
        role: 'system',
        content: [
          { type: 'text', text: 'SYSTEM INSTRUCTIONS', prompt_cache_breakpoint: { mode: 'explicit' } },
        ],
      },
      { role: 'user', content: 'hello' },
    ]);
    expect(sent.prompt_cache_options).toEqual({ mode: 'explicit' });

    expect(result.text).toBe('I hear you.');
    expect(result.fallbackUsed).toBe(false);
    expect(result.model).toBe('qwen.qwen3-32b-v1:0');
  });

  it('reports the provider-billed token counts, including cache hits', async () => {
    const stub = await startHttpStub(() => ({
      status: 200,
      body: chatReply({ content: 'ok', cachedTokens: 2768, promptTokens: 2834 }),
    }));
    await useStubs({ chat: stub });

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(result.usage).toEqual({
      inputTokens: 2834,
      outputTokens: 12,
      totalTokens: 2846,
      cachedInputTokens: 2768,
    });
  });

  it('sends the caller schema as a forced function tool and returns the arguments as the answer', async () => {
    const payload = { safetyState: 'S2', crisis_language_detected: false, notes: null };
    const stub = await startHttpStub(() => ({
      status: 200,
      body: chatReply({ toolArguments: JSON.stringify(payload) }),
    }));
    await useStubs({ chat: stub });

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent({
      systemInstruction: 'classify',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: SAFETY_SCHEMA,
      },
    });

    const sent = JSON.parse(stub.requests[0].body) as {
      tools: Array<{ type: string; function: { name: string; parameters: Record<string, unknown> } }>;
      tool_choice: { type: string; function: { name: string } };
      response_format?: unknown;
    };

    expect(sent.tools).toHaveLength(1);
    expect(sent.tools[0].type).toBe('function');
    expect(sent.tools[0].function.name).toBe('emit_structured_json');
    expect(sent.tool_choice).toEqual({ type: 'function', function: { name: 'emit_structured_json' } });

    // The same converted schema the Converse path sends: lowercase types,
    // nullable widened to a union, provider-only keys dropped.
    const parameters = sent.tools[0].function.parameters as {
      type: string;
      properties: Record<string, { type: unknown }>;
      required: unknown;
      propertyOrdering?: unknown;
    };
    expect(parameters.type).toBe('object');
    expect(parameters.properties.safetyState.type).toBe('string');
    expect(parameters.properties.notes.type).toEqual(['string', 'null']);
    expect(parameters.propertyOrdering).toBeUndefined();
    expect(parameters.required).toEqual(['safetyState', 'crisis_language_detected']);
    expect(sent.response_format).toBeUndefined();

    expect(JSON.parse(result.text)).toEqual(payload);
    expect(result.fallbackUsed).toBe(false);
  });

  it('uses json_object mode, not a permissive tool, when JSON was asked for without a schema', async () => {
    const stub = await startHttpStub(() => ({ status: 200, body: chatReply({ content: '{"ok":true}' }) }));
    await useStubs({ chat: stub });

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    const sent = JSON.parse(stub.requests[0].body) as Record<string, unknown>;
    expect(sent.response_format).toEqual({ type: 'json_object' });
    expect(sent.tools).toBeUndefined();
    expect(sent.tool_choice).toBeUndefined();
    expect(result.text).toBe('{"ok":true}');
  });

  it('falls back to Converse when the surface refuses the call, and still answers', async () => {
    const refusal = await startHttpStub(() => ({
      status: 400,
      body: JSON.stringify({ message: 'unsupported' }),
    }));
    const fallback = await startHttp2Stub(() => ({ status: 200, body: converseReply('from converse') }));
    await useStubs({ chat: refusal, converse: fallback });

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(refusal.requests).toHaveLength(1);
    expect(refusal.requests[0].path).toBe('/openai/v1/chat/completions');
    expect(fallback.requests).toHaveLength(1);
    expect(fallback.requests[0].path).toBe('/model/qwen.qwen3-32b-v1%3A0/converse');
    expect(fallback.requests[0].body).toContain('inferenceConfig');

    expect(result.text).toBe('from converse');
    expect(result.fallbackUsed).toBe(false);
  });

  it('falls back to Converse when a schema was sent but the reply carried no tool call', async () => {
    const prose = await startHttpStub(() => ({
      status: 200,
      body: chatReply({ content: 'I think this is fine, honestly.' }),
    }));
    const fallback = await startHttp2Stub(() => ({
      status: 200,
      body: converseReply('{"safetyState":"S2"}'),
    }));
    await useStubs({ chat: prose, converse: fallback });

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent({
      systemInstruction: 'classify',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SAFETY_SCHEMA },
    });

    // The schema guarantee never depends on the cache surface: prose is not
    // scraped, the call is re-made where the schema is enforced.
    expect(prose.requests).toHaveLength(1);
    expect(fallback.requests).toHaveLength(1);
    expect(result.text).toBe('{"safetyState":"S2"}');
    expect(result.fallbackUsed).toBe(false);
  });

  it('fails closed with a timeout when the surface never answers', async () => {
    const stub = await startHttpStub(() => 'hang');
    await useStubs({ chat: stub });

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      timeoutMs: 250,
    });

    expect(result.text).toBe(SAFE_FALLBACK);
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('timeout');
  });

  it('skips the surface entirely when BEDROCK_PROMPT_CACHE=off', async () => {
    const stub = await startHttp2Stub(() => ({ status: 200, body: converseReply('converse only') }));
    await useStubs({ converse: stub });
    process.env.BEDROCK_PROMPT_CACHE = 'off';

    const { generateContent } = await import('../lib/bedrock.js');
    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0].path).toBe('/model/qwen.qwen3-32b-v1%3A0/converse');
    expect(result.text).toBe('converse only');
  });
});
