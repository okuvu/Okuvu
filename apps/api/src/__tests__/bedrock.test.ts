import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSend = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  return {
    BedrockRuntimeClient: vi.fn(() => ({ send: mockSend })),
    ConverseCommand: vi.fn((input: unknown) => ({ __type: 'ConverseCommand', input })),
    InvokeModelCommand: vi.fn((input: unknown) => ({ __type: 'InvokeModelCommand', input })),
  };
});

import {
  generateContent,
  generateEmbedding,
  toBedrockJsonSchema,
} from '../lib/bedrock.js';

const SAFE_FALLBACK = "I'm here to support you. Could you tell me more about how you're feeling?";

const ENV_KEYS = [
  'BEDROCK_MODEL_ID',
  'BEDROCK_EMBEDDING_MODEL_ID',
  'BEDROCK_EMBEDDING_DIMENSIONS',
  'AWS_REGION',
  'USE_CANNED_LLM_RESPONSE',
] as const;

function textReply(text: string) {
  return { output: { message: { role: 'assistant', content: [{ text }] } }, stopReason: 'end_turn' };
}

function embeddingReply(vector: number[]) {
  return { body: { transformToString: async () => JSON.stringify({ embedding: vector }) } };
}

function vectorOf(length: number): number[] {
  return Array.from({ length }, (_, i) => (i + 1) / 1000);
}

describe('bedrock generateContent', () => {
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

  it('returns the assistant text and reports the resolved default model', async () => {
    mockSend.mockResolvedValue(textReply('I hear you. Tell me more.'));

    const result = await generateContent({
      systemInstruction: 'You are a helpful assistant.',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    });

    expect(result.text).toBe('I hear you. Tell me more.');
    expect(result.fallbackUsed).toBe(false);
    expect(result.failureReason).toBeUndefined();
    expect(result.model).toBe('amazon.nova-pro-v1:0');
    expect(result.canned).toBe(false);
  });

  it('maps the Vertex request shape onto a Converse call', async () => {
    mockSend.mockResolvedValue(textReply('ok'));

    await generateContent({
      systemInstruction: 'SYSTEM',
      contents: [
        { role: 'user', parts: [{ text: 'first' }] },
        { role: 'model', parts: [{ text: 'second' }] },
        { role: 'user', parts: [{ text: 'third' }] },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 321, topP: 0.9, topK: 40 },
    });

    const input = mockSend.mock.calls[0][0].input;

    expect(input.modelId).toBe('amazon.nova-pro-v1:0');
    expect(input.system).toEqual([{ text: 'SYSTEM' }]);
    expect(input.messages).toEqual([
      { role: 'user', content: [{ text: 'first' }] },
      { role: 'assistant', content: [{ text: 'second' }] },
      { role: 'user', content: [{ text: 'third' }] },
    ]);
    expect(input.inferenceConfig).toEqual({
      maxTokens: 321,
      temperature: 0,
      topP: 0.9,
      topK: 40,
    });
    expect(input.toolConfig).toBeUndefined();
  });

  it('honours an explicit per-call model and the BEDROCK_MODEL_ID default', async () => {
    mockSend.mockResolvedValue(textReply('ok'));

    await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    });

    expect(mockSend.mock.calls[0][0].input.modelId).toBe(
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
    );

    process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0';
    mockSend.mockClear();
    mockSend.mockResolvedValue(textReply('ok'));

    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(mockSend.mock.calls[0][0].input.modelId).toBe('amazon.nova-lite-v1:0');
    expect(result.model).toBe('amazon.nova-lite-v1:0');
  });

  describe('structured output via forced tool use', () => {
    const schema = {
      type: 'OBJECT' as const,
      properties: {
        safetyState: { type: 'STRING' as const },
        crisis_language_detected: { type: 'BOOLEAN' as const },
        notes: { type: 'STRING' as const, nullable: true },
        tags: { type: 'ARRAY' as const, items: { type: 'STRING' as const } },
      },
      required: ['safetyState', 'crisis_language_detected'],
      propertyOrdering: ['safetyState'],
    };

    it('sends the schema as a strict, forced tool in JSON Schema form', async () => {
      mockSend.mockResolvedValue({
        output: {
          message: {
            role: 'assistant',
            content: [{ toolUse: { toolUseId: 't1', name: 'emit_structured_json', input: { safetyState: 'S2' } } }],
          },
        },
        stopReason: 'tool_use',
      });

      await generateContent({
        systemInstruction: 'classify',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
      });

      const toolConfig = mockSend.mock.calls[0][0].input.toolConfig;
      const spec = toolConfig.tools[0].toolSpec;

      expect(spec.name).toBe('emit_structured_json');
      expect(spec.strict).toBe(true);
      expect(toolConfig.toolChoice).toEqual({ tool: { name: 'emit_structured_json' } });

      // Vertex's UPPERCASE types and Vertex-only keys must be gone.
      expect(spec.inputSchema.json.type).toBe('object');
      expect(spec.inputSchema.json.properties.safetyState.type).toBe('string');
      expect(spec.inputSchema.json.properties.crisis_language_detected.type).toBe('boolean');
      expect(spec.inputSchema.json.properties.notes.type).toEqual(['string', 'null']);
      expect(spec.inputSchema.json.properties.tags).toEqual({ type: 'array', items: { type: 'string' } });
      expect(spec.inputSchema.json.propertyOrdering).toBeUndefined();
      expect(spec.inputSchema.json.required).toEqual(['safetyState', 'crisis_language_detected']);
    });

    it('returns the tool input as the JSON result text', async () => {
      const payload = { safetyState: 'S2', crisis_language_detected: false, notes: null };
      mockSend.mockResolvedValue({
        output: {
          message: {
            role: 'assistant',
            content: [
              { text: 'Here is the classification:' },
              { toolUse: { toolUseId: 't1', name: 'emit_structured_json', input: payload } },
            ],
          },
        },
        stopReason: 'tool_use',
      });

      const result = await generateContent({
        systemInstruction: 'classify',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
      });

      expect(JSON.parse(result.text)).toEqual(payload);
      expect(result.fallbackUsed).toBe(false);
    });

    it('falls back to a permissive forced tool for JSON mode without a schema', async () => {
      mockSend.mockResolvedValue(textReply('{"ok":true}'));

      await generateContent({
        systemInstruction: 's',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        generationConfig: { responseMimeType: 'application/json' },
      });

      const spec = mockSend.mock.calls[0][0].input.toolConfig.tools[0].toolSpec;
      expect(spec.strict).toBeUndefined();
      expect(spec.inputSchema.json.type).toBe('object');
    });

    it('sends no toolConfig when the caller did not ask for JSON', async () => {
      mockSend.mockResolvedValue(textReply('plain'));

      await generateContent({
        systemInstruction: 's',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      });

      expect(mockSend.mock.calls[0][0].input.toolConfig).toBeUndefined();
    });
  });

  it('returns SAFE_FALLBACK when the model returns no content', async () => {
    mockSend.mockResolvedValue({ output: { message: { role: 'assistant', content: [] } }, stopReason: 'end_turn' });

    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(result.text).toBe(SAFE_FALLBACK);
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('api_error');
    expect(result.canned).toBe(false);
  });

  it('returns SAFE_FALLBACK when output is missing entirely', async () => {
    mockSend.mockResolvedValue({ stopReason: 'end_turn' });

    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(result.text).toBe(SAFE_FALLBACK);
    expect(result.fallbackUsed).toBe(true);
  });

  it('returns SAFE_FALLBACK with api_error when the SDK throws', async () => {
    mockSend.mockRejectedValue(new Error('ThrottlingException'));

    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(result.text).toBe(SAFE_FALLBACK);
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('api_error');
    expect(result.model).toBe('amazon.nova-pro-v1:0');
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
        timeoutMs: 5_000,
      });

      await vi.advanceTimersByTimeAsync(5_000);
      const result = await pending;

      expect(result.text).toBe(SAFE_FALLBACK);
      expect(result.fallbackUsed).toBe(true);
      expect(result.failureReason).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('short-circuits to the canned response without calling Bedrock', async () => {
    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      useCanned: true,
      cannedResponse: 'a canned reply',
    });

    expect(result.text).toBe('a canned reply');
    expect(result.canned).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    expect(result.model).toBe('amazon.nova-pro-v1:0');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('honours the global USE_CANNED_LLM_RESPONSE flag like vertex-ai.ts', async () => {
    process.env.USE_CANNED_LLM_RESPONSE = 'true';

    const result = await generateContent({
      systemInstruction: 's',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(result.canned).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('bedrock generateEmbedding', () => {
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

  it('calls Titan V2 with 768 dimensions and returns the vector', async () => {
    const vector = vectorOf(768);
    mockSend.mockResolvedValue(embeddingReply(vector));

    const result = await generateEmbedding('Test text to embed');

    expect(result).toHaveLength(768);
    expect(result[0]).toBeCloseTo(0.001, 5);
    expect(result[767]).toBeCloseTo(0.768, 3);

    const input = mockSend.mock.calls[0][0].input;
    expect(input.modelId).toBe('amazon.titan-embed-text-v2:0');
    expect(input.contentType).toBe('application/json');
    expect(JSON.parse(input.body)).toEqual({
      inputText: 'Test text to embed',
      dimensions: 768,
      normalize: true,
    });
  });

  it('omits dimensions/normalize for Titan V1', async () => {
    process.env.BEDROCK_EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v1';
    mockSend.mockResolvedValue(embeddingReply(vectorOf(768)));

    await generateEmbedding('x');

    expect(JSON.parse(mockSend.mock.calls[0][0].input.body)).toEqual({ inputText: 'x' });
  });

  it('rejects a vector whose width does not match the pgvector column', async () => {
    mockSend.mockResolvedValue(embeddingReply(vectorOf(1024)));

    await expect(generateEmbedding('x')).rejects.toThrow(/1024 dimensions/);
  });

  it('accepts a Cohere vector when the column width is configured to match', async () => {
    process.env.BEDROCK_EMBEDDING_MODEL_ID = 'cohere.embed-english-v3';
    process.env.BEDROCK_EMBEDDING_DIMENSIONS = '1024';
    mockSend.mockResolvedValue({
      body: { transformToString: async () => JSON.stringify({ embeddings: [vectorOf(1024)] }) },
    });

    const result = await generateEmbedding('x');

    expect(result).toHaveLength(1024);
    const input = mockSend.mock.calls[0][0].input;
    expect(JSON.parse(input.body)).toEqual({
      texts: ['x'],
      input_type: 'search_document',
      truncate: 'END',
    });
  });

  it('throws when the response body is empty', async () => {
    mockSend.mockResolvedValue({ body: { transformToString: async () => '' } });

    await expect(generateEmbedding('x')).rejects.toThrow(/empty body/);
  });

  it('throws when the response has no numeric vector', async () => {
    mockSend.mockResolvedValue({ body: { transformToString: async () => JSON.stringify({}) } });

    await expect(generateEmbedding('x')).rejects.toThrow(/no numeric vector/);
  });

  it('propagates SDK errors (callers decide how to degrade)', async () => {
    mockSend.mockRejectedValue(new Error('AccessDeniedException'));

    await expect(generateEmbedding('x')).rejects.toThrow('AccessDeniedException');
  });
});

describe('toBedrockJsonSchema', () => {
  it('converts nested object/array schemas and drops Vertex-only keys', () => {
    const converted = toBedrockJsonSchema({
      type: 'OBJECT',
      properties: {
        outer: {
          type: 'OBJECT',
          properties: { inner: { type: 'INTEGER' } },
          required: [],
          propertyOrdering: ['inner'],
        },
        list: { type: 'ARRAY', items: { type: 'NUMBER' } },
        nullableThing: { type: 'STRING', nullable: true },
      },
      required: ['outer'],
    });

    expect(converted).toEqual({
      type: 'object',
      properties: {
        outer: { type: 'object', properties: { inner: { type: 'integer' } } },
        list: { type: 'array', items: { type: 'number' } },
        nullableThing: { type: ['string', 'null'] },
      },
      required: ['outer'],
    });
  });

  it('keeps enum/description and lowercases unknown-by-casing types', () => {
    const converted = toBedrockJsonSchema({
      type: 'OBJECT',
      properties: {
        state: { type: 'STRING', enum: ['S2', 'S3'], description: 'safety state' },
      },
    });

    expect((converted.properties as Record<string, unknown>).state).toEqual({
      type: 'string',
      enum: ['S2', 'S3'],
      description: 'safety state',
    });
  });
});
