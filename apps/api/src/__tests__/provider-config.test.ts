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
  resolveSecretId,
  resolveSqsQueueUrl,
  validateAwsConfig,
} from '../lib/provider-config.js';

/**
 * Post-cutover the module has exactly one implementation per seam, so there is
 * no cloud-selecting provider switch left to assert on. What remains worth
 * pinning is the AWS resolution itself: region default + validation, model ids,
 * the pgvector embedding width, SQS URL parsing, Secrets Manager ids and the
 * boot-time missing-variable report. A leftover `OKUVU_*_PROVIDER` env var must
 * be inert.
 */
const ENV_KEYS = [
  'OKUVU_LLM_PROVIDER',
  'OKUVU_QUEUE_PROVIDER',
  'OKUVU_SECRETS_PROVIDER',
  'OKUVU_EMBEDDING_PROVIDER',
  'LLM_PROVIDER',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_SECRETS_PREFIX',
  'BEDROCK_MODEL_ID',
  'BEDROCK_EMBEDDING_MODEL_ID',
  'BEDROCK_EMBEDDING_DIMENSIONS',
  'SQS_QUEUE_URL',
  'SQS_SUMMARY_QUEUE_URL',
  'COGNITO_USER_POOL_ID',
  'COGNITO_CLIENT_ID',
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

  describe('retired provider switches', () => {
    it('is inert when a leftover OKUVU_*_PROVIDER env var is present', () => {
      process.env.OKUVU_LLM_PROVIDER = 'vertex';
      process.env.OKUVU_QUEUE_PROVIDER = 'cloudtasks';
      process.env.OKUVU_SECRETS_PROVIDER = 'gcp';
      process.env.OKUVU_EMBEDDING_PROVIDER = 'vertex';

      // Nothing flips: there is one implementation per seam now.
      expect(resolveAwsRegion()).toBe(DEFAULT_AWS_REGION);
      expect(resolveContentBackend()).toBe('openrouter');
      expect(resolveSqsQueueUrl()).toBeUndefined();
      expect(resolveSecretId('emergency-contact-key')).toBe('emergency-contact-key');
    });
  });

  describe('resolveContentBackend', () => {
    it('keeps the OpenRouter default when nothing is set', () => {
      expect(resolveContentBackend()).toBe('openrouter');
    });

    it('selects Bedrock when LLM_PROVIDER=bedrock', () => {
      process.env.LLM_PROVIDER = 'bedrock';
      expect(resolveContentBackend()).toBe('bedrock');
    });

    it('maps the retired LLM_PROVIDER=gemini value onto the OpenRouter default', () => {
      process.env.LLM_PROVIDER = 'gemini';
      expect(resolveContentBackend()).toBe('openrouter');
    });

    it('treats any unrecognised value as OpenRouter', () => {
      process.env.LLM_PROVIDER = 'something-unrecognized';
      expect(resolveContentBackend()).toBe('openrouter');
    });

    it('is not affected by the retired OKUVU_LLM_PROVIDER switch', () => {
      process.env.OKUVU_LLM_PROVIDER = 'bedrock';
      expect(resolveContentBackend()).toBe('openrouter');

      process.env.OKUVU_LLM_PROVIDER = 'vertex';
      process.env.LLM_PROVIDER = 'bedrock';
      expect(resolveContentBackend()).toBe('bedrock');
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

    it('treats an empty value as unset', () => {
      process.env.AWS_REGION = '   ';
      expect(resolveAwsRegion()).toBe(DEFAULT_AWS_REGION);
    });

    it('rejects a malformed region', () => {
      process.env.AWS_REGION = 'mumbai';
      expect(() => resolveAwsRegion()).toThrow(/not a valid AWS region/);

      process.env.AWS_REGION = 'ap-south';
      expect(() => resolveAwsRegion()).toThrow(/not a valid AWS region/);
    });
  });

  describe('Bedrock model ids', () => {
    it('defaults to in-region models', () => {
      expect(resolveBedrockModelId()).toBe(DEFAULT_BEDROCK_MODEL_ID);
      expect(DEFAULT_BEDROCK_MODEL_ID).toBe('qwen.qwen3-32b-v1:0');
      expect(resolveBedrockEmbeddingModelId()).toBe(DEFAULT_BEDROCK_EMBEDDING_MODEL_ID);
      expect(DEFAULT_BEDROCK_EMBEDDING_MODEL_ID).toBe('amazon.titan-embed-text-v2:0');
    });

    it('prefers the per-call model, then BEDROCK_MODEL_ID', () => {
      process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0';
      expect(resolveBedrockModelId()).toBe('amazon.nova-lite-v1:0');
      expect(resolveBedrockModelId('anthropic.claude-3-haiku-20240307-v1:0')).toBe(
        'anthropic.claude-3-haiku-20240307-v1:0',
      );
    });

    it('honours BEDROCK_EMBEDDING_MODEL_ID for the embedding model', () => {
      process.env.BEDROCK_EMBEDDING_MODEL_ID = 'cohere.embed-english-v3';
      expect(resolveBedrockEmbeddingModelId()).toBe('cohere.embed-english-v3');
    });

    it('rejects an explicitly empty model id', () => {
      process.env.BEDROCK_MODEL_ID = '   ';
      expect(() => resolveBedrockModelId()).toThrow(/BEDROCK_MODEL_ID/);

      process.env.BEDROCK_EMBEDDING_MODEL_ID = '';
      expect(() => resolveBedrockEmbeddingModelId()).toThrow(/BEDROCK_EMBEDDING_MODEL_ID/);
    });
  });

  describe('embedding dimensions', () => {
    it('defaults to the pgvector column width', () => {
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

      process.env.BEDROCK_EMBEDDING_DIMENSIONS = '-768';
      expect(() => resolveEmbeddingDimensions()).toThrow(/positive integer/);

      process.env.BEDROCK_EMBEDDING_DIMENSIONS = 'wide';
      expect(() => resolveEmbeddingDimensions()).toThrow(/positive integer/);
    });

    it('treats an empty value as unset', () => {
      process.env.BEDROCK_EMBEDDING_DIMENSIONS = '  ';
      expect(resolveEmbeddingDimensions()).toBe(DEFAULT_EMBEDDING_DIMENSIONS);
    });
  });

  describe('SQS_QUEUE_URL', () => {
    const url = 'https://sqs.ap-south-1.amazonaws.com/123456789012/evia-beta-summary-jobs';

    it('is undefined when unset', () => {
      expect(resolveSqsQueueUrl()).toBeUndefined();
    });

    it('treats an empty value as unset', () => {
      process.env.SQS_QUEUE_URL = '   ';
      expect(resolveSqsQueueUrl()).toBeUndefined();
    });

    it('parses a good queue URL', () => {
      process.env.SQS_QUEUE_URL = url;
      expect(resolveSqsQueueUrl()).toBe(url);
    });

    it('accepts SQS_QUEUE_URL and the SQS_SUMMARY_QUEUE_URL alias, preferring SQS_QUEUE_URL', () => {
      process.env.SQS_QUEUE_URL = url;
      expect(resolveSqsQueueUrl()).toBe(url);

      delete process.env.SQS_QUEUE_URL;
      process.env.SQS_SUMMARY_QUEUE_URL = url;
      expect(resolveSqsQueueUrl()).toBe(url);

      process.env.SQS_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/123456789012/other';
      expect(resolveSqsQueueUrl()).toBe('https://sqs.ap-south-1.amazonaws.com/123456789012/other');
    });

    it('allows http for LocalStack-style endpoints', () => {
      process.env.SQS_QUEUE_URL = 'http://localhost:4566/000000000000/summary';
      expect(resolveSqsQueueUrl()).toBe('http://localhost:4566/000000000000/summary');
    });

    it('rejects a non-URL value', () => {
      process.env.SQS_QUEUE_URL = 'not-a-url';
      expect(() => resolveSqsQueueUrl()).toThrow(/not a valid URL/);
    });

    it('rejects a non-http(s) scheme', () => {
      process.env.SQS_QUEUE_URL = 'ftp://sqs.ap-south-1.amazonaws.com/123456789012/q';
      expect(() => resolveSqsQueueUrl()).toThrow(/must be an http\(s\) URL/);
    });

    it('rejects a URL with no queue name path segment', () => {
      process.env.SQS_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/';
      expect(() => resolveSqsQueueUrl()).toThrow(/missing the queue name/);

      process.env.SQS_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com';
      expect(() => resolveSqsQueueUrl()).toThrow(/missing the queue name/);
    });
  });

  describe('secret ids', () => {
    it('uses the bare name when AWS_SECRETS_PREFIX is unset or empty', () => {
      expect(resolveSecretId('emergency-contact-key')).toBe('emergency-contact-key');

      process.env.AWS_SECRETS_PREFIX = '  ';
      expect(resolveSecretId('emergency-contact-key')).toBe('emergency-contact-key');
    });

    it('applies AWS_SECRETS_PREFIX, tolerating a trailing slash', () => {
      process.env.AWS_SECRETS_PREFIX = 'evia-beta/';
      expect(resolveSecretId('emergency-contact-key')).toBe('evia-beta/emergency-contact-key');

      process.env.AWS_SECRETS_PREFIX = 'evia-beta';
      expect(resolveSecretId('emergency-contact-key')).toBe('evia-beta/emergency-contact-key');

      process.env.AWS_SECRETS_PREFIX = ' evia-beta// ';
      expect(resolveSecretId('emergency-contact-key')).toBe('evia-beta/emergency-contact-key');
    });
  });

  describe('validateAwsConfig', () => {
    it('names every variable AWS cannot default', () => {
      expect(validateAwsConfig()).toEqual([
        'SQS_QUEUE_URL',
        'COGNITO_USER_POOL_ID',
        'COGNITO_CLIENT_ID',
      ]);
    });

    it('drops the queue URL once a valid one is set', () => {
      process.env.SQS_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/123456789012/q';
      expect(validateAwsConfig()).toEqual(['COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID']);
    });

    it('accepts the SQS_SUMMARY_QUEUE_URL alias as configured', () => {
      process.env.SQS_SUMMARY_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/1/q';
      expect(validateAwsConfig()).not.toContain('SQS_QUEUE_URL');
    });

    it('names the missing Cognito variables and is empty when everything is set', () => {
      process.env.SQS_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/123456789012/q';
      process.env.COGNITO_USER_POOL_ID = 'ap-south-1_abc123';
      expect(validateAwsConfig()).toEqual(['COGNITO_CLIENT_ID']);

      process.env.COGNITO_CLIENT_ID = 'client123';
      expect(validateAwsConfig()).toEqual([]);
    });

    it('treats a blank Cognito value as missing', () => {
      process.env.SQS_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/123456789012/q';
      process.env.COGNITO_USER_POOL_ID = '   ';
      process.env.COGNITO_CLIENT_ID = 'client123';

      expect(validateAwsConfig()).toEqual(['COGNITO_USER_POOL_ID']);
    });
  });
});
