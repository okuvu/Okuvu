import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockBedrockGenerateEmbedding = vi.hoisted(() => vi.fn());

vi.mock('../lib/bedrock.js', () => ({
  generateEmbedding: mockBedrockGenerateEmbedding,
}));

import { generateEmbedding } from '../lib/embedding.js';

/**
 * Embeddings are Bedrock-only after the cutover: `embedding.ts` is a thin
 * delegate to `bedrock.generateEmbedding` (still a lazy import so
 * `@aws-sdk/client-bedrock-runtime` is not pulled into import-only consumers).
 *
 * The 768-dimension guard lives inside `bedrock.ts` and is tested there against
 * the real Titan/Cohere response shapes. Here the property under test is that
 * this seam neither re-implements that guard nor reshapes the vector: a
 * Bedrock-supplied vector passes through untouched (identity, not a copy) and a
 * Bedrock rejection surfaces unchanged.
 */
const ENV_KEYS = [
  'OKUVU_LLM_PROVIDER',
  'OKUVU_EMBEDDING_PROVIDER',
  'BEDROCK_EMBEDDING_MODEL_ID',
  'BEDROCK_EMBEDDING_DIMENSIONS',
] as const;

describe('embedding seam (Bedrock only)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    mockBedrockGenerateEmbedding.mockResolvedValue(new Array(768).fill(0.5));
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('delegates to bedrock.generateEmbedding with the text', async () => {
    await generateEmbedding('hello');

    expect(mockBedrockGenerateEmbedding).toHaveBeenCalledTimes(1);
    expect(mockBedrockGenerateEmbedding).toHaveBeenCalledWith('hello');
  });

  it('passes a 768-dim vector through unchanged', async () => {
    const vector = new Array(768).fill(0).map((_, index) => index / 1000);
    mockBedrockGenerateEmbedding.mockResolvedValue(vector);

    const result = await generateEmbedding('hello');

    expect(result).toHaveLength(768);
    expect(result).toBe(vector);
  });

  it('does not re-implement the dimension guard (bedrock owns it)', async () => {
    // A vector of the wrong width is rejected inside bedrock.ts, before this
    // seam ever sees it — so nothing here may silently pad, truncate or
    // re-validate. Proxying the value verbatim is the contract.
    const shortVector = [0.1, 0.2, 0.3];
    mockBedrockGenerateEmbedding.mockResolvedValue(shortVector);

    const result = await generateEmbedding('hello');

    expect(result).toBe(shortVector);
  });

  it('propagates bedrock’s dimension error unchanged', async () => {
    const dimensionError = new Error(
      'Bedrock embedding model amazon.titan-embed-text-v2:0 returned 1024 dimensions but ' +
        'BEDROCK_EMBEDDING_DIMENSIONS is 768 (SessionLog.summary_embedding is vector(768)).',
    );
    mockBedrockGenerateEmbedding.mockRejectedValue(dimensionError);

    await expect(generateEmbedding('hello')).rejects.toThrow(/returned 1024 dimensions/);
    expect(mockBedrockGenerateEmbedding).toHaveBeenCalledWith('hello');
  });

  it('propagates transport failures unchanged (no silent empty vector)', async () => {
    mockBedrockGenerateEmbedding.mockRejectedValue(new Error('bedrock unreachable'));

    await expect(generateEmbedding('hello')).rejects.toThrow('bedrock unreachable');
  });

  it('has no provider switch: retired OKUVU_* env vars cannot reroute embeddings', async () => {
    process.env.OKUVU_LLM_PROVIDER = 'vertex';
    process.env.OKUVU_EMBEDDING_PROVIDER = 'vertex';

    const result = await generateEmbedding('hello');

    expect(result).toHaveLength(768);
    expect(mockBedrockGenerateEmbedding).toHaveBeenCalledTimes(1);
  });
});
