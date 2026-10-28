import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockBedrockGenerateContent = vi.hoisted(() => vi.fn());
const mockOpenRouterGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/bedrock.js', () => ({
  generateContent: mockBedrockGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 1000,
  DEFAULT_TIMEOUT_MS: 25_000,
}));

vi.mock('../lib/openrouter.js', () => ({
  generateContent: mockOpenRouterGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 1000,
  DEFAULT_TIMEOUT_MS: 25_000,
}));

import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TIMEOUT_MS,
  generateContent,
} from '../lib/generate-content.js';

const params = {
  systemInstruction: 'test',
  contents: [{ role: 'user' as const, parts: [{ text: 'hi' }] }],
};

describe('generate-content dispatcher (worker)', () => {
  const ENV_KEYS = ['LLM_PROVIDER', 'OPENROUTER_API_KEY'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    mockBedrockGenerateContent.mockResolvedValue({ text: 'bedrock reply', fallbackUsed: false });
    mockOpenRouterGenerateContent.mockResolvedValue({ text: 'llama reply', fallbackUsed: false });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('defaults to Bedrock', async () => {
    const result = await generateContent(params);

    expect(mockBedrockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockBedrockGenerateContent).toHaveBeenCalledWith(params);
    expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
    expect(result.text).toBe('bedrock reply');
  });

  it('does not need OPENROUTER_API_KEY on the default path', async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(generateContent(params)).resolves.toEqual({
      text: 'bedrock reply',
      fallbackUsed: false,
    });
  });

  it('honours an explicit LLM_PROVIDER=openrouter with a key', async () => {
    process.env.LLM_PROVIDER = 'openrouter';
    process.env.OPENROUTER_API_KEY = 'test-key';

    const result = await generateContent(params);

    expect(mockOpenRouterGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockBedrockGenerateContent).not.toHaveBeenCalled();
    expect(result.text).toBe('llama reply');
  });

  it('treats any other LLM_PROVIDER value as Bedrock', async () => {
    process.env.LLM_PROVIDER = 'something-unrecognized';
    process.env.OPENROUTER_API_KEY = 'test-key';

    const result = await generateContent(params);

    expect(mockBedrockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
    expect(result.text).toBe('bedrock reply');
  });

  it('throws when LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is missing', async () => {
    process.env.LLM_PROVIDER = 'openrouter';
    delete process.env.OPENROUTER_API_KEY;

    await expect(generateContent(params)).rejects.toThrow(/OPENROUTER_API_KEY/);

    expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
    expect(mockBedrockGenerateContent).not.toHaveBeenCalled();
  });

  it('re-exports the shared limits instead of defining its own', () => {
    expect(DEFAULT_MAX_OUTPUT_TOKENS).toBe(1000);
    expect(DEFAULT_TIMEOUT_MS).toBe(25_000);
  });
});
