import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSend = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn(() => ({ send: mockSend })),
  ConverseCommand: vi.fn((input: unknown) => ({ __type: 'ConverseCommand', input })),
  InvokeModelCommand: vi.fn((input: unknown) => ({ __type: 'InvokeModelCommand', input })),
}));

import { generateEmbedding } from '../lib/embedding.js';
import { clearBedrockClient } from '../lib/bedrock.js';

// Same behaviour classes the deleted cloud-SDK embedding tests asserted, now on
// the AWS path: a 768-dimension vector comes back, a malformed/empty response
// throws instead of returning a partial vector, a width mismatch against the
// pgvector column is refused, and SDK failures propagate to the caller.

const ENV_KEYS = [
  'BEDROCK_EMBEDDING_MODEL_ID',
  'BEDROCK_EMBEDDING_DIMENSIONS',
  'AWS_REGION',
] as const;

function vectorOf(length: number): number[] {
  return Array.from({ length }, (_, i) => (i + 1) / 1000);
}

function bodyOf(payload: unknown) {
  return { body: { transformToString: async () => JSON.stringify(payload) } };
}

describe('generateEmbedding (Bedrock Titan V2)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    clearBedrockClient();
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

  it('returns a 768-dimensional float array from Titan V2', async () => {
    mockSend.mockResolvedValue(bodyOf({ embedding: vectorOf(768) }));

    const result = await generateEmbedding('Test text to embed');

    expect(result).toHaveLength(768);
    expect(result[0]).toBeCloseTo(0.001, 5);
    expect(result[767]).toBeCloseTo(0.768, 3);

    const input = mockSend.mock.calls[0][0].input;
    expect(input.modelId).toBe('amazon.titan-embed-text-v2:0');
    expect(JSON.parse(input.body)).toEqual({
      inputText: 'Test text to embed',
      dimensions: 768,
      normalize: true,
    });
  });

  it('throws when the model returns an empty body', async () => {
    mockSend.mockResolvedValue({ body: { transformToString: async () => '' } });

    await expect(generateEmbedding('Test text')).rejects.toThrow(/returned an empty body/);
  });

  it('throws when the response carries no numeric vector', async () => {
    mockSend.mockResolvedValue(bodyOf({ embeddings: [] }));

    await expect(generateEmbedding('Test text')).rejects.toThrow(/contained no numeric vector/);
  });

  it('refuses a vector whose width does not match the pgvector column', async () => {
    mockSend.mockResolvedValue(bodyOf({ embedding: vectorOf(1536) }));

    await expect(generateEmbedding('Test text')).rejects.toThrow(/1536 dimensions/);
  });

  it('propagates SDK failures to the caller', async () => {
    mockSend.mockRejectedValue(new Error('AccessDeniedException'));

    await expect(generateEmbedding('Test text')).rejects.toThrow('AccessDeniedException');
  });
});
