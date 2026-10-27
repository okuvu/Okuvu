import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockVertexGenerateContent = vi.hoisted(() => vi.fn());
const mockOpenRouterGenerateContent = vi.hoisted(() => vi.fn());
const mockBedrockGenerateContent = vi.hoisted(() => vi.fn());
const mockPredict = vi.hoisted(() => vi.fn());
const mockBedrockGenerateEmbedding = vi.hoisted(() => vi.fn());

vi.mock('../lib/vertex-ai.js', () => ({
  generateContent: mockVertexGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 1000,
  DEFAULT_TIMEOUT_MS: 25_000,
}));

vi.mock('../lib/openrouter.js', () => ({
  generateContent: mockOpenRouterGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 1000,
  DEFAULT_TIMEOUT_MS: 25_000,
}));

vi.mock('../lib/bedrock.js', () => ({
  generateContent: mockBedrockGenerateContent,
  generateEmbedding: mockBedrockGenerateEmbedding,
  DEFAULT_MAX_OUTPUT_TOKENS: 1000,
  DEFAULT_TIMEOUT_MS: 25_000,
}));

vi.mock('@google-cloud/aiplatform', () => ({
  v1beta1: { PredictionServiceClient: vi.fn(() => ({ predict: mockPredict })) },
  protos: { google: { cloud: { aiplatform: { v1beta1: {} } } } },
}));

import { generateContent } from '../lib/generate-content.js';
import { generateEmbedding } from '../lib/embedding.js';
import {
  DEFAULT_AWS_REGION,
  DEFAULT_BEDROCK_MODEL_ID,
  resolveAwsRegion,
  resolveContentBackend,
  resolveEmbeddingDimensions,
  resolveLlmProvider,
} from '../lib/provider-config.js';

const ENV_KEYS = [
  'OKUVU_LLM_PROVIDER',
  'LLM_PROVIDER',
  'OPENROUTER_API_KEY',
  'AWS_REGION',
  'BEDROCK_MODEL_ID',
  'BEDROCK_EMBEDDING_DIMENSIONS',
] as const;

const params = {
  systemInstruction: 'test',
  contents: [{ role: 'user' as const, parts: [{ text: 'hi' }] }],
};

function vertexEmbeddingResponse(values: number[]) {
  return [
    {
      predictions: [
        {
          structValue: {
            fields: {
              embeddings: {
                structValue: {
                  fields: {
                    values: { listValue: { values: values.map((numberValue) => ({ numberValue })) } },
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

describe('worker provider seams', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    mockVertexGenerateContent.mockResolvedValue({ text: 'gemini reply', fallbackUsed: false });
    mockOpenRouterGenerateContent.mockResolvedValue({ text: 'llama reply', fallbackUsed: false });
    mockBedrockGenerateContent.mockResolvedValue({ text: 'bedrock reply', fallbackUsed: false });
    mockPredict.mockResolvedValue(vertexEmbeddingResponse([0.1, 0.2]));
    mockBedrockGenerateEmbedding.mockResolvedValue(new Array(768).fill(0.25));
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe('provider-config defaults', () => {
    it('defaults to vertex and ap-south-1', () => {
      expect(resolveLlmProvider()).toBe('vertex');
      expect(resolveContentBackend()).toBe('openrouter');
      expect(resolveAwsRegion()).toBe('ap-south-1');
      expect(DEFAULT_AWS_REGION).toBe('ap-south-1');
      expect(resolveEmbeddingDimensions()).toBe(768);
      expect(DEFAULT_BEDROCK_MODEL_ID).toBe('amazon.nova-pro-v1:0');
    });

    it('OKUVU_LLM_PROVIDER=bedrock beats LLM_PROVIDER=gemini', () => {
      process.env.OKUVU_LLM_PROVIDER = 'bedrock';
      process.env.LLM_PROVIDER = 'gemini';
      expect(resolveContentBackend()).toBe('bedrock');
    });

    it('keeps the LLM_PROVIDER=gemini rollback on Vertex', () => {
      process.env.LLM_PROVIDER = 'gemini';
      expect(resolveContentBackend()).toBe('vertex');
    });

    it('rejects an unrecognised provider', () => {
      process.env.OKUVU_LLM_PROVIDER = 'vertex-ai';
      expect(() => resolveLlmProvider()).toThrow(/OKUVU_LLM_PROVIDER/);
    });

    it('rejects a malformed AWS_REGION', () => {
      process.env.AWS_REGION = 'asia-south1';
      expect(() => resolveAwsRegion()).toThrow(/not a valid AWS region/);
    });
  });

  describe('generate-content dispatch', () => {
    it('uses OpenRouter by default (worker jobs unchanged)', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';

      const result = await generateContent(params);

      expect(mockOpenRouterGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockBedrockGenerateContent).not.toHaveBeenCalled();
      expect(result.text).toBe('llama reply');
    });

    it('dispatches to Bedrock without requiring OPENROUTER_API_KEY', async () => {
      process.env.OKUVU_LLM_PROVIDER = 'bedrock';

      const result = await generateContent(params);

      expect(mockBedrockGenerateContent).toHaveBeenCalledWith(params);
      expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
      expect(mockVertexGenerateContent).not.toHaveBeenCalled();
      expect(result.text).toBe('bedrock reply');
    });

    it('propagates a mistyped provider instead of calling any model', async () => {
      process.env.OKUVU_LLM_PROVIDER = 'bedrock ';
      process.env.OPENROUTER_API_KEY = 'test-key';

      // Trailing whitespace is trimmed, so this one still resolves to bedrock.
      await expect(generateContent(params)).resolves.toEqual({ text: 'bedrock reply', fallbackUsed: false });

      process.env.OKUVU_LLM_PROVIDER = 'bedrockx';
      await expect(generateContent(params)).rejects.toThrow(/OKUVU_LLM_PROVIDER/);
    });
  });

  describe('embedding dispatch', () => {
    it('uses Vertex by default', async () => {
      const result = await generateEmbedding('hello');

      expect(result).toEqual([0.1, 0.2]);
      expect(mockPredict).toHaveBeenCalledTimes(1);
      expect(mockBedrockGenerateEmbedding).not.toHaveBeenCalled();
    });

    it('delegates to Bedrock when OKUVU_LLM_PROVIDER=bedrock', async () => {
      process.env.OKUVU_LLM_PROVIDER = 'bedrock';

      const result = await generateEmbedding('hello');

      expect(result).toHaveLength(768);
      expect(mockBedrockGenerateEmbedding).toHaveBeenCalledWith('hello');
      expect(mockPredict).not.toHaveBeenCalled();
    });
  });
});
