import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifySafety } from '../agents/a1/agent.js';
import type { A1Input } from '../agents/a1/types.js';
import { buildSafetyPrompt, SAFETY_RUBRIC } from '../agents/a1/prompts.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/vertex-ai.js', () => {
  return {
    generateContent: mockGenerateContent,
    DEFAULT_MAX_OUTPUT_TOKENS: 250,
    DEFAULT_TIMEOUT_MS: 10_000,
  };
});

function makeInput(overrides: Partial<A1Input> = {}): A1Input {
  return {
    message: 'I feel okay today',
    recentHistory: [],
    ...overrides,
  };
}

describe('A1 Safety Gate — classifySafety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('valid classifications (S0–S4)', () => {
    it('classifies normal message as S0', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{"safetyState":"S0"}', fallbackUsed: false });

      const result = await classifySafety(makeInput({ message: 'I had a great day' }));

      expect(result.safetyState).toBe('S0');
      expect(result.fallbackUsed).toBe(false);
    });

    it('classifies mild distress as S1', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{"safetyState":"S1"}', fallbackUsed: false });

      const result = await classifySafety(makeInput({ message: 'I am a bit nervous about my exam' }));

      expect(result.safetyState).toBe('S1');
      expect(result.fallbackUsed).toBe(false);
    });

    it('classifies moderate distress as S2', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{"safetyState":"S2"}', fallbackUsed: false });

      const result = await classifySafety(makeInput({ message: 'I have been struggling with anxiety all week' }));

      expect(result.safetyState).toBe('S2');
      expect(result.fallbackUsed).toBe(false);
    });

    it('classifies elevated risk as S3', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{"safetyState":"S3"}', fallbackUsed: false });

      const result = await classifySafety(makeInput({ message: 'I feel like nothing matters anymore' }));

      expect(result.safetyState).toBe('S3');
      expect(result.fallbackUsed).toBe(false);
    });
  });

  describe('S4 crisis detection — at least 3 distinct examples', () => {
    it('classifies explicit suicide intent as S4', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{"safetyState":"S4"}', fallbackUsed: false });

      const result = await classifySafety(makeInput({ message: 'I want to end my life' }));

      expect(result.safetyState).toBe('S4');
      expect(result.fallbackUsed).toBe(false);
    });

    it('classifies active crisis plan as S4', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{"safetyState":"S4"}', fallbackUsed: false });

      const result = await classifySafety(makeInput({ message: 'I have a plan to kill myself tonight' }));

      expect(result.safetyState).toBe('S4');
      expect(result.fallbackUsed).toBe(false);
    });

    it('classifies immediate self-harm language as S4', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{"safetyState":"S4"}', fallbackUsed: false });

      const result = await classifySafety(makeInput({ message: 'I am going to hurt myself right now' }));

      expect(result.safetyState).toBe('S4');
      expect(result.fallbackUsed).toBe(false);
    });
  });

  describe('timeout fallback', () => {
    it('returns S2 on timeout', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });

      const result = await classifySafety(makeInput());

      expect(result.safetyState).toBe('S2');
      expect(result.fallbackUsed).toBe(true);
    });

    it('logs gemini_timeout reason code on timeout', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });

      await classifySafety(makeInput());

      expect(spy).toHaveBeenCalledWith({ reason: 'gemini_timeout' }, expect.any(String));
      spy.mockRestore();
    });
  });

  describe('API error fallback', () => {
    it('returns S2 on API error', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'api_error' });

      const result = await classifySafety(makeInput());

      expect(result.safetyState).toBe('S2');
      expect(result.fallbackUsed).toBe(true);
    });

    it('logs gemini_api_error reason code on API failure', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'api_error' });

      await classifySafety(makeInput());

      expect(spy).toHaveBeenCalledWith({ reason: 'gemini_api_error' }, expect.any(String));
      spy.mockRestore();
    });
  });

  describe('malformed output fallback', () => {
    it('returns S2 when Gemini returns unparseable text', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'not valid json', fallbackUsed: false });

      const result = await classifySafety(makeInput());

      expect(result.safetyState).toBe('S2');
      expect(result.fallbackUsed).toBe(true);
    });

    it('returns S2 when safetyState is not a valid value', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{"safetyState":"S7"}', fallbackUsed: false });

      const result = await classifySafety(makeInput());

      expect(result.safetyState).toBe('S2');
      expect(result.fallbackUsed).toBe(true);
    });

    it('logs parse_failure reason code on malformed output', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGenerateContent.mockResolvedValue({ text: 'nope', fallbackUsed: false });

      await classifySafety(makeInput());

      expect(spy).toHaveBeenCalledWith({ reason: 'parse_failure', text: 'nope' }, expect.any(String));
      spy.mockRestore();
    });
  });

  describe('fallback NEVER returns S0', () => {
    it('timeout fallback is not S0', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });

      const result = await classifySafety(makeInput());

      expect(result.safetyState).not.toBe('S0');
    });

    it('API error fallback is not S0', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'api_error' });

      const result = await classifySafety(makeInput());

      expect(result.safetyState).not.toBe('S0');
    });

    it('malformed output fallback is not S0', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{{{bad', fallbackUsed: false });

      const result = await classifySafety(makeInput());

      expect(result.safetyState).not.toBe('S0');
    });
  });

  describe('very short message', () => {
    it('calls Gemini for "hi" — no shortcut logic', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{"safetyState":"S0"}', fallbackUsed: false });

      await classifySafety(makeInput({ message: 'hi' }));

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('classifies "hi" as genuine S0', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{"safetyState":"S0"}', fallbackUsed: false });

      const result = await classifySafety(makeInput({ message: 'hi' }));

      expect(result.safetyState).toBe('S0');
      expect(result.fallbackUsed).toBe(false);
    });
  });

  describe('input validation', () => {
    it('returns S2 fallback when generateContent rejects', async () => {
      mockGenerateContent.mockRejectedValue(new Error('Network failure'));

      const result = await classifySafety(makeInput());

      expect(result.safetyState).toBe('S2');
      expect(result.fallbackUsed).toBe(true);
    });
  });

  describe('A1 never returns user-facing conversational text', () => {
    it('output is always { safetyState, fallbackUsed } — never prose', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{"safetyState":"S0"}', fallbackUsed: false });

      const result = await classifySafety(makeInput());

      expect(Object.keys(result).sort()).toEqual(['fallbackUsed', 'safetyState']);
      expect(typeof result.safetyState).toBe('string');
      expect(typeof result.fallbackUsed).toBe('boolean');
    });

    it('fallback output is still { safetyState, fallbackUsed }', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });

      const result = await classifySafety(makeInput());

      expect(Object.keys(result).sort()).toEqual(['fallbackUsed', 'safetyState']);
    });
  });

  describe('A1_FALLBACK_STATE constant', () => {
    it('is S2', async () => {
      // import the constant via agent module — test via behavior
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });

      const result = await classifySafety(makeInput());

      expect(result.safetyState).toBe('S2');
    });
  });

  describe('prompt construction', () => {
    it('includes the safety rubric', () => {
      const prompt = buildSafetyPrompt({ message: 'hello' });

      expect(prompt).toContain('safety classification system');
      expect(prompt).toContain('S0');
      expect(prompt).toContain('S1');
      expect(prompt).toContain('S2');
      expect(prompt).toContain('S3');
      expect(prompt).toContain('S4');
    });

    it('includes at least 3 S4 crisis examples in the prompt', () => {
      const prompt = buildSafetyPrompt({ message: 'hello' });

      const crisisExamples = [
        'I want to end my life',
        'I have a plan to kill myself tonight',
        'I am going to hurt myself right now',
        "I've already taken pills",
        "I'm standing on the edge of a bridge",
      ];
      for (const example of crisisExamples) {
        expect(prompt).toContain(example);
      }
    });

    it('instructs ambiguous S2/S3 to choose S3 (safer)', () => {
      const prompt = buildSafetyPrompt({ message: 'hello' });

      expect(prompt).toContain('S3');
      expect(prompt).toContain('safer');
      expect(prompt).toContain('higher');
    });

    it('includes the user message', () => {
      const prompt = buildSafetyPrompt({ message: 'I feel anxious' });

      expect(prompt).toContain('I feel anxious');
    });

    it('includes recent history when provided', () => {
      const prompt = buildSafetyPrompt({
        message: 'I feel anxious',
        recentHistory: [
          { role: 'user', content: 'I had a bad day' },
          { role: 'assistant', content: 'That sounds tough' },
        ],
      });

      expect(prompt).toContain('I had a bad day');
      expect(prompt).toContain('That sounds tough');
      expect(prompt).toContain('Recent conversation context');
    });
  });
});
