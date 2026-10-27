import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPredict = vi.hoisted(() => vi.fn());
const mockBedrockGenerateEmbedding = vi.hoisted(() => vi.fn());

vi.mock('@google-cloud/aiplatform', () => ({
  v1beta1: {
    PredictionServiceClient: vi.fn(() => ({ predict: mockPredict })),
  },
  protos: { google: { cloud: { aiplatform: { v1beta1: {} } } } },
}));

vi.mock('../lib/bedrock.js', () => ({
  generateEmbedding: mockBedrockGenerateEmbedding,
}));

import { generateEmbedding } from '../lib/embedding.js';

function vertexResponse(values: number[]) {
  return [
    {
      predictions: [
        {
          structValue: {
            fields: {
              embeddings: {
                structValue: {
                  fields: {
                    values: {
                      listValue: { values: values.map((numberValue) => ({ numberValue })) },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
  ];
}

const ENV_KEYS = ['OKUVU_LLM_PROVIDER'] as const;

describe('embedding provider seam', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    mockPredict.mockResolvedValue(vertexResponse([0.1, 0.2, 0.3]));
    mockBedrockGenerateEmbedding.mockResolvedValue(new Array(768).fill(0.5));
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('uses Vertex by default and never loads the Bedrock module', async () => {
    const result = await generateEmbedding('hello');

    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(mockPredict).toHaveBeenCalledTimes(1);
    expect(mockBedrockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it('delegates to the Bedrock implementation when OKUVU_LLM_PROVIDER=bedrock', async () => {
    process.env.OKUVU_LLM_PROVIDER = 'bedrock';

    const result = await generateEmbedding('hello');

    expect(result).toHaveLength(768);
    expect(mockBedrockGenerateEmbedding).toHaveBeenCalledWith('hello');
    expect(mockPredict).not.toHaveBeenCalled();
  });

  it('propagates Bedrock errors unchanged (no silent empty vector)', async () => {
    process.env.OKUVU_LLM_PROVIDER = 'bedrock';
    mockBedrockGenerateEmbedding.mockRejectedValue(new Error('dimension mismatch'));

    await expect(generateEmbedding('hello')).rejects.toThrow('dimension mismatch');
  });
});
