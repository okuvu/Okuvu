import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleTurn, parseA2Response } from '../agents/a2/agent.js';
import type { A2Input, S07Signal } from '../agents/a2/types.js';
import { A2_PROMPT_VERSION } from '../prompts/index.js';

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
    it('passes through fallback response from LLM wrapper on timeout', async () => {
      mockGenerateContent.mockResolvedValue({
        text: "I'm here to support you. Could you tell me more about how you're feeling?",
        fallbackUsed: true,
      });

      const result = await handleTurn(makeInput());

      expect(result.userContent).toContain('here to support you');
      expect(result.fallbackUsed).toBe(true);
    });

    it('passes through fallback response from LLM wrapper on API error', async () => {
      mockGenerateContent.mockResolvedValue({
        text: "I'm here to support you. Could you tell me more about how you're feeling?",
        fallbackUsed: true,
      });

      const result = await handleTurn(makeInput());

      expect(result.userContent).toBeTruthy();
      expect(result.fallbackUsed).toBe(true);
    });

    it('does not throw when LLM wrapper returns fallback', async () => {
      mockGenerateContent.mockResolvedValue({
        text: "I'm here to support you.",
        fallbackUsed: true,
      });

      await expect(handleTurn(makeInput())).resolves.toBeDefined();
    });

    it('passes through failureReason from the LLM wrapper', async () => {
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
    it('propagates the resolved model from the LLM wrapper as modelVersion', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false, model: 'gemini-2.5-flash' });

      const result = await handleTurn(makeInput());

      expect(result.modelVersion).toBe('gemini-2.5-flash');
    });

    it('reports the A2 conversational prompt version', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false, model: 'gemini-2.5-flash' });

      const result = await handleTurn(makeInput());

      expect(result.promptVersion).toBe(A2_PROMPT_VERSION);
    });

    it('propagates canned:true from the LLM wrapper', async () => {
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

// ─── B4 regression seeds (OKUVU — Plumbing Fixes & Rationale v1.0) ──────────
// "Freeze each as a regression seed before any large run: the failures as
// regression tests." A5: the fenced-block stripper alone let an improvised
// prose header (Conv 4: "BLOCK 2 — MACHINE SIGNAL (stripped before delivery
// to user)") leak into user-visible text. These freeze the strip-everything-
// after-a-marker contract; if scaffolding ever again reaches the user, these
// fail before any large run does.
describe('A5 signal-marker stripping (B4 regression seed)', () => {
  it('strips everything after an improvised "BLOCK 2 — MACHINE SIGNAL" header line', () => {
    const raw = [
      "That sounds really heavy — let's slow down together.",
      'BLOCK 2 — MACHINE SIGNAL (stripped before delivery to user)',
      '{"signal": "S-07", "agent": "A2"}',
    ].join('\n');

    const result = parseA2Response(raw);

    expect(result.userContent).toBe("That sounds really heavy — let's slow down together.");
    expect(result.userContent).not.toContain('BLOCK');
    expect(result.userContent).not.toContain('MACHINE SIGNAL');
    expect(result.userContent).not.toContain('stripped before delivery');
  });

  it('strips an inline header with the parenthetical tail on the same line', () => {
    const raw = "I'm here with you. BLOCK 2 — MACHINE SIGNAL (stripped before delivery to user)";

    const result = parseA2Response(raw);

    expect(result.userContent).toBe("I'm here with you.");
    expect(result.userContent).not.toContain('stripped before delivery');
  });

  it('strips the canonical fenced S-07 block as before (no regression of the normal path)', () => {
    const raw = [
      'I hear you.',
      '```json',
      '{"signal": "S-07", "agent": "A2", "intensity": 4}',
      '```',
    ].join('\n');

    const result = parseA2Response(raw);

    expect(result.userContent).toBe('I hear you.');
  });

  it('never leaks a bare "MACHINE SIGNAL" marker line', () => {
    const raw = ['You are not alone in this.', 'MACHINE SIGNAL', '{"signal": "S-07"}'].join('\n');

    const result = parseA2Response(raw);

    expect(result.userContent).toBe('You are not alone in this.');
  });
});

/**
 * E17-S14 follow-up. Observed live on testing.okuvu.in: on closing turns Qwen3
 * returned Block 2 (the S-07 JSON) alone. The call succeeded, the parse
 * succeeded, `fallbackUsed` was false, and `userContent` was '' — so the client
 * received a blank reply. These pin every layer of the fix.
 */
describe('A2 empty-reply protection', () => {
  const SIGNAL_ONLY = [
    '```json',
    JSON.stringify({
      signal: 'S-07',
      agent: 'A2',
      technique_used: null,
      tool_launched: null,
      taper_state: 'solution_reached',
      closure_offered: true,
      frustration_event: false,
      homework_referenced: false,
      therapist_referral: false,
      intensity: 3,
      mood_inference: { primary_emotion: 'calm', confidence: 'high' },
      journal_prompt_suggested: null,
    }),
    '```',
  ].join('\n');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a signal-only response to empty prose and keeps the signal', () => {
    const parsed = parseA2Response(SIGNAL_ONLY);

    expect(parsed.userContent).toBe('');
    expect(parsed.signal).not.toBeNull();
    expect(parsed.signal!.closure_offered).toBe(true);
  });

  it('recovers a reply the model fenced, without a model call', async () => {
    const parsed = parseA2Response('```markdown\nThat sounds heavy. What feels most present right now?\n```');

    expect(parsed.userContent).toBe('That sounds heavy. What feels most present right now?');
  });

  it('does not mistake the signal block for a fenced reply', () => {
    const parsed = parseA2Response('I hear you.\n\n```json\n{"signal":"S-07"}\n```');

    expect(parsed.userContent).toBe('I hear you.');
    expect(parsed.signal).not.toBeNull();
  });

  it('strips a speaker label the model leaked onto the first line', () => {
    const parsed = parseA2Response('OKUVU: You are not asking me to fix it — you are asking what to do with it.');

    expect(parsed.userContent).toBe('You are not asking me to fix it — you are asking what to do with it.');
  });

  it('repairs once when the first attempt has no visible reply', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ text: SIGNAL_ONLY, fallbackUsed: false, model: 'qwen.qwen3-32b-v1:0' })
      .mockResolvedValueOnce({ text: "You're welcome. Take the pause with you.", fallbackUsed: false, model: 'qwen.qwen3-32b-v1:0' });

    const result = await handleTurn(makeInput());

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(result.userContent).toBe("You're welcome. Take the pause with you.");
    expect(result.replyRepaired).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    // The repair keeps A2's own brief — same system instruction, plus the
    // directive — and keeps the signal the first attempt produced.
    const repairCall = mockGenerateContent.mock.calls[1][0];
    expect(repairCall.systemInstruction).toContain('REPAIR');
    expect(result.signal).not.toBeNull();
    expect(result.signal!.closure_offered).toBe(true);
  });

  it('fails closed when the repair also returns only the block', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ text: SIGNAL_ONLY, fallbackUsed: false, model: 'qwen.qwen3-32b-v1:0' })
      .mockResolvedValueOnce({ text: SIGNAL_ONLY, fallbackUsed: false, model: 'qwen.qwen3-32b-v1:0' });

    const result = await handleTurn(makeInput());

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(result.userContent).toBe('');
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureKind).toBe('unavailable');
    expect(result.failureReason).toBe('api_error');
    expect(result.replyRepaired).toBe(false);
  });

  it('does not attempt a repair when the provider already failed closed', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: 'SAFETY_UNAVAILABLE',
      fallbackUsed: true,
      failureReason: 'timeout',
      failureKind: 'timeout',
      model: 'qwen.qwen3-32b-v1:0',
    });

    const result = await handleTurn(makeInput());

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureKind).toBe('timeout');
  });
});

/**
 * E17-S18 — the structured-output path.
 *
 * The four-arm probe (evidence/E17-S18-emission-4arm.md) measured the two-block
 * envelope appearing on 34/63 turns when §10/§11 asked for it in prose and 63/63
 * when the same sheet was paired with a forced tool schema. These tests cover
 * the wiring, not the rate: that the schema is actually handed to the provider,
 * that the envelope is read back into `userContent` + `S07Signal`, that a prose
 * answer still parses, and that the empty-reply repair keeps working in either
 * shape.
 */
describe('A2 structured output (E17-S18)', () => {
  const envelope = (overrides: Record<string, unknown> = {}): string =>
    JSON.stringify({
      signal: 'S-07',
      agent: 'A2',
      reply: 'That sounds exhausting. What feels heaviest right now?',
      technique_used: 'box_breathing',
      tool_launched: 'grounding_5431',
      taper_state: 'none',
      closure_offered: true,
      frustration_event: false,
      homework_referenced: true,
      therapist_referral: false,
      intensity: 6,
      primary_emotion: 'drained',
      mood_confidence: 'high',
      journal_prompt_suggested: 'none',
      ...overrides,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.A2_STRUCTURED_OUTPUT;
  });

  it('hands the provider a response schema by default', async () => {
    mockGenerateContent.mockResolvedValue({ text: envelope(), fallbackUsed: false });

    await handleTurn(makeInput());

    const callArgs = mockGenerateContent.mock.calls[0][0];
    const schema = callArgs.generationConfig?.responseSchema as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(schema).toBeDefined();
    // `reply` must be required, or the model can satisfy the schema with a
    // signal and no words — the exact blank-bubble failure this all began with.
    expect(schema.required).toContain('reply');
    expect(schema.required).toContain('technique_used');
    expect(Object.keys(schema.properties ?? {})).toContain('primary_emotion');
  });

  it('reads the reply and the signal out of the envelope', async () => {
    mockGenerateContent.mockResolvedValue({ text: envelope(), fallbackUsed: false });

    const result = await handleTurn(makeInput());

    expect(result.userContent).toBe('That sounds exhausting. What feels heaviest right now?');
    expect(result.fallbackUsed).toBe(false);
    expect(result.signal).not.toBeNull();
    expect(result.signal!.signal).toBe('S-07');
    expect(result.signal!.agent).toBe('A2');
    expect(result.signal!.technique_used).toBe('box_breathing');
    expect(result.signal!.tool_launched).toBe('grounding_5431');
    expect(result.signal!.intensity).toBe(6);
    expect(result.signal!.homework_referenced).toBe(true);
    // The flat wire fields are reassembled into the nested type here.
    expect(result.signal!.mood_inference.primary_emotion).toBe('drained');
    expect(result.signal!.mood_inference.confidence).toBe('high');
  });

  it('maps the schema sentinels back to null', async () => {
    mockGenerateContent.mockResolvedValue({
      text: envelope({
        technique_used: 'none',
        tool_launched: 'N/A',
        intensity: 0,
        primary_emotion: 'none',
        journal_prompt_suggested: '',
        taper_state: 'something-invalid',
      }),
      fallbackUsed: false,
    });

    const result = await handleTurn(makeInput());

    expect(result.signal!.technique_used).toBeNull();
    expect(result.signal!.tool_launched).toBeNull();
    expect(result.signal!.intensity).toBeNull();
    expect(result.signal!.mood_inference.primary_emotion).toBeNull();
    expect(result.signal!.journal_prompt_suggested).toBeNull();
    expect(result.signal!.taper_state).toBe('none');
  });

  it('still parses a prose answer — the schema is a request, never an assumption', async () => {
    // OpenRouter ignores responseSchema (see lib/openrouter.ts), and a model can
    // answer in prose anyway. Either must keep working unchanged.
    mockGenerateContent.mockResolvedValue({
      text: 'I hear you.\n\n```json\n{"signal":"S-07","agent":"A2","technique_used":null}\n```',
      fallbackUsed: false,
    });

    const result = await handleTurn(makeInput());

    expect(result.userContent).toBe('I hear you.');
    expect(result.signal!.technique_used).toBeNull();
  });

  it('does not mistake prose that quotes JSON for an envelope', () => {
    const prose =
      'Here is the shape I mean: {"signal":"S-07","reply":"hello"} — we would say the second part.';

    const parsed = parseA2Response(prose);

    expect(parsed.userContent).toContain('Here is the shape I mean');
  });

  it('accepts a fenced envelope', () => {
    const parsed = parseA2Response('```json\n' + envelope() + '\n```');

    expect(parsed.userContent).toBe('That sounds exhausting. What feels heaviest right now?');
    expect(parsed.signal!.technique_used).toBe('box_breathing');
  });

  it('is switched off by A2_STRUCTURED_OUTPUT=off', async () => {
    process.env.A2_STRUCTURED_OUTPUT = 'off';
    mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });

    const result = await handleTurn(makeInput());

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.generationConfig).toBeUndefined();
    expect(result.userContent).toBe('I hear you.');
  });

  it('repairs a blank envelope reply and keeps the schema on the repair call', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ text: envelope({ reply: '' }), fallbackUsed: false })
      .mockResolvedValueOnce({
        text: envelope({ reply: 'You do not have to decide that tonight.' }),
        fallbackUsed: false,
      });

    const result = await handleTurn(makeInput());

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(result.userContent).toBe('You do not have to decide that tonight.');
    expect(result.replyRepaired).toBe(true);
    // The repair must ask in the same shape as the first attempt.
    expect(mockGenerateContent.mock.calls[1][0].generationConfig?.responseSchema).toBeDefined();
    // And keep the signal the first attempt did produce.
    expect(result.signal!.technique_used).toBe('box_breathing');
  });

  it('fails closed when both attempts come back with no words', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ text: envelope({ reply: '   ' }), fallbackUsed: false })
      .mockResolvedValueOnce({ text: envelope({ reply: '   ' }), fallbackUsed: false });

    const result = await handleTurn(makeInput());

    expect(result.userContent).toBe('');
    expect(result.fallbackUsed).toBe(true);
    expect(result.replyRepaired).toBe(false);
  });
});
