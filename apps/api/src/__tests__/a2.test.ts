import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleTurn, parseA2Response } from '../agents/a2/agent.js';
import type { A2Input, S06Signal } from '../agents/a2/types.js';

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
    safetyState: 'S1',
    sessionNumber: 2,
    turnNumber: 1,
    sessionHistorySummary: null,
    perceivedIntensity: null,
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

  describe('context variable injection', () => {
    it('replaces ${care_plan} in the prompt', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });

      await handleTurn(makeInput({ carePlan: 'CP2' }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('CP2');
    });

    it('replaces ${safety_state} in the prompt', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });

      await handleTurn(makeInput({ safetyState: 'S0' }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('S0');
    });

    it('replaces ${session_number} in the prompt', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });

      await handleTurn(makeInput({ sessionNumber: 5 }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('session_number: 5');
    });

    it('replaces ${turn_number} in the prompt', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });

      await handleTurn(makeInput({ turnNumber: 3 }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('turn_number: 3');
    });

    it('replaces ${session_history_summary} with value when provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Welcome back.', fallbackUsed: false });

      await handleTurn(makeInput({
        sessionHistorySummary: 'User discussed workplace stress.',
      }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('session_history_summary: User discussed workplace stress.');
    });

    it('replaces ${session_history_summary} with "null" when not provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Hello!', fallbackUsed: false });

      await handleTurn(makeInput({ sessionHistorySummary: null }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('session_history_summary: null');
    });

    it('replaces ${perceived_intensity} with value when provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I see.', fallbackUsed: false });

      await handleTurn(makeInput({ perceivedIntensity: 7 }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('7');
    });

    it('replaces ${perceived_intensity} with "null" when not provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I see.', fallbackUsed: false });

      await handleTurn(makeInput({ perceivedIntensity: null }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('null');
    });
  });

  describe('Turn 1 — empty context', () => {
    it('handles empty recentHistory gracefully', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Hello!', fallbackUsed: false });

      const result = await handleTurn(makeInput({ recentHistory: [], sessionHistorySummary: null }));

      expect(result.userContent).toBe('Hello!');
      expect(result.fallbackUsed).toBe(false);
    });

    it('passes only the current message when no history exists', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Hello!', fallbackUsed: false });

      await handleTurn(makeInput({ recentHistory: [], sessionHistorySummary: null }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.contents).toHaveLength(1);
      expect(callArgs.contents[0]).toEqual({
        role: 'user',
        parts: [{ text: 'I have been feeling anxious lately' }],
      });
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

  describe('Gemini timeout / failure fallback', () => {
    it('passes through fallback response from Vertex AI wrapper on timeout', async () => {
      mockGenerateContent.mockResolvedValue({
        text: "I'm here to support you. Could you tell me more about how you're feeling?",
        fallbackUsed: true,
      });

      const result = await handleTurn(makeInput());

      expect(result.userContent).toContain('here to support you');
      expect(result.fallbackUsed).toBe(true);
    });

    it('passes through fallback response from Vertex AI wrapper on API error', async () => {
      mockGenerateContent.mockResolvedValue({
        text: "I'm here to support you. Could you tell me more about how you're feeling?",
        fallbackUsed: true,
      });

      const result = await handleTurn(makeInput());

      expect(result.userContent).toBeTruthy();
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

  describe('S-06 signal parsing', () => {
    it('extracts user content and signal from a response with a JSON block', () => {
      const raw = `That sounds really difficult.\n\n\`\`\`json\n${JSON.stringify({
        signal: 'S-06',
        agent: 'A2',
        turn_number: 1,
        technique_used: 'T2',
        estimated_intensity: 6,
        intensity_direction: 'rising',
        mood_inference: { primary_emotion: 'anxiety', confidence: 'high' },
        session_flags: { crisis_language_detected: false, validation_only_turn: false, technique_refused_by_user: false },
        care_plan_fit: 'well_matched',
      })}\n\`\`\``;

      const parsed = parseA2Response(raw);

      expect(parsed.userContent).toBe('That sounds really difficult.');
      expect(parsed.signal).not.toBeNull();
      expect(parsed.signal!.estimated_intensity).toBe(6);
      expect(parsed.signal!.session_flags.crisis_language_detected).toBe(false);
      expect(parsed.signal!.care_plan_fit).toBe('well_matched');
    });

    it('returns userContent as-is when no JSON block is present', () => {
      const raw = 'Just a plain response.';

      const parsed = parseA2Response(raw);

      expect(parsed.userContent).toBe('Just a plain response.');
      expect(parsed.signal).toBeNull();
    });

    it('handles malformed JSON block gracefully', () => {
      const raw = 'Some text.\n\n```json\n{invalid json}\n```';

      const parsed = parseA2Response(raw);

      expect(parsed.userContent).toBe('Some text.');
      expect(parsed.signal).toBeNull();
    });

    describe('robust parsing against LLM output variations', () => {
      const validSignal: S06Signal = {
        signal: 'S-06',
        agent: 'A2',
        turn_number: 1,
        technique_used: 'T2',
        estimated_intensity: 6,
        intensity_direction: 'rising',
        mood_inference: { primary_emotion: 'anxiety', confidence: 'high' },
        session_flags: { crisis_language_detected: false, validation_only_turn: false, technique_refused_by_user: false },
        care_plan_fit: 'well_matched',
      };
      const jsonStr = JSON.stringify(validSignal);

      it('handles trailing spaces after ```json', () => {
        const raw = `I hear you.\n\n\`\`\`json   \n${jsonStr}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
      });

      it('handles \\r\\n line endings', () => {
        const raw = `I hear you.\r\n\r\n\`\`\`json\r\n${jsonStr}\r\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
      });

      it('handles missing final newline before closing fence', () => {
        const raw = `I hear you.\n\n\`\`\`json\n${jsonStr}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
      });

      it('handles uppercase JSON language identifier', () => {
        const raw = `I hear you.\n\n\`\`\`JSON\n${jsonStr}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
      });

      it('handles mixed-case JSON language identifier', () => {
        const raw = `I hear you.\n\n\`\`\`Json\n${jsonStr}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
      });

      it('handles extra content after closing fence', () => {
        const raw = `I hear you.\n\n\`\`\`json\n${jsonStr}\n\`\`\`\nSome trailing text.`;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
      });

      it('strips signal block from user content', () => {
        const raw = `I hear you.\n\`\`\`json\n${jsonStr}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.userContent).toBe('I hear you.');
      });

      it('handles signal JSON with no extra whitespace at all', () => {
        const raw = `Response text.\`\`\`json\n${jsonStr}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
      });

      it('handles content with multiple JSON blocks, extracting the first valid one', () => {
        const signal2 = { ...validSignal, estimated_intensity: 8, turn_number: 2 };
        const raw = `First response.\n\n\`\`\`json\n${jsonStr}\n\`\`\`\n\nSecond response.\n\n\`\`\`json\n${JSON.stringify(signal2)}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.userContent).toBe('First response.\n\nSecond response.');
      });

      it('returns null signal for non-JSON fence language', () => {
        const raw = `Some text.\n\n\`\`\`javascript\nconst x = 1;\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).toBeNull();
        expect(parsed.userContent).toBe('Some text.');
      });

      it('handles JSON inside a code block with no language identifier', () => {
        const raw = `I hear you.\n\n\`\`\`\n${jsonStr}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
      });

      it('handles signal on same line as opening fence (no newline after ```json)', () => {
        const raw = `I hear you.\n\n\`\`\`json{${jsonStr.slice(1, -1)}}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
      });

      it('handles 4-backtick fences (````json...````)', () => {
        const raw = `I hear you.\n\n\`\`\`\`json\n${jsonStr}\n\`\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
        expect(parsed.userContent).toBe('I hear you.');
      });

      it('strips content leak from 4-backtick fences in userContent', () => {
        const raw = `I hear you.\n\`\`\`\`json\n${jsonStr}\n\`\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.userContent).toBe('I hear you.');
        expect(parsed.userContent).not.toContain('estimated_intensity');
        expect(parsed.userContent).not.toContain('S-06');
      });

      it('handles inline JSON without any fences via fallback extraction', () => {
        const raw = `I hear you. ${jsonStr}`;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
      });

      it('defense-in-depth strips inline JSON from userContent when no fences present', () => {
        const raw = `I hear you. ${jsonStr}`;
        const parsed = parseA2Response(raw);
        expect(parsed.userContent).toBe('I hear you.');
        expect(parsed.userContent).not.toContain('estimated_intensity');
        expect(parsed.userContent).not.toContain('S-06');
      });

      it('handles content on same line as closing fence', () => {
        const raw = `Start.\n\`\`\`json\n${jsonStr}\n\`\`\` And some trailing text.`;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
        expect(parsed.userContent).toBe('Start.\nAnd some trailing text.');
      });

      it('handles missing closing fence (unclosed block at end)', () => {
        const raw = `Some text.\n\`\`\`json\n${jsonStr}`;
        const parsed = parseA2Response(raw);
        expect(parsed.userContent).toBe('Some text.');
        expect(parsed.userContent).not.toContain('estimated_intensity');
      });

      it('handles 4-backtick fences with no language identifier', () => {
        const raw = `I hear you.\n\`\`\`\`\n${jsonStr}\n\`\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
        expect(parsed.userContent).toBe('I hear you.');
      });

      it('strips JSON from userContent when LLM omits fences entirely', () => {
        const raw = `Some conversational text.\n${jsonStr}\nMore text.`;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.userContent).not.toContain('estimated_intensity');
        expect(parsed.userContent).not.toContain('"signal"');
      });

      it('handles open and close fences on the same line, preserving trailing content', () => {
        const raw = `Some text. before \`\`\`json ${jsonStr} \`\`\` and after.`;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.estimated_intensity).toBe(6);
        expect(parsed.userContent).toContain('Some text. before');
        expect(parsed.userContent).toContain('and after');
        expect(parsed.userContent).not.toContain('estimated_intensity');
        expect(parsed.userContent).not.toContain('"signal"');
      });
    });

    it('logs console.error when signal block is entirely missing', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const raw = 'Just a plain response.';
      parseA2Response(raw);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('logs console.error when JSON parse fails', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const raw = 'Some text.\n\n```json\n{invalid}\n```';
      parseA2Response(raw);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('tool result context injection', () => {
    it('appends toolResultContext to system instruction when provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'That sounds grounding.', fallbackUsed: false });

      const context = 'TOOL RESULT — The user just completed the 5-4-3-2-1 grounding exercise.\nSee: window, sky';

      await handleTurn(makeInput({ toolResultContext: context }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain(context);
    });

    it('does not include tool result context when not provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });

      await handleTurn(makeInput({ toolResultContext: undefined }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).not.toContain('TOOL RESULT');
    });
  });

  describe('output format', () => {
    it('returns plain conversational text as a string via userContent', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'That sounds really difficult.', fallbackUsed: false });

      const result = await handleTurn(makeInput());

      expect(typeof result.userContent).toBe('string');
      expect(result.userContent).toBe('That sounds really difficult.');
    });

    it('returns raw response property for logging/fallback', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });

      const result = await handleTurn(makeInput());

      expect(typeof result.response).toBe('string');
      expect(result.response).toBe('I hear you.');
    });
  });
});
