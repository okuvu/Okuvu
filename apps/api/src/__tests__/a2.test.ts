import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleTurn } from '../agents/a2/agent.js';
import type { A2Input } from '../agents/a2/types.js';
import { DEFAULT_MAX_OUTPUT_TOKENS } from '../lib/vertex-ai.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/vertex-ai.js', () => {
  return {
    generateContent: mockGenerateContent,
    DEFAULT_MAX_OUTPUT_TOKENS: 250,
  };
});

function makeInput(overrides: Partial<A2Input> = {}): A2Input {
  return {
    userId: 'user-1',
    message: 'I have been feeling anxious lately',
    carePlan: 'CP1',
    mode: 'normal',
    recentHistory: [],
    sessionSummary: null,
    ...overrides,
  };
}

describe('A2 Emotion Regulation Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CP1 / CP2 / CP3 care plan handling', () => {
    for (const cp of ['CP1', 'CP2', 'CP3'] as const) {
      it(`includes ${cp} care plan context in the prompt`, async () => {
        mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });

        await handleTurn(makeInput({ carePlan: cp }));

        const callArgs = mockGenerateContent.mock.calls[0][0];
        expect(callArgs.systemInstruction).toContain(`care plan ${cp}`);
      });

      it(`includes the ${cp} description in the prompt`, async () => {
        mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });

        await handleTurn(makeInput({ carePlan: cp }));

        const callArgs = mockGenerateContent.mock.calls[0][0];
        const descriptions: Record<string, string> = {
          CP1: 'psychoeducation',
          CP2: 'cognitive reappraisal',
          CP3: 'relapse prevention',
        };
        expect(callArgs.systemInstruction).toContain(descriptions[cp]);
      });
    }
  });

  describe('Turn 1 — empty context', () => {
    it('handles empty recentHistory gracefully', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Hello!', fallbackUsed: false });

      const result = await handleTurn(makeInput({ recentHistory: [], sessionSummary: null }));

      expect(result.response).toBe('Hello!');
      expect(result.fallbackUsed).toBe(false);
    });

    it('passes only the current message when no history exists', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Hello!', fallbackUsed: false });

      await handleTurn(makeInput({ recentHistory: [], sessionSummary: null }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.contents).toHaveLength(1);
      expect(callArgs.contents[0]).toEqual({
        role: 'user',
        parts: [{ text: 'I have been feeling anxious lately' }],
      });
    });

    it('excludes session summary from the prompt when null', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Hello!', fallbackUsed: false });

      await handleTurn(makeInput({ sessionSummary: null }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).not.toContain('Previous session');
    });
  });

  describe('recent_history awareness', () => {
    it('includes prior turns in the contents array', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Lets build on that.', fallbackUsed: false });

      await handleTurn(makeInput({
        recentHistory: [
          { role: 'user', content: 'I felt overwhelmed yesterday' },
          { role: 'assistant', content: 'That sounds tough. What helped?' },
          { role: 'user', content: 'I tried deep breathing' },
        ],
      }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.contents).toHaveLength(4);
      expect(callArgs.contents[0]).toEqual({
        role: 'user',
        parts: [{ text: 'I felt overwhelmed yesterday' }],
      });
      expect(callArgs.contents[1]).toEqual({
        role: 'model',
        parts: [{ text: 'That sounds tough. What helped?' }],
      });
      expect(callArgs.contents[2]).toEqual({
        role: 'user',
        parts: [{ text: 'I tried deep breathing' }],
      });
      expect(callArgs.contents[3]).toEqual({
        role: 'user',
        parts: [{ text: 'I have been feeling anxious lately' }],
      });
    });
  });

  describe('session_summary awareness', () => {
    it('includes session summary in the system instruction when provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Welcome back.', fallbackUsed: false });

      await handleTurn(makeInput({
        sessionSummary: 'User discussed workplace stress and identified triggers.',
      }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('Context from the previous session');
      expect(callArgs.systemInstruction).toContain('User discussed workplace stress and identified triggers.');
    });
  });

  describe('mode flag handling', () => {
    it('grounding-only mode constrains the prompt to grounding-focused support', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Lets try a grounding exercise.', fallbackUsed: false });

      await handleTurn(makeInput({ mode: 'grounding-only' }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('grounding exercises');
      expect(callArgs.systemInstruction).toContain('practical coping strategies');
    });

    it('alliance-building mode adds rapport-focused instructions', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I am glad you are here.', fallbackUsed: false });

      await handleTurn(makeInput({ mode: 'alliance-building' }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('therapeutic alliance');
      expect(callArgs.systemInstruction).toContain('validation, warmth');
    });

    it('normal mode does not add mode-specific instructions', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Tell me more.', fallbackUsed: false });

      await handleTurn(makeInput({ mode: 'normal' }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).not.toContain('grounding exercises');
      expect(callArgs.systemInstruction).not.toContain('therapeutic alliance');
    });

    it('grounding-only prompt includes user-pushback redirection guidance', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Lets try a grounding exercise.', fallbackUsed: false });

      await handleTurn(makeInput({ mode: 'grounding-only' }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('acknowledge their feelings');
      expect(callArgs.systemInstruction).toContain('gently guide');
      expect(callArgs.systemInstruction).toContain('Do not engage');
    });

    it('logs when grounding-only mode is active', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Lets ground ourselves.', fallbackUsed: false });

      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      await handleTurn(makeInput({ mode: 'grounding-only' }));

      expect(spy).toHaveBeenCalledWith(
        { mode: 'grounding-only' },
        'A2: grounding mode active for turn',
      );
      spy.mockRestore();
    });

    it('does not log grounding mode when mode is normal', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Tell me more.', fallbackUsed: false });

      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      await handleTurn(makeInput({ mode: 'normal' }));

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('Gemini timeout / failure fallback', () => {
    it('passes through fallback response from Vertex AI wrapper on timeout', async () => {
      mockGenerateContent.mockResolvedValue({
        text: "I'm here to support you. Could you tell me more about how you're feeling?",
        fallbackUsed: true,
      });

      const result = await handleTurn(makeInput());

      expect(result.response).toContain('here to support you');
      expect(result.fallbackUsed).toBe(true);
    });

    it('passes through fallback response from Vertex AI wrapper on API error', async () => {
      mockGenerateContent.mockResolvedValue({
        text: "I'm here to support you. Could you tell me more about how you're feeling?",
        fallbackUsed: true,
      });

      const result = await handleTurn(makeInput());

      expect(result.response).toBeTruthy();
      expect(result.fallbackUsed).toBe(true);
    });

    it('does not throw when Vertex AI wrapper returns fallback', async () => {
      mockGenerateContent.mockResolvedValue({
        text: "I'm here to support you.",
        fallbackUsed: true,
      });

      await expect(handleTurn(makeInput())).resolves.toBeDefined();
    });
  });

  describe('output token configuration', () => {
    it('exports max_output_tokens as 250', () => {
      expect(DEFAULT_MAX_OUTPUT_TOKENS).toBe(250);
    });
  });

  describe('output format', () => {
    it('returns plain conversational text as a string', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'That sounds really difficult.', fallbackUsed: false });

      const result = await handleTurn(makeInput());

      expect(typeof result.response).toBe('string');
      expect(result.response).toBe('That sounds really difficult.');
    });

    it('does not return JSON', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });

      const result = await handleTurn(makeInput());

      expect(result.response).not.toMatch(/^[{[]/);
    });
  });

  describe('prompt structural separation — onboarding vs conversational', () => {
    it('conversational prompt does not reference scoring', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Okay.', fallbackUsed: false });

      await handleTurn(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).not.toContain('scoring');
      expect(callArgs.systemInstruction).not.toContain('carePlan');
      expect(callArgs.systemInstruction).not.toContain('confidence');
    });
  });
});
