import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGenerateContent = vi.hoisted(() => vi.fn());
const mockResolveProvider = vi.hoisted(() =>
  vi.fn((): 'bedrock' | 'openrouter' => 'openrouter'),
);

vi.mock('../lib/generate-content.js', () => ({
  generateContent: mockGenerateContent,
  resolveProvider: () => mockResolveProvider(),
  DEFAULT_MAX_OUTPUT_TOKENS: 2048,
  DEFAULT_TIMEOUT_MS: 30_000,
}));

import { isSarvamConfigured, generateText } from '../lib/llm-provider.js';

/**
 * `llm-provider.ts` is a thin shim over the dispatcher. It must (a) still shape
 * the request the dispatcher expects, (b) report the backend the dispatcher
 * actually used — `bedrock` or `openrouter`, never the retired `gemini` — and
 * (c) keep the Sarvam stub log content-free.
 */
describe('LLM provider abstraction', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    saved.SARVAM_API_KEY = process.env.SARVAM_API_KEY;
    delete process.env.SARVAM_API_KEY;
    mockGenerateContent.mockResolvedValue({
      text: 'ok',
      fallbackUsed: false,
      model: 'meta-llama/llama-3.1-8b-instruct',
      canned: false,
    });
    mockResolveProvider.mockReturnValue('openrouter');
  });

  afterEach(() => {
    if (saved.SARVAM_API_KEY === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = saved.SARVAM_API_KEY;
  });

  describe('isSarvamConfigured', () => {
    it('returns false when SARVAM_API_KEY is absent', () => {
      delete process.env.SARVAM_API_KEY;
      expect(isSarvamConfigured()).toBe(false);
    });

    it('returns false when SARVAM_API_KEY is an empty string', () => {
      process.env.SARVAM_API_KEY = '';
      expect(isSarvamConfigured()).toBe(false);
    });

    it('returns true when SARVAM_API_KEY has a value', () => {
      process.env.SARVAM_API_KEY = 'some-key';
      expect(isSarvamConfigured()).toBe(true);
    });
  });

  describe('generateText', () => {
    const params = {
      systemInstruction: 'You are a renderer.',
      text: 'Patient shows improvement.',
    };

    it('calls generateContent with the correct structure', async () => {
      await generateText(params);

      expect(mockGenerateContent).toHaveBeenCalledOnce();
      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toBe('You are a renderer.');
      expect(callArgs.contents).toEqual([
        { role: 'user', parts: [{ text: 'Patient shows improvement.' }] },
      ]);
    });

    it('reports the provider the dispatcher resolved — openrouter by default', async () => {
      const result = await generateText(params);

      expect(result.provider).toBe('openrouter');
      expect(mockResolveProvider).toHaveBeenCalled();
    });

    it('reports bedrock when the dispatcher is on the Bedrock backend', async () => {
      mockResolveProvider.mockReturnValue('bedrock');

      const result = await generateText(params);

      expect(result.provider).toBe('bedrock');
    });

    it('never labels a result with the retired gemini provider', async () => {
      const result = await generateText(params);

      expect(['bedrock', 'openrouter']).toContain(result.provider);
      expect(result.provider).not.toBe('gemini');
    });

    it('passes through the fallbackUsed flag', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'ok',
        fallbackUsed: true,
        model: 'amazon.nova-pro-v1:0',
        canned: false,
      });

      const result = await generateText(params);
      expect(result.fallbackUsed).toBe(true);
    });

    it('passes through the rendered text', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'That sounds really difficult.',
        fallbackUsed: false,
        model: 'meta-llama/llama-3.1-8b-instruct',
        canned: false,
      });

      const result = await generateText(params);
      expect(result.text).toBe('That sounds really difficult.');
    });

    it('propagates a dispatcher failure (no fabricated text)', async () => {
      mockGenerateContent.mockRejectedValue(new Error('OPENROUTER_API_KEY is not set'));

      await expect(generateText(params)).rejects.toThrow(/OPENROUTER_API_KEY/);
    });

    it('logs content-free provider metadata when Sarvam is configured', async () => {
      process.env.SARVAM_API_KEY = 'test-key';
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await generateText(params);

      expect(infoSpy).toHaveBeenCalledOnce();
      const [meta, message] = infoSpy.mock.calls[0];
      expect(meta).toMatchObject({ provider: 'sarvam', status: 'stub' });
      // The stub message must not promise a Gemini fallback that no longer exists.
      expect(String(message)).toMatch(/Sarvam/);
      expect(String(message)).not.toMatch(/Gemini/i);
      expect(JSON.stringify(infoSpy.mock.calls)).not.toContain(params.systemInstruction);
      expect(JSON.stringify(infoSpy.mock.calls)).not.toContain(params.text);

      infoSpy.mockRestore();
    });

    it('does not log when Sarvam is not configured', async () => {
      delete process.env.SARVAM_API_KEY;
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await generateText(params);

      expect(infoSpy).not.toHaveBeenCalled();

      infoSpy.mockRestore();
    });
  });
});
