import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockVertexGenerateContent = vi.hoisted(() => vi.fn());
const mockOpenRouterGenerateContent = vi.hoisted(() => vi.fn());
const mockBedrockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/vertex-ai.js', () => ({
  generateContent: mockVertexGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 2048,
  DEFAULT_TIMEOUT_MS: 30_000,
}));

vi.mock('../lib/openrouter.js', () => ({
  generateContent: mockOpenRouterGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 2048,
  DEFAULT_TIMEOUT_MS: 30_000,
}));

vi.mock('../lib/bedrock.js', () => ({
  generateContent: mockBedrockGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 2048,
  DEFAULT_TIMEOUT_MS: 30_000,
}));

import { generateContent } from '../lib/generate-content.js';

/**
 * The AWS seam added to the dispatcher, kept in its own file so the existing
 * `generate-content.test.ts` (which pins the OpenRouter/Vertex behaviour) is
 * untouched.
 */
describe('generate-content dispatcher — Bedrock seam', () => {
  const saved: Record<string, string | undefined> = {};
  const ENV_KEYS = ['OKUVU_LLM_PROVIDER', 'LLM_PROVIDER', 'OPENROUTER_API_KEY'] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    mockVertexGenerateContent.mockResolvedValue({
      text: 'gemini reply',
      fallbackUsed: false,
      model: 'gemini-2.5-flash',
      canned: false,
    });
    mockOpenRouterGenerateContent.mockResolvedValue({
      text: 'llama reply',
      fallbackUsed: false,
      model: 'meta-llama/llama-3.1-8b-instruct',
      canned: false,
    });
    mockBedrockGenerateContent.mockResolvedValue({
      text: 'bedrock reply',
      fallbackUsed: false,
      model: 'amazon.nova-pro-v1:0',
      canned: false,
    });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('dispatches to Bedrock when OKUVU_LLM_PROVIDER=bedrock — no API key needed', async () => {
    process.env.OKUVU_LLM_PROVIDER = 'bedrock';
    process.env.LLM_PROVIDER = 'openrouter';

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(mockBedrockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
    expect(mockVertexGenerateContent).not.toHaveBeenCalled();
    expect(result.text).toBe('bedrock reply');
  });

  it('lets Bedrock win over the legacy LLM_PROVIDER=gemini rollback', async () => {
    process.env.OKUVU_LLM_PROVIDER = 'bedrock';
    process.env.LLM_PROVIDER = 'gemini';

    await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(mockBedrockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockVertexGenerateContent).not.toHaveBeenCalled();
  });

  it('passes the params through untouched', async () => {
    process.env.OKUVU_LLM_PROVIDER = 'bedrock';
    const params = {
      systemInstruction: 'sys',
      contents: [{ role: 'user' as const, parts: [{ text: 'hi' }] }],
      timeoutMs: 1234,
      model: 'amazon.nova-lite-v1:0',
    };

    await generateContent(params);

    expect(mockBedrockGenerateContent).toHaveBeenCalledWith(params);
  });

  it('stays on the legacy provider when OKUVU_LLM_PROVIDER is unset', async () => {
    process.env.LLM_PROVIDER = 'gemini';

    await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });

    expect(mockBedrockGenerateContent).not.toHaveBeenCalled();
    expect(mockVertexGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('rejects a mistyped provider rather than silently calling another cloud', async () => {
    process.env.OKUVU_LLM_PROVIDER = 'aws';

    await expect(
      generateContent({
        systemInstruction: 'test',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      }),
    ).rejects.toThrow(/OKUVU_LLM_PROVIDER/);

    expect(mockBedrockGenerateContent).not.toHaveBeenCalled();
    expect(mockVertexGenerateContent).not.toHaveBeenCalled();
    expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
  });
});
