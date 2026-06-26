import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderText } from '../agents/a12/agent.js';
import type { RenderInput } from '../agents/a12/types.js';

const mockGenerateText = vi.hoisted(() => vi.fn());

vi.mock('../lib/llm-provider.js', () => {
  return {
    generateText: mockGenerateText,
  };
});

function makeInput(overrides: Partial<RenderInput> = {}): RenderInput {
  return {
    text: 'The patient demonstrates improved emotional regulation through cognitive reappraisal techniques.',
    ...overrides,
  };
}

describe('A12 Rendering Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('prompt construction', () => {
    it('calls generateText with the rendering prompt', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'You are doing better at managing your emotions.',
        fallbackUsed: false,
        provider: 'gemini',
      });

      await renderText(makeInput());

      const callArgs = mockGenerateText.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('Evia response renderer');
      expect(callArgs.systemInstruction).toContain('therapeutic');
      expect(callArgs.systemInstruction).toContain('conversational English');
    });

    it('passes input text to generateText', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'You are doing better at managing your emotions.',
        fallbackUsed: false,
        provider: 'gemini',
      });

      await renderText(makeInput({ text: 'Clinical observation: mood improved.' }));

      const callArgs = mockGenerateText.mock.calls[0][0];
      expect(callArgs.text).toBe('Clinical observation: mood improved.');
    });
  });

  describe('output passthrough', () => {
    it('returns the rendered text from the provider', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'You are doing better at managing your emotions.',
        fallbackUsed: false,
        provider: 'gemini',
      });

      const result = await renderText(makeInput());
      expect(result.text).toBe('You are doing better at managing your emotions.');
    });

    it('passes through fallbackUsed flag', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'I am here to support you.',
        fallbackUsed: true,
        provider: 'gemini',
      });

      const result = await renderText(makeInput());
      expect(result.fallbackUsed).toBe(true);
    });

    it('passes through provider name', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'You are doing better.',
        fallbackUsed: false,
        provider: 'gemini',
      });

      const result = await renderText(makeInput());
      expect(result.provider).toBe('gemini');
    });
  });

  describe('empty input', () => {
    it('still calls generateText with empty text', async () => {
      mockGenerateText.mockResolvedValue({
        text: '',
        fallbackUsed: false,
        provider: 'gemini',
      });

      const result = await renderText(makeInput({ text: '' }));
      expect(mockGenerateText).toHaveBeenCalledOnce();
      expect(result.text).toBe('');
    });
  });

  describe('rendering failure fallback', () => {
    it('returns original text when generateText rejects', async () => {
      const input = makeInput();
      mockGenerateText.mockRejectedValue(new Error('Provider failure'));

      const result = await renderText(input);

      expect(result.text).toBe(input.text);
      expect(result.fallbackUsed).toBe(true);
      expect(result.provider).toBe('gemini');
    });
  });
});
