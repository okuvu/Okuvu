import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateContent, DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TIMEOUT_MS } from '../lib/vertex-ai.js';

const originalEnv = { ...process.env };

describe('Vertex AI wrapper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.USE_CANNED_LLM_RESPONSE;
  });

  describe('canned response bypass', () => {
    it('returns canned response when USE_CANNED_LLM_RESPONSE is true', async () => {
      process.env.USE_CANNED_LLM_RESPONSE = 'true';
      process.env.CANNED_LLM_RESPONSE = 'Canned reply';

      const result = await generateContent({
        systemInstruction: 'You are a bot.',
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      });

      expect(result.text).toBe('Canned reply');
      expect(result.fallbackUsed).toBe(true);
    });

    it('falls back to SAFE_FALLBACK when CANNED_LLM_RESPONSE is not set', async () => {
      process.env.USE_CANNED_LLM_RESPONSE = 'true';
      delete process.env.CANNED_LLM_RESPONSE;

      const result = await generateContent({
        systemInstruction: 'You are a bot.',
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      });

      expect(result.text).toBeTruthy();
      expect(result.fallbackUsed).toBe(true);
    });
  });

  describe('timeout config', () => {
    it('uses DEFAULT_TIMEOUT_MS when no custom timeout is provided', () => {
      expect(DEFAULT_TIMEOUT_MS).toBe(10000);
    });
  });

  describe('constants', () => {
    it('has max_output_tokens set to 250', () => {
      expect(DEFAULT_MAX_OUTPUT_TOKENS).toBe(250);
    });

    it('has a default timeout', () => {
      expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(0);
    });
  });
});
