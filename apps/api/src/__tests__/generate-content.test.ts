import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

const mockOpenRouterGenerateContent = vi.hoisted(() => vi.fn());
const mockBedrockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/openrouter.js', () => ({
  generateContent: mockOpenRouterGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 2048,
  DEFAULT_TIMEOUT_MS: 30_000,
}));

import { generateContent, resolveProvider } from '../lib/generate-content.js';

/**
 * The dispatcher's only job after the cutover: pick Bedrock or OpenRouter.
 * `LLM_PROVIDER=bedrock` is the sole switch; everything else (including the
 * retired `gemini` value and the retired `OKUVU_LLM_PROVIDER` variable) lands
 * on OpenRouter. Bedrock is mocked with `vi.doMock` because the dispatcher
 * imports it lazily — that lazy import is itself part of the design (it keeps
 * `@aws-sdk/client-bedrock-runtime` out of the OpenRouter path and out of
 * apps/test-harness's bundle).
 */
describe('generate-content dispatcher', () => {
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

  describe('resolveProvider', () => {
    it('defaults to openrouter when LLM_PROVIDER is unset', () => {
      expect(resolveProvider()).toBe('openrouter');
    });

    it('resolves to openrouter for the retired gemini value', () => {
      process.env.LLM_PROVIDER = 'gemini';
      expect(resolveProvider()).toBe('openrouter');
    });

    it('resolves to openrouter for any unrecognised value', () => {
      process.env.LLM_PROVIDER = 'something-unrecognized';
      expect(resolveProvider()).toBe('openrouter');
    });

    it('resolves to bedrock for LLM_PROVIDER=bedrock only', () => {
      process.env.LLM_PROVIDER = 'bedrock';
      expect(resolveProvider()).toBe('bedrock');

      process.env.LLM_PROVIDER = 'Bedrock';
      expect(resolveProvider()).toBe('openrouter');
    });
  });

  describe('OpenRouter path (default)', () => {
    it('defaults to OpenRouter when LLM_PROVIDER is unset and a key is set', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';

      const result = await generateContent(params);

      expect(mockOpenRouterGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockOpenRouterGenerateContent).toHaveBeenCalledWith(params);
      expect(result.text).toBe('llama reply');
    });

    it('dispatches to OpenRouter for the retired LLM_PROVIDER=gemini value', async () => {
      process.env.LLM_PROVIDER = 'gemini';
      process.env.OPENROUTER_API_KEY = 'test-key';

      const result = await generateContent(params);

      expect(mockOpenRouterGenerateContent).toHaveBeenCalledTimes(1);
      expect(result.text).toBe('llama reply');
    });

    it('ignores the retired OKUVU_LLM_PROVIDER=bedrock switch', async () => {
      process.env.OKUVU_LLM_PROVIDER = 'bedrock';
      process.env.OPENROUTER_API_KEY = 'test-key';

      await generateContent(params);

      expect(mockOpenRouterGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockBedrockGenerateContent).not.toHaveBeenCalled();
    });

    it('throws when the OpenRouter key is missing, naming both remedies', async () => {
      await expect(generateContent(params)).rejects.toThrow(
        /LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is not set/,
      );

      await expect(generateContent(params)).rejects.toThrow(/LLM_PROVIDER=bedrock/);
      expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
    });

    it('does not throw for a missing key when the call is canned (per-call flag)', async () => {
      await generateContent({ ...params, useCanned: true, cannedResponse: 'canned' });

      expect(mockOpenRouterGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('does not throw for a missing key when the global canned flag is set', async () => {
      process.env.USE_CANNED_LLM_RESPONSE = 'true';

      await generateContent(params);

      expect(mockOpenRouterGenerateContent).toHaveBeenCalledTimes(1);
    });
  });

  describe('Bedrock path (LLM_PROVIDER=bedrock)', () => {
    beforeAll(() => {
      vi.doMock('../lib/bedrock.js', () => ({
        generateContent: mockBedrockGenerateContent,
        DEFAULT_MAX_OUTPUT_TOKENS: 2048,
        DEFAULT_TIMEOUT_MS: 30_000,
      }));
    });

    afterAll(() => {
      vi.doUnmock('../lib/bedrock.js');
      vi.resetModules();
    });

    it('dispatches to Bedrock without needing an OpenRouter key', async () => {
      process.env.LLM_PROVIDER = 'bedrock';

      const result = await generateContent(params);

      expect(mockBedrockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
      expect(result.text).toBe('bedrock reply');
      expect(result.model).toBe('amazon.nova-pro-v1:0');
    });

    it('passes the params through untouched', async () => {
      process.env.LLM_PROVIDER = 'bedrock';
      const bedrockParams = {
        systemInstruction: 'sys',
        contents: [{ role: 'user' as const, parts: [{ text: 'hi' }] }],
        timeoutMs: 1234,
        model: 'amazon.nova-lite-v1:0',
      };

      await generateContent(bedrockParams);

      expect(mockBedrockGenerateContent).toHaveBeenCalledWith(bedrockParams);
    });

    it('propagates a Bedrock failure unchanged (no silent OpenRouter fallback)', async () => {
      process.env.LLM_PROVIDER = 'bedrock';
      mockBedrockGenerateContent.mockRejectedValue(new Error('bedrock throttled'));

      await expect(generateContent(params)).rejects.toThrow('bedrock throttled');
      expect(mockOpenRouterGenerateContent).not.toHaveBeenCalled();
    });
  });
});
