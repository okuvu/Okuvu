import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateContent } from '../lib/vertex-ai.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('@google-cloud/aiplatform', () => {
  return {
    v1beta1: {
      PredictionServiceClient: vi.fn(() => ({
        generateContent: mockGenerateContent,
      })),
    },
    protos: {
      google: {
        cloud: {
          aiplatform: {
            v1beta1: {},
          },
        },
      },
    },
  };
});

const SAFE_FALLBACK = "I'm here to support you. Could you tell me more about how you're feeling?";

describe('generateContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns SAFE_FALLBACK when Gemini returns empty text (thinking mode exhausted tokens)', async () => {
    mockGenerateContent.mockResolvedValue([
      {
        candidates: [
          {
            content: { parts: [] },
            finishReason: 'MAX_TOKENS',
          },
        ],
      },
    ]);

    const result = await generateContent({
      systemInstruction: 'You are a helpful assistant.',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    });

    expect(result.text).toBe(SAFE_FALLBACK);
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('api_error');
  });

  it('returns response text when Gemini returns valid content', async () => {
    mockGenerateContent.mockResolvedValue([
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'I hear you. Tell me more.' }],
            },
          },
        ],
      },
    ]);

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    });

    expect(result.text).toBe('I hear you. Tell me more.');
    expect(result.fallbackUsed).toBe(false);
  });

  it('returns SAFE_FALLBACK on API error', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API failure'));

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    });

    expect(result.text).toBe(SAFE_FALLBACK);
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureReason).toBe('api_error');
  });

  it('returns SAFE_FALLBACK when candidates array is missing', async () => {
    mockGenerateContent.mockResolvedValue([{}]);

    const result = await generateContent({
      systemInstruction: 'test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    });

    expect(result.text).toBe(SAFE_FALLBACK);
    expect(result.fallbackUsed).toBe(true);
  });

  describe('model resource path', () => {
    beforeEach(() => {
      mockGenerateContent.mockResolvedValue([
        {
          candidates: [
            {
              content: {
                parts: [{ text: 'ok' }],
              },
            },
          ],
        },
      ]);
    });

    it('wraps bare model name with full publisher resource path', async () => {
      await generateContent({
        systemInstruction: 'test',
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-2.5-flash',
      });

      const actualModel = mockGenerateContent.mock.calls[0][0].model;
      expect(actualModel).toMatch(
        /^projects\/evia-500215\/locations\/asia-south1\/publishers\/google\/models\/gemini-2\.5-flash$/,
      );
    });

    it('uses default Pro model when no model param provided', async () => {
      await generateContent({
        systemInstruction: 'test',
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      });

      const actualModel = mockGenerateContent.mock.calls[0][0].model;
      expect(actualModel).toMatch(
        /^projects\/evia-500215\/locations\/asia-south1\/publishers\/google\/models\//,
      );
    });
  });
});
