import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSend = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn(() => ({ send: mockSend })),
  ConverseCommand: vi.fn((input: unknown) => ({ __type: 'ConverseCommand', input })),
  InvokeModelCommand: vi.fn((input: unknown) => ({ __type: 'InvokeModelCommand', input })),
}));

import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TIMEOUT_MS,
  generateContent,
  generateEmbedding,
  toBedrockJsonSchema,
} from '../lib/bedrock.js';
import { SAFE_FALLBACK } from '../lib/llm-types.js';

const ENV_KEYS = [
  'BEDROCK_MODEL_ID',
  'BEDROCK_EMBEDDING_MODEL_ID',
  'BEDROCK_EMBEDDING_DIMENSIONS',
  'AWS_REGION',
] as const;

function textReply(text: string) {
  return { output: { message: { role: 'assistant', content: [{ text }] } }, stopReason: 'end_turn' };
}

function vectorOf(length: number): number[] {
  return Array.from({ length }, (_, i) => (i + 1) / 1000);
}

describe('worker bedrock generateContent', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('keeps the worker’s own limits (1000 tokens / 25s)', async () => {
    expect(DEFAULT_MAX_OUTPUT_TOKENS).toBe(1000);
    expect(DEFAULT_TIMEOUT_MS).toBe(25_000);

    mockSend.mockResolvedValue(textReply('ok'));

    await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(mockSend.mock.calls[0][0].input.inferenceConfig.maxTokens).toBe(1000);
  });

  it('maps the shared request shape onto a Converse call', async () => {
    mockSend.mockResolvedValue(textReply('summary text'));

    const result = await generateContent({
      systemInstruction: 'SYSTEM',
      contents: [
        { role: 'user', parts: [{ text: 'transcript' }] },
        { role: 'model', parts: [{ text: 'ack' }] },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 500 },
    });

    const input = mockSend.mock.calls[0][0].input;
    expect(input.modelId).toBe('qwen.qwen3-32b-v1:0');
    expect(input.system).toEqual([{ text: 'SYSTEM' }]);
    expect(input.messages).toEqual([
      { role: 'user', content: [{ text: 'transcript' }] },
      { role: 'assistant', content: [{ text: 'ack' }] },
    ]);
    expect(input.inferenceConfig).toEqual({ maxTokens: 500, temperature: 0 });
    expect(result).toEqual({ text: 'summary text', fallbackUsed: false });
  });

  it('maps a responseSchema to a strict forced tool and returns the tool input as JSON', async () => {
    const payload = { summary_text: 'ok', safety_flags: { crisis: false } };
    mockSend.mockResolvedValue({
      output: {
        message: {
          role: 'assistant',
          content: [{ toolUse: { toolUseId: 't1', name: 'emit_structured_json', input: payload } }],
        },
      },
      stopReason: 'tool_use',
    });

    const result = await generateContent({
      systemInstruction: 'summarise',
      contents: [{ role: 'user', parts: [{ text: 'transcript' }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT' as const,
          properties: {
            summary_text: { type: 'STRING' as const },
            safety_flags: {
              type: 'OBJECT' as const,
              properties: { crisis: { type: 'BOOLEAN' as const } },
              required: ['crisis'],
            },
          },
          required: ['summary_text', 'safety_flags'],
        },
      },
    });

    const spec = mockSend.mock.calls[0][0].input.toolConfig.tools[0].toolSpec;
    expect(spec.strict).toBe(true);
    expect(spec.inputSchema.json.type).toBe('object');
    expect(spec.inputSchema.json.properties.safety_flags.type).toBe('object');
    expect(JSON.parse(result.text)).toEqual(payload);
    expect(result.fallbackUsed).toBe(false);
  });

  it('treats an empty completion as a fallback, not as a successful empty summary (E17-S4)', async () => {
    mockSend.mockResolvedValue({ output: { message: { role: 'assistant', content: [] } }, stopReason: 'end_turn' });

    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    // Before E17-S4 this returned `{ text: '', fallbackUsed: false }`: an empty
    // "success" that `summary.ts` only caught later, as a parse error, and which
    // the api's own copy of this module never produced. An empty candidate is a
    // technical failure (safety block, MAX_TOKENS, a tool call with no input),
    // so it now reports itself as one.
    expect(result).toEqual({
      text: SAFE_FALLBACK,
      fallbackUsed: true,
      failureReason: 'api_error',
      failureKind: 'unavailable',
    });
  });

  it('returns the curated fallback sentence with api_error when the SDK throws (E17-S4)', async () => {
    mockSend.mockRejectedValue(new Error('ModelNotReadyException'));

    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    // E17-S1 §7 recorded this asymmetry: the api returned SAFE_FALLBACK, the
    // worker returned ''. The worker now matches the api, and names the failure.
    expect(result).toEqual({
      text: SAFE_FALLBACK,
      fallbackUsed: true,
      failureReason: 'api_error',
      failureKind: 'unavailable',
    });
  });

  it('names a throttled call as throttled, not as a generic api error (E17-S4)', async () => {
    mockSend.mockRejectedValue(Object.assign(new Error('Too many requests'), { name: 'ThrottlingException' }));

    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(result.failureKind).toBe('throttled');
    expect(result.text).toBe(SAFE_FALLBACK);
  });

  it('aborts the in-flight call and reports a timeout', async () => {
    vi.useFakeTimers();
    try {
      mockSend.mockImplementation(
        (_cmd: unknown, options: { abortSignal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.abortSignal.addEventListener('abort', () =>
              reject(Object.assign(new Error('Request aborted'), { name: 'AbortError' })),
            );
          }),
      );

      const pending = generateContent({
        systemInstruction: 's',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        timeoutMs: 2_000,
      });

      await vi.advanceTimersByTimeAsync(2_000);
      const result = await pending;

      expect(result.fallbackUsed).toBe(true);
      expect(result.failureReason).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('honours BEDROCK_MODEL_ID over the default', async () => {
    process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0';
    mockSend.mockResolvedValue(textReply('ok'));

    await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(mockSend.mock.calls[0][0].input.modelId).toBe('amazon.nova-lite-v1:0');
  });
});

describe('worker bedrock generateEmbedding', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('returns a 768-dimensional vector from Titan V2', async () => {
    mockSend.mockResolvedValue({
      body: { transformToString: async () => JSON.stringify({ embedding: vectorOf(768) }) },
    });

    const result = await generateEmbedding('Test text to embed');

    expect(result).toHaveLength(768);
    expect(JSON.parse(mockSend.mock.calls[0][0].input.body)).toEqual({
      inputText: 'Test text to embed',
      dimensions: 768,
      normalize: true,
    });
  });

  it('refuses a vector whose width does not match the pgvector column', async () => {
    mockSend.mockResolvedValue({
      body: { transformToString: async () => JSON.stringify({ embedding: vectorOf(1536) }) },
    });

    await expect(generateEmbedding('x')).rejects.toThrow(/1536 dimensions/);
  });

  it('propagates SDK errors so the caller can retry or fail the job', async () => {
    mockSend.mockRejectedValue(new Error('ThrottlingException'));

    await expect(generateEmbedding('x')).rejects.toThrow('ThrottlingException');
  });

  it('decodes a raw Uint8Array body when transformToString is unavailable', async () => {
    mockSend.mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify({ embedding: vectorOf(768) })),
    });

    const result = await generateEmbedding('x');

    expect(result).toHaveLength(768);
  });
});

describe('worker toBedrockJsonSchema', () => {
  it('converts nested properties, arrays and nullable fields', () => {
    expect(
      toBedrockJsonSchema({
        type: 'OBJECT',
        properties: {
          a: { type: 'STRING', nullable: true },
          b: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: [],
      }),
    ).toEqual({
      type: 'object',
      properties: {
        a: { type: ['string', 'null'] },
        b: { type: 'array', items: { type: 'integer' } },
      },
    });
  });
});
