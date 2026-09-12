import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleTurn, parseA2Response } from '../agents/a2/agent.js';
import type { A2Input, S07Signal } from '../agents/a2/types.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/generate-content.js', () => {
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
    sessionHistorySummary: null,
    perceivedIntensity: null,
    recentHistory: [],
    sessionSummary: null,
    ...overrides,
  };
}

describe('A2 Support Companion (OKUVU v2.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('context variable injection', () => {
    it('replaces ${safety_state} in the prompt', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });

      await handleTurn(makeInput({ safetyState: 'S0' }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('safety_state: S0');
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

    it('replaces ${retrieved_context} with value when provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I see.', fallbackUsed: false });

      await handleTurn(makeInput({
        retrievedContext: '[Relevant past session — 5 days ago]: User discussed work stress.',
      }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain(
        'retrieved_context: [Relevant past session — 5 days ago]: User discussed work stress.',
      );
    });

    it('replaces ${retrieved_context} with "null" when not provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I see.', fallbackUsed: false });

      await handleTurn(makeInput({ retrievedContext: undefined }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('retrieved_context: null');
    });

    it('replaces ${therapist_name} with value when provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I see.', fallbackUsed: false });

      await handleTurn(makeInput({ therapistName: 'Dr. Mehta' }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('Dr. Mehta');
    });

    it('replaces ${therapist_name} with "null" when not provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I see.', fallbackUsed: false });

      await handleTurn(makeInput({ therapistName: undefined }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('therapist_name: null');
    });

    it('replaces ${care_plan_focus} with value when provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I see.', fallbackUsed: false });

      await handleTurn(makeInput({ carePlanFocus: 'anxiety around exams' }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('anxiety around exams');
    });

    it('replaces ${homework} with value when provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I see.', fallbackUsed: false });

      await handleTurn(makeInput({ homework: '5-4-3-2-1 grounding before bed' }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('5-4-3-2-1 grounding before bed');
    });

    it('replaces ${toolkit} with a joined list when provided', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I see.', fallbackUsed: false });

      await handleTurn(makeInput({ toolkit: ['box_breathing', 'grounding_5431'] }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('box_breathing, grounding_5431');
    });

    it('falls back to the always-available-tools note when toolkit is empty', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I see.', fallbackUsed: false });

      await handleTurn(makeInput({ toolkit: [] }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('always-available tools');
    });

    it('replaces ${language_mode} with "english" by default', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I see.', fallbackUsed: false });

      await handleTurn(makeInput({ languageMode: undefined }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('language_mode: english');
    });

    it('replaces ${language_mode} with "mirror" when set', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I see.', fallbackUsed: false });

      await handleTurn(makeInput({ languageMode: 'mirror' }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('language_mode: mirror');
    });
  });

  describe('continuous chat — no turn/session numbering (OKUVU v2.0)', () => {
    it('never mentions a turn cap or session-closure script in the prompt', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });

      await handleTurn(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).not.toContain('Sessions are capped at 10 turns');
      expect(callArgs.systemInstruction).not.toContain('TURN CAP');
    });

    it('A2Input has no sessionNumber/turnNumber fields', () => {
      const input = makeInput();
      expect(input).not.toHaveProperty('sessionNumber');
      expect(input).not.toHaveProperty('turnNumber');
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

    it('passes through failureReason from the Vertex AI wrapper', async () => {
      mockGenerateContent.mockResolvedValue({
        text: "I'm here to support you. Could you tell me more about how you're feeling?",
        fallbackUsed: true,
        failureReason: 'timeout',
      });

      const result = await handleTurn(makeInput());

      expect(result.failureReason).toBe('timeout');
    });

    it('leaves failureReason undefined on a normal (non-fallback) reply', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });

      const result = await handleTurn(makeInput());

      expect(result.failureReason).toBeUndefined();
    });
  });

  describe('model/prompt version attribution', () => {
    it('propagates the resolved model from the Vertex AI wrapper as modelVersion', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false, model: 'gemini-2.5-flash' });

      const result = await handleTurn(makeInput());

      expect(result.modelVersion).toBe('gemini-2.5-flash');
    });

    it('reports the A2 conversational prompt version', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false, model: 'gemini-2.5-flash' });

      const result = await handleTurn(makeInput());

      expect(result.promptVersion).toBe('v2.0');
    });

    it('propagates canned:true from the Vertex AI wrapper', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'a canned reply',
        fallbackUsed: false,
        model: 'gemini-2.5-flash',
        canned: true,
      });

      const result = await handleTurn(makeInput());

      expect(result.canned).toBe(true);
    });

    it('propagates canned:false for a real (non-canned) reply', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'I hear you.',
        fallbackUsed: false,
        model: 'gemini-2.5-flash',
        canned: false,
      });

      const result = await handleTurn(makeInput());

      expect(result.canned).toBe(false);
    });
  });

  describe('S-07 signal parsing (OKUVU v2.0 — supersedes S-06)', () => {
    const validSignal: S07Signal = {
      signal: 'S-07',
      agent: 'A2',
      technique_used: 'box_breathing',
      tool_launched: null,
      taper_state: 'none',
      closure_offered: false,
      frustration_event: false,
      homework_referenced: false,
      therapist_referral: false,
      intensity: 6,
      mood_inference: { primary_emotion: 'anxiety', confidence: 'high' },
      journal_prompt_suggested: null,
    };
    const jsonStr = JSON.stringify(validSignal);

    it('extracts user content and signal from a response with a JSON block', () => {
      const raw = `That sounds really difficult.\n\n\`\`\`json\n${jsonStr}\n\`\`\``;

      const parsed = parseA2Response(raw);

      expect(parsed.userContent).toBe('That sounds really difficult.');
      expect(parsed.signal).not.toBeNull();
      expect(parsed.signal!.intensity).toBe(6);
      expect(parsed.signal!.taper_state).toBe('none');
      expect(parsed.signal!.technique_used).toBe('box_breathing');
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

    it('parses the taper_state/closure_offered/frustration_event/homework_referenced/therapist_referral fields', () => {
      const closingSignal: S07Signal = {
        ...validSignal,
        taper_state: 'solution_reached',
        closure_offered: true,
        frustration_event: true,
        homework_referenced: true,
        therapist_referral: true,
      };
      const raw = `Take care.\n\n\`\`\`json\n${JSON.stringify(closingSignal)}\n\`\`\``;

      const parsed = parseA2Response(raw);

      expect(parsed.signal!.taper_state).toBe('solution_reached');
      expect(parsed.signal!.closure_offered).toBe(true);
      expect(parsed.signal!.frustration_event).toBe(true);
      expect(parsed.signal!.homework_referenced).toBe(true);
      expect(parsed.signal!.therapist_referral).toBe(true);
    });

    describe('robust parsing against LLM output variations', () => {
      it('handles trailing spaces after ```json', () => {
        const raw = `I hear you.\n\n\`\`\`json   \n${jsonStr}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.intensity).toBe(6);
      });

      it('handles \\r\\n line endings', () => {
        const raw = `I hear you.\r\n\r\n\`\`\`json\r\n${jsonStr}\r\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.intensity).toBe(6);
      });

      it('handles missing final newline before closing fence', () => {
        const raw = `I hear you.\n\n\`\`\`json\n${jsonStr}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.intensity).toBe(6);
      });

      it('handles uppercase JSON language identifier', () => {
        const raw = `I hear you.\n\n\`\`\`JSON\n${jsonStr}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.intensity).toBe(6);
      });

      it('handles mixed-case JSON language identifier', () => {
        const raw = `I hear you.\n\n\`\`\`Json\n${jsonStr}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.intensity).toBe(6);
      });

      it('handles extra content after closing fence', () => {
        const raw = `I hear you.\n\n\`\`\`json\n${jsonStr}\n\`\`\`\nSome trailing text.`;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.intensity).toBe(6);
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
        expect(parsed.signal!.intensity).toBe(6);
      });

      it('handles content with multiple JSON blocks, extracting the first valid one', () => {
        const signal2 = { ...validSignal, intensity: 8 };
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
        expect(parsed.signal!.intensity).toBe(6);
      });

      it('handles signal on same line as opening fence (no newline after ```json)', () => {
        const raw = `I hear you.\n\n\`\`\`json{${jsonStr.slice(1, -1)}}\n\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.intensity).toBe(6);
      });

      it('handles 4-backtick fences (````json...````)', () => {
        const raw = `I hear you.\n\n\`\`\`\`json\n${jsonStr}\n\`\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.intensity).toBe(6);
        expect(parsed.userContent).toBe('I hear you.');
      });

      it('strips content leak from 4-backtick fences in userContent', () => {
        const raw = `I hear you.\n\`\`\`\`json\n${jsonStr}\n\`\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.userContent).toBe('I hear you.');
        expect(parsed.userContent).not.toContain('intensity');
        expect(parsed.userContent).not.toContain('S-07');
      });

      it('handles inline JSON without any fences via fallback extraction', () => {
        const raw = `I hear you. ${jsonStr}`;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.intensity).toBe(6);
      });

      it('defense-in-depth strips inline JSON from userContent when no fences present', () => {
        const raw = `I hear you. ${jsonStr}`;
        const parsed = parseA2Response(raw);
        expect(parsed.userContent).toBe('I hear you.');
        expect(parsed.userContent).not.toContain('intensity');
        expect(parsed.userContent).not.toContain('S-07');
      });

      it('handles content on same line as closing fence', () => {
        const raw = `Start.\n\`\`\`json\n${jsonStr}\n\`\`\` And some trailing text.`;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.intensity).toBe(6);
        expect(parsed.userContent).toBe('Start.\nAnd some trailing text.');
      });

      it('handles missing closing fence (unclosed block at end)', () => {
        const raw = `Some text.\n\`\`\`json\n${jsonStr}`;
        const parsed = parseA2Response(raw);
        expect(parsed.userContent).toBe('Some text.');
        expect(parsed.userContent).not.toContain('intensity');
      });

      it('handles 4-backtick fences with no language identifier', () => {
        const raw = `I hear you.\n\`\`\`\`\n${jsonStr}\n\`\`\`\``;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.intensity).toBe(6);
        expect(parsed.userContent).toBe('I hear you.');
      });

      it('strips JSON from userContent when LLM omits fences entirely', () => {
        const raw = `Some conversational text.\n${jsonStr}\nMore text.`;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.userContent).not.toContain('intensity');
        expect(parsed.userContent).not.toContain('"signal"');
      });

      it('handles open and close fences on the same line, preserving trailing content', () => {
        const raw = `Some text. before \`\`\`json ${jsonStr} \`\`\` and after.`;
        const parsed = parseA2Response(raw);
        expect(parsed.signal).not.toBeNull();
        expect(parsed.signal!.intensity).toBe(6);
        expect(parsed.userContent).toContain('Some text. before');
        expect(parsed.userContent).toContain('and after');
        expect(parsed.userContent).not.toContain('intensity');
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
