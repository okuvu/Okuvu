import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockBedrockGenerateContent = vi.hoisted(() => vi.fn());
const mockBedrockGenerateEmbedding = vi.hoisted(() => vi.fn());
const mockOpenRouterGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/bedrock.js', () => ({
  generateContent: mockBedrockGenerateContent,
  generateEmbedding: mockBedrockGenerateEmbedding,
  DEFAULT_MAX_OUTPUT_TOKENS: 1000,
  DEFAULT_TIMEOUT_MS: 25_000,
}));

vi.mock('../lib/openrouter.js', () => ({
  generateContent: mockOpenRouterGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 1000,
  DEFAULT_TIMEOUT_MS: 25_000,
}));

import { generateContent } from '../lib/generate-content.js';
import { generateEmbedding } from '../lib/embedding.js';
import * as providerConfig from '../lib/provider-config.js';
import {
  DEFAULT_AWS_REGION,
  DEFAULT_BEDROCK_EMBEDDING_MODEL_ID,
  DEFAULT_BEDROCK_MODEL_ID,
  DEFAULT_EMBEDDING_DIMENSIONS,
  resolveAwsRegion,
  resolveBedrockEmbeddingModelId,
  resolveBedrockModelId,
  resolveEmbeddingDimensions,
} from '../lib/provider-config.js';

/**
 * Pins the removal: after the AWS cutover there is no provider switch to flip.
 * This file used to assert the seam defaults (`OKUVU_LLM_PROVIDER` unset →
 * the legacy cloud, `=bedrock` → Bedrock). It now asserts the opposite — the
 * seam is gone, so the variable is inert and cannot resurrect a second cloud
 * backend through a typo, and the single implementation is the default.
 */

const ENV_KEYS = [
  'OKUVU_LLM_PROVIDER',
  'OKUVU_QUEUE_PROVIDER',
  'OKUVU_SECRETS_PROVIDER',
  'LLM_PROVIDER',
  'OPENROUTER_API_KEY',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'BEDROCK_MODEL_ID',
  'BEDROCK_EMBEDDING_MODEL_ID',
  'BEDROCK_EMBEDDING_DIMENSIONS',
] as const;

const params = {
  systemInstruction: 'test',
  contents: [{ role: 'user' as const, parts: [{ text: 'hi' }] }],
};

describe('worker provider seams — removed', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    mockBedrockGenerateContent.mockResolvedValue({ text: 'bedrock reply', fallbackUsed: false });
    mockOpenRouterGenerateContent.mockResolvedValue({ text: 'llama reply', fallbackUsed: false });
    mockBedrockGenerateEmbedding.mockResolvedValue(new Array(768).fill(0.25));
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe('the env switch no longer exists', () => {
    it('is inert for every value, including a valid-looking and a misspelled one', async () => {
      for (const value of ['openrouter', 'bedrock', 'bedrockx', '  ', 'true']) {
        vi.clearAllMocks();
        process.env.OKUVU_LLM_PROVIDER = value;

        await expect(generateContent(params)).resolves.toEqual({
          text: 'bedrock reply',
          fallbackUsed: false,
        });

        expect(mockBedrockGenerateContent).toHaveBeenCalledTimes(1);
        expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
      }
    });

    it('never throws on a value that used to be rejected as unrecognised', async () => {
      process.env.OKUVU_LLM_PROVIDER = 'not-a-provider';

      await expect(generateContent(params)).resolves.toEqual({
        text: 'bedrock reply',
        fallbackUsed: false,
      });
    });

    it('leaves the queue and secrets seams alone — the worker owns neither', async () => {
      process.env.OKUVU_QUEUE_PROVIDER = 'sqs';
      process.env.OKUVU_SECRETS_PROVIDER = 'aws';

      await expect(generateContent(params)).resolves.toEqual({
        text: 'bedrock reply',
        fallbackUsed: false,
      });
      expect(Object.keys(providerConfig)).not.toContain('resolveQueueProvider');
      expect(Object.keys(providerConfig)).not.toContain('resolveSecretsProvider');
    });

    it('exposes no provider resolver on the config module', () => {
      const exported = Object.keys(providerConfig);

      expect(exported).not.toContain('resolveLlmProvider');
      expect(exported).not.toContain('resolveEmbeddingProvider');
      expect(exported).not.toContain('resolveContentBackend');
      expect(exported).not.toContain('readProvider');
      // Nothing provider-shaped is exported at all: only AWS settings remain.
      expect(exported.every((name) => !/Provider/i.test(name))).toBe(true);
    });
  });

  describe('single implementation is the default', () => {
    it('completions go to Bedrock with nothing configured', async () => {
      const result = await generateContent(params);

      expect(mockBedrockGenerateContent).toHaveBeenCalledWith(params);
      expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
      expect(result.text).toBe('bedrock reply');
    });

    it('embeddings go straight to Bedrock Titan, no API key needed', async () => {
      const result = await generateEmbedding('hello');

      expect(result).toHaveLength(768);
      expect(mockBedrockGenerateEmbedding).toHaveBeenCalledWith('hello');
    });
  });

  describe('AWS settings resolve with documented defaults', () => {
    it('pins ap-south-1 and the Qwen3 32B / Titan V2 models', () => {
      expect(resolveAwsRegion()).toBe('ap-south-1');
      expect(DEFAULT_AWS_REGION).toBe('ap-south-1');
      expect(resolveBedrockModelId()).toBe('qwen.qwen3-32b-v1:0');
      expect(DEFAULT_BEDROCK_MODEL_ID).toBe('qwen.qwen3-32b-v1:0');
      expect(resolveBedrockEmbeddingModelId()).toBe('amazon.titan-embed-text-v2:0');
      expect(DEFAULT_BEDROCK_EMBEDDING_MODEL_ID).toBe('amazon.titan-embed-text-v2:0');
      expect(resolveEmbeddingDimensions()).toBe(768);
      expect(DEFAULT_EMBEDDING_DIMENSIONS).toBe(768);
    });

    it('lets BEDROCK_MODEL_ID / BEDROCK_EMBEDDING_MODEL_ID override the defaults', () => {
      process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0';
      process.env.BEDROCK_EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v1';

      expect(resolveBedrockModelId()).toBe('amazon.nova-lite-v1:0');
      expect(resolveBedrockEmbeddingModelId()).toBe('amazon.titan-embed-text-v1');
    });

    it('rejects a malformed AWS_REGION', () => {
      process.env.AWS_REGION = 'asia-south1';

      expect(() => resolveAwsRegion()).toThrow(/not a valid AWS region/);
    });

    it('rejects a non-positive embedding width', () => {
      process.env.BEDROCK_EMBEDDING_DIMENSIONS = '0';

      expect(() => resolveEmbeddingDimensions()).toThrow(/positive integer/);
    });
  });
});
