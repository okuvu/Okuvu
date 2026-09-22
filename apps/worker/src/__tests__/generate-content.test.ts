import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockVertexGenerateContent = vi.hoisted(() => vi.fn());
const mockOpenRouterGenerateContent = vi.hoisted(() => vi.fn());

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

import { generateContent, resolveProvider } from '../lib/generate-content.js';

describe('generate-content dispatcher (worker)', () => {
  const originalProvider = process.env.LLM_PROVIDER;
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    mockVertexGenerateContent.mockResolvedValue({ text: 'gemini reply', fallbackUsed: false });
    mockOpenRouterGenerateContent.mockResolvedValue({ text: 'llama reply', fallbackUsed: false });
  });

  afterEach(() => {
    if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = originalProvider;
    if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalApiKey;
  });

  it('defaults to openrouter when LLM_PROVIDER is unset', () => {
    delete process.env.LLM_PROVIDER;
    expect(resolveProvider()).toBe('openrouter');
  });

  it('resolves to gemini when LLM_PROVIDER=gemini', () => {
    process.env.LLM_PROVIDER = 'gemini';
    expect(resolveProvider()).toBe('gemini');
  });

  it('treats any non-"gemini" value as openrouter', () => {
    process.env.LLM_PROVIDER = 'something-unrecognized';
    expect(resolveProvider()).toBe('openrouter');
  });

  it('dispatches to vertex-ai when LLM_PROVIDER=gemini', async () => {
    process.env.LLM_PROVIDER = 'gemini';

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(mockVertexGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
    expect(result.text).toBe('gemini reply');
  });

  it('dispatches to openrouter when LLM_PROVIDER=openrouter and an API key is set (the default)', async () => {
    process.env.LLM_PROVIDER = 'openrouter';
    process.env.OPENROUTER_API_KEY = 'test-key';

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(mockOpenRouterGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockVertexGenerateContent).not.toHaveBeenCalled();
    expect(result.text).toBe('llama reply');
  });

  it('throws when LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is missing', async () => {
    process.env.LLM_PROVIDER = 'openrouter';
    delete process.env.OPENROUTER_API_KEY;

    await expect(
      generateContent({
        systemInstruction: 'test',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      }),
    ).rejects.toThrow(/OPENROUTER_API_KEY/);

    expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
  });
});
