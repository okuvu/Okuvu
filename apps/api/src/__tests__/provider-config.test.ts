import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  DEFAULT_AWS_REGION,
  DEFAULT_BEDROCK_EMBEDDING_MODEL_ID,
  DEFAULT_BEDROCK_MODEL_ID,
  DEFAULT_EMBEDDING_DIMENSIONS,
  resolveAwsRegion,
  resolveBedrockEmbeddingModelId,
  resolveBedrockModelId,
  resolveContentBackend,
  resolveEmbeddingDimensions,
  resolveEmbeddingProvider,
  resolveLlmProvider,
  resolveQueueProvider,
  resolveSecretId,
  resolveSecretsProvider,
  resolveSqsQueueUrl,
  validateAwsConfig,
} from '../lib/provider-config.js';

const ENV_KEYS = [
  'OKUVU_LLM_PROVIDER',
  'OKUVU_QUEUE_PROVIDER',
  'OKUVU_SECRETS_PROVIDER',
  'LLM_PROVIDER',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_SECRETS_PREFIX',
  'BEDROCK_MODEL_ID',
  'BEDROCK_EMBEDDING_MODEL_ID',
  'BEDROCK_EMBEDDING_DIMENSIONS',
  'SQS_QUEUE_URL',
  'SQS_SUMMARY_QUEUE_URL',
] as const;

describe('provider-config', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
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

  describe('provider selection', () => {
    it('defaults every seam to the pre-migration GCP provider', () => {
      expect(resolveLlmProvider()).toBe('vertex');
      expect(resolveQueueProvider()).toBe('cloudtasks');
      expect(resolveSecretsProvider()).toBe('gcp');
      expect(resolveEmbeddingProvider()).toBe('vertex');
    });

    it('treats an empty value as unset (so an empty env var cannot change behaviour)', () => {
      process.env.OKUVU_LLM_PROVIDER = '';
      process.env.OKUVU_QUEUE_PROVIDER = '   ';
      process.env.OKUVU_SECRETS_PROVIDER = '';

      expect(resolveLlmProvider()).toBe('vertex');
      expect(resolveQueueProvider()).toBe('cloudtasks');
      expect(resolveSecretsProvider()).toBe('gcp');
    });

    it('accepts the AWS providers, case-insensitively', () => {
      process.env.OKUVU_LLM_PROVIDER = 'Bedrock';
      process.env.OKUVU_QUEUE_PROVIDER = 'SQS';
      process.env.OKUVU_SECRETS_PROVIDER = 'AWS';

      expect(resolveLlmProvider()).toBe('bedrock');
      expect(resolveQueueProvider()).toBe('sqs');
      expect(resolveSecretsProvider()).toBe('aws');
      expect(resolveEmbeddingProvider()).toBe('bedrock');
    });

    it('throws on an unrecognised provider rather than silently using GCP', () => {
      process.env.OKUVU_LLM_PROVIDER = 'gemini';
      expect(() => resolveLlmProvider()).toThrow(/OKUVU_LLM_PROVIDER="gemini"/);

      delete process.env.OKUVU_LLM_PROVIDER;
      process.env.OKUVU_QUEUE_PROVIDER = 'sqs-queue';
      expect(() => resolveQueueProvider()).toThrow(/OKUVU_QUEUE_PROVIDER/);

      delete process.env.OKUVU_QUEUE_PROVIDER;
      process.env.OKUVU_SECRETS_PROVIDER = 'gcp-secret-manager';
      expect(() => resolveSecretsProvider()).toThrow(/OKUVU_SECRETS_PROVIDER/);
    });
  });

  describe('resolveContentBackend', () => {
    it('keeps the OpenRouter default when nothing is set', () => {
      expect(resolveContentBackend()).toBe('openrouter');
    });

    it('keeps the existing LLM_PROVIDER=gemini rollback on Vertex', () => {
      process.env.LLM_PROVIDER = 'gemini';
      expect(resolveContentBackend()).toBe('vertex');
    });

    it('lets OKUVU_LLM_PROVIDER=bedrock win over LLM_PROVIDER', () => {
      process.env.OKUVU_LLM_PROVIDER = 'bedrock';
      process.env.LLM_PROVIDER = 'gemini';
      expect(resolveContentBackend()).toBe('bedrock');
    });

    it('stays on OpenRouter when OKUVU_LLM_PROVIDER=vertex and LLM_PROVIDER is openrouter', () => {
      process.env.OKUVU_LLM_PROVIDER = 'vertex';
      process.env.LLM_PROVIDER = 'openrouter';
      expect(resolveContentBackend()).toBe('openrouter');
    });
  });

  describe('AWS_REGION', () => {
    it('defaults to ap-south-1', () => {
      expect(resolveAwsRegion()).toBe(DEFAULT_AWS_REGION);
      expect(DEFAULT_AWS_REGION).toBe('ap-south-1');
    });

    it('accepts AWS_REGION and falls back to AWS_DEFAULT_REGION', () => {
      process.env.AWS_REGION = 'ap-southeast-1';
      expect(resolveAwsRegion()).toBe('ap-southeast-1');

      delete process.env.AWS_REGION;
      process.env.AWS_DEFAULT_REGION = 'us-east-1';
      expect(resolveAwsRegion()).toBe('us-east-1');
    });

    it('rejects a malformed region', () => {
      process.env.AWS_REGION = 'mumbai';
      expect(() => resolveAwsRegion()).toThrow(/not a valid AWS region/);
    });
  });

  describe('Bedrock model ids', () => {
    it('defaults to an in-region model', () => {
      expect(resolveBedrockModelId()).toBe(DEFAULT_BEDROCK_MODEL_ID);
      expect(resolveBedrockEmbeddingModelId()).toBe(DEFAULT_BEDROCK_EMBEDDING_MODEL_ID);
    });

    it('prefers the per-call model, then BEDROCK_MODEL_ID', () => {
      process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0';
      expect(resolveBedrockModelId()).toBe('amazon.nova-lite-v1:0');
      expect(resolveBedrockModelId('anthropic.claude-3-haiku-20240307-v1:0')).toBe(
        'anthropic.claude-3-haiku-20240307-v1:0',
      );
    });

    it('rejects an explicitly empty model id', () => {
      process.env.BEDROCK_MODEL_ID = '   ';
      expect(() => resolveBedrockModelId()).toThrow(/BEDROCK_MODEL_ID/);
    });

    it('defaults embedding width to the pgvector column width', () => {
      expect(resolveEmbeddingDimensions()).toBe(768);
      expect(DEFAULT_EMBEDDING_DIMENSIONS).toBe(768);
    });

    it('accepts a positive integer width and rejects anything else', () => {
      process.env.BEDROCK_EMBEDDING_DIMENSIONS = '1024';
      expect(resolveEmbeddingDimensions()).toBe(1024);

      process.env.BEDROCK_EMBEDDING_DIMENSIONS = '1024.5';
      expect(() => resolveEmbeddingDimensions()).toThrow(/positive integer/);

      process.env.BEDROCK_EMBEDDING_DIMENSIONS = '0';
      expect(() => resolveEmbeddingDimensions()).toThrow(/positive integer/);
    });
  });

  describe('SQS_QUEUE_URL', () => {
    const url = 'https://sqs.ap-south-1.amazonaws.com/123456789012/evia-beta-summary-jobs';

    it('is undefined when unset (the default cloudtasks path never needs it)', () => {
      expect(resolveSqsQueueUrl()).toBeUndefined();
    });

    it('accepts SQS_QUEUE_URL and the SQS_SUMMARY_QUEUE_URL alias', () => {
      process.env.SQS_QUEUE_URL = url;
      expect(resolveSqsQueueUrl()).toBe(url);

      delete process.env.SQS_QUEUE_URL;
      process.env.SQS_SUMMARY_QUEUE_URL = url;
      expect(resolveSqsQueueUrl()).toBe(url);
    });

    it('allows http for LocalStack-style endpoints', () => {
      process.env.SQS_QUEUE_URL = 'http://localhost:4566/000000000000/summary';
      expect(resolveSqsQueueUrl()).toBe('http://localhost:4566/000000000000/summary');
    });

    it('rejects a non-URL value and a URL with no queue name', () => {
      process.env.SQS_QUEUE_URL = 'not-a-url';
      expect(() => resolveSqsQueueUrl()).toThrow(/not a valid URL/);

      process.env.SQS_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/';
      expect(() => resolveSqsQueueUrl()).toThrow(/missing the queue name/);
    });
  });

  describe('secret ids', () => {
    it('uses the bare name by default (same name in both clouds)', () => {
      expect(resolveSecretId('emergency-contact-key')).toBe('emergency-contact-key');
    });

    it('applies AWS_SECRETS_PREFIX, tolerating a trailing slash', () => {
      process.env.AWS_SECRETS_PREFIX = 'evia-beta/';
      expect(resolveSecretId('emergency-contact-key')).toBe('evia-beta/emergency-contact-key');

      process.env.AWS_SECRETS_PREFIX = 'evia-beta';
      expect(resolveSecretId('emergency-contact-key')).toBe('evia-beta/emergency-contact-key');
    });
  });

  describe('validateAwsConfig', () => {
    it('reports nothing on the default cloudtasks path', () => {
      expect(validateAwsConfig()).toEqual([]);
    });

    it('reports the missing queue URL when SQS is selected', () => {
      process.env.OKUVU_QUEUE_PROVIDER = 'sqs';
      expect(validateAwsConfig()).toEqual(['SQS_QUEUE_URL']);

      process.env.SQS_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/1/q';
      expect(validateAwsConfig()).toEqual([]);
    });
  });
});
