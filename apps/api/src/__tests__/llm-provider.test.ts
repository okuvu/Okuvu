import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSarvamConfigured, generateText } from '../lib/llm-provider.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/vertex-ai.js', () => {
  return {
    generateContent: mockGenerateContent,
  };
});

const originalEnv = { ...process.env };

describe('LLM provider abstraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.SARVAM_API_KEY;
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

    it('always returns provider gemini', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'ok', fallbackUsed: false });

      const result = await generateText(params);
      expect(result.provider).toBe('gemini');
    });

    it('calls generateContent with the correct structure', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'ok', fallbackUsed: false });

      await generateText(params);

      expect(mockGenerateContent).toHaveBeenCalledOnce();
      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toBe('You are a renderer.');
      expect(callArgs.contents).toEqual([
        { role: 'user', parts: [{ text: 'Patient shows improvement.' }] },
      ]);
    });

    it('passes through Gemini fallbackUsed flag', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'ok', fallbackUsed: true });

      const result = await generateText(params);
      expect(result.fallbackUsed).toBe(true);
    });

    it('passes through Gemini rendered text', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'That sounds really difficult.',
        fallbackUsed: false,
      });

      const result = await generateText(params);
      expect(result.text).toBe('That sounds really difficult.');
    });

    it('logs provider metadata when Sarvam is configured', async () => {
      process.env.SARVAM_API_KEY = 'test-key';
      mockGenerateContent.mockResolvedValue({ text: 'ok', fallbackUsed: false });

      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await generateText(params);

      expect(infoSpy).toHaveBeenCalledOnce();
      const [meta] = infoSpy.mock.calls[0];
      expect(meta).toMatchObject({ provider: 'sarvam', status: 'stub' });
      expect(JSON.stringify(infoSpy.mock.calls)).not.toContain(params.systemInstruction);
      expect(JSON.stringify(infoSpy.mock.calls)).not.toContain(params.text);

      infoSpy.mockRestore();
    });

    it('does not log when Sarvam is not configured', async () => {
      delete process.env.SARVAM_API_KEY;
      mockGenerateContent.mockResolvedValue({ text: 'ok', fallbackUsed: false });

      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await generateText(params);

      expect(infoSpy).not.toHaveBeenCalled();

      infoSpy.mockRestore();
    });
  });
});
