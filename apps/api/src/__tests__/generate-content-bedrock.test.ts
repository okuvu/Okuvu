import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockOpenRouterGenerateContent = vi.hoisted(() => vi.fn());
const mockBedrockGenerateContent = vi.hoisted(() => vi.fn());

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

import { generateContent, resolveProvider } from '../lib/generate-content.js';

/**
 * Bedrock seam, kept in its own file so the default-path assertions in
 * `generate-content.test.ts` stay readable.
 *
 * Provider selection is `LLM_PROVIDER=bedrock` and nothing else: the
 * `OKUVU_LLM_PROVIDER` switch that used to front this seam is retired, so
 * setting it must not move traffic. the legacy provider is gone entirely — there is no
 * `vertex-ai.js` left to mock, and `gemini` now means OpenRouter.
 */
describe('generate-content dispatcher — Bedrock seam', () => {
  const saved: Record<string, string | undefined> = {};
  const ENV_KEYS = [
    'LLM_PROVIDER',
    'OKUVU_LLM_PROVIDER',
    'OPENROUTER_API_KEY',
    'USE_CANNED_LLM_RESPONSE',
  ] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
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

  const params = {
    systemInstruction: 'test',
    contents: [{ role: 'user' as const, parts: [{ text: 'hi' }] }],
  };

  it('dispatches to Bedrock when LLM_PROVIDER=bedrock — no API key needed', async () => {
    process.env.LLM_PROVIDER = 'bedrock';

    const result = await generateContent(params);

    expect(resolveProvider()).toBe('bedrock');
    expect(mockBedrockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
    expect(result.text).toBe('bedrock reply');
    expect(result.model).toBe('amazon.nova-pro-v1:0');
    expect(result.fallbackUsed).toBe(false);
  });

  it('passes the params through untouched', async () => {
    process.env.LLM_PROVIDER = 'bedrock';
    const bedrockParams = {
      systemInstruction: 'sys',
      contents: [{ role: 'user' as const, parts: [{ text: 'hi' }] }],
      timeoutMs: 1234,
      model: 'amazon.nova-lite-v1:0',
      generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
    };

    await generateContent(bedrockParams);

    expect(mockBedrockGenerateContent).toHaveBeenCalledWith(bedrockParams);
  });

  it('returns fallbackUsed:true from Bedrock as-is, without retrying on OpenRouter', async () => {
    process.env.LLM_PROVIDER = 'bedrock';
    mockBedrockGenerateContent.mockResolvedValue({
      text: 'safe fallback',
      fallbackUsed: true,
      failureReason: 'timeout',
      model: 'amazon.nova-pro-v1:0',
      canned: false,
    });

    const result = await generateContent(params);

    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('timeout');
    expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
  });

  it('leaves canned-mode handling to the Bedrock implementation', async () => {
    process.env.LLM_PROVIDER = 'bedrock';
    const cannedParams = { ...params, useCanned: true, cannedResponse: '{"ok":true}' };

    await generateContent(cannedParams);

    expect(mockBedrockGenerateContent).toHaveBeenCalledWith(cannedParams);
    expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
  });

  it('ignores the retired OKUVU_LLM_PROVIDER switch', async () => {
    process.env.OKUVU_LLM_PROVIDER = 'bedrock';
    process.env.OPENROUTER_API_KEY = 'test-key';

    await generateContent(params);

    expect(mockBedrockGenerateContent).not.toHaveBeenCalled();
    expect(mockOpenRouterGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('stays on OpenRouter when LLM_PROVIDER is unset', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';

    await generateContent(params);

    expect(mockBedrockGenerateContent).not.toHaveBeenCalled();
    expect(mockOpenRouterGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('maps the retired LLM_PROVIDER=gemini value onto OpenRouter', async () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.OPENROUTER_API_KEY = 'test-key';

    await generateContent(params);

    expect(mockBedrockGenerateContent).not.toHaveBeenCalled();
    expect(mockOpenRouterGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('fails loudly on the OpenRouter path when the key is missing, never falling back to Bedrock', async () => {
    process.env.LLM_PROVIDER = 'openrouter';

    await expect(generateContent(params)).rejects.toThrow(/OPENROUTER_API_KEY/);

    expect(mockBedrockGenerateContent).not.toHaveBeenCalled();
    expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
  });
});
