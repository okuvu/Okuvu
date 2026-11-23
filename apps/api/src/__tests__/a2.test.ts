import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { handleTurn, parseA2Response } from '../agents/a2/agent.js';
import type { A2Input, S07Signal } from '../agents/a2/types.js';
import { A2_PROMPT, A2_PROMPT_VERSION } from '../prompts/index.js';
import {
  applyCarePlanEmphasis,
  applyConversationDefault,
  carePlanStyleEnabled,
  talkOrDoEnabled,
  CARE_PLAN_BLOCK_PROBES,
  RULE1_ARM_PROBES,
  RULE1_CHOICE_PROBE,
  RULE1_STEP_PROBE,
} from '../agents/a2/prompts.js';
import { DEFAULT_BEDROCK_MODEL_ID } from '../lib/provider-config.js';

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

describe('A2 dialogue lane and bounded history (16 Nov 2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false, model: 'zai.glm-4.7-flash' });
  });

  function longHistory(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `ordinary week chat ${i + 1}`,
    }));
  }

  it('classifies itself as the dialogue lane, which is what selects GLM and permits the flex tier', async () => {
    await handleTurn(makeInput({ safetyState: 'S0' }));

    expect(mockGenerateContent.mock.calls[0][0].callRole).toBe('dialogue');
  });

  it('folds a long risk-free history into a digest so the prompt stops growing with the session', async () => {
    await handleTurn(makeInput({ safetyState: 'S0', recentHistory: longHistory(20) }));

    const contents = mockGenerateContent.mock.calls[0][0].contents as Array<{ parts: Array<{ text: string }> }>;
    // digest + 6 verbatim turns + the current message
    expect(contents).toHaveLength(8);
    expect(contents[0]!.parts[0]!.text).toContain('Earlier in this conversation');
    expect(contents[1]!.parts[0]!.text).toContain('ordinary week chat 15');
  });

  it('leaves the same history verbatim when the session is carrying risk', async () => {
    await handleTurn(makeInput({ safetyState: 'S1', recentHistory: longHistory(20) }));

    const contents = mockGenerateContent.mock.calls[0][0].contents as Array<{ parts: Array<{ text: string }> }>;
    expect(contents).toHaveLength(21);
    expect(contents[0]!.parts[0]!.text).toBe('ordinary week chat 1');
  });
});

describe('care-plan emphasis — §12 (v2.5)', () => {
  const probes = Object.values(CARE_PLAN_BLOCK_PROBES);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });
  });

  async function promptFor(overrides: Partial<A2Input>): Promise<string> {
    await handleTurn(makeInput(overrides));
    return mockGenerateContent.mock.calls[0][0].systemInstruction as string;
  }

  it('puts exactly one block in front of the model, and it is the client\'s plan', async () => {
    const plans = [['CP1', CARE_PLAN_BLOCK_PROBES.CP1], ['CP2', CARE_PLAN_BLOCK_PROBES.CP2], ['CP3', CARE_PLAN_BLOCK_PROBES.CP3]] as const;

    for (const [plan, probe] of plans) {
      vi.clearAllMocks();
      const prompt = await promptFor({ carePlan: plan, carePlanStyle: true });

      expect(prompt).toContain(probe);
      for (const other of probes.filter((p) => p !== probe)) {
        expect(prompt).not.toContain(other);
      }
      // Markers are scaffolding for the builder, never for the model.
      expect(prompt).not.toContain('[[CP');
    }
  });

  it('carries no emphasis at all for a client with no plan, and says so in the section', async () => {
    const prompt = await promptFor({ carePlan: null, carePlanStyle: true });

    for (const probe of probes) expect(prompt).not.toContain(probe);
    expect(prompt).toContain('If no block is present, no plan is assigned: use §7.1 alone.');
  });

  it('never defaults an unassigned client to CP1', async () => {
    const prompt = await promptFor({ carePlan: null, carePlanStyle: true });

    expect(prompt).not.toContain(CARE_PLAN_BLOCK_PROBES.CP1);
    expect(prompt).not.toContain('**CP1');
  });

  it('keeps the care-plan focus phrase alongside the block — phrase and emphasis are different things', async () => {
    const prompt = await promptFor({
      carePlan: 'CP1',
      carePlanStyle: true,
      carePlanFocus: 'worry loops before exams',
    });

    expect(prompt).toContain('worry loops before exams');
    expect(prompt).toContain(CARE_PLAN_BLOCK_PROBES.CP1);
  });

  describe('the switch', () => {
    let saved: string | undefined;

    beforeEach(() => {
      saved = process.env.OKUVU_A2_CARE_PLAN_STYLE;
    });

    afterEach(() => {
      if (saved === undefined) delete process.env.OKUVU_A2_CARE_PLAN_STYLE;
      else process.env.OKUVU_A2_CARE_PLAN_STYLE = saved;
    });

    it('is off when the variable is unset — an image roll must not turn clinical copy on', async () => {
      delete process.env.OKUVU_A2_CARE_PLAN_STYLE;

      const prompt = await promptFor({ carePlan: 'CP1' });

      for (const probe of probes) expect(prompt).not.toContain(probe);
    });

    it('is off for anything other than the literal "on"', async () => {
      for (const value of ['off', 'true', '1', 'ON', 'yes', '']) {
        process.env.OKUVU_A2_CARE_PLAN_STYLE = value;
        expect(carePlanStyleEnabled()).toBe(false);
      }
    });

    it('OKUVU_A2_CARE_PLAN_STYLE=off strips the block even for a CP1 client', async () => {
      process.env.OKUVU_A2_CARE_PLAN_STYLE = 'off';

      const prompt = await promptFor({ carePlan: 'CP1' });

      for (const probe of probes) expect(prompt).not.toContain(probe);
    });

    it('OKUVU_A2_CARE_PLAN_STYLE=on reaches the builder from the environment', async () => {
      process.env.OKUVU_A2_CARE_PLAN_STYLE = 'on';

      const prompt = await promptFor({ carePlan: 'CP3' });

      expect(prompt).toContain(CARE_PLAN_BLOCK_PROBES.CP3);
      expect(prompt).not.toContain(CARE_PLAN_BLOCK_PROBES.CP1);
    });
  });

  it('logs one line per turn naming the plan and the block count', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    await handleTurn(makeInput({ carePlan: 'CP2', carePlanStyle: true }));

    const line = info.mock.calls.find((c) => c[1] === 'A2 care-plan emphasis');
    expect(line).toBeDefined();
    expect(line![0]).toMatchObject({
      carePlanStyle: true,
      carePlan: 'CP2',
      blocksKept: 1,
      blocksStripped: 2,
      outcome: 'blocks',
    });
    info.mockRestore();
  });

  describe('the shipped prompt', () => {
    it('is v2.6 and keeps all three blocks, delimited and balanced', () => {
      expect(A2_PROMPT_VERSION).toBe('v2.6');

      for (const plan of ['CP1', 'CP2', 'CP3'] as const) {
        expect(A2_PROMPT.split(`[[${plan}]]`).length - 1).toBe(1);
        expect(A2_PROMPT.split(`[[/${plan}]]`).length - 1).toBe(1);
        expect(A2_PROMPT).toContain(CARE_PLAN_BLOCK_PROBES[plan]);
      }
    });

    it('puts §12 before the FINAL REMINDER and states its precedence over §6, §7.1 and §5.1', () => {
      const section = A2_PROMPT.indexOf('# 12. CARE-PLAN EMPHASIS');
      const final = A2_PROMPT.indexOf('# FINAL REMINDER');

      expect(section).toBeGreaterThan(-1);
      expect(final).toBeGreaterThan(section);
      expect(A2_PROMPT.slice(section, final)).toContain('never\noverrides §6, §7.1 or §5.1');
    });
  });

  describe('malformed marker structure fails closed', () => {
    it('drops the whole section rather than sending three competing emphases', () => {
      const broken = A2_PROMPT.replace('[[/CP2]]\n', '');
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = applyCarePlanEmphasis(broken, 'CP2');

      expect(result.outcome).toBe('section');
      expect(result.kept).toBeNull();
      expect(result.prompt).not.toContain('# 12. CARE-PLAN EMPHASIS');
      expect(result.prompt).not.toContain(CARE_PLAN_BLOCK_PROBES.CP1);
      // The rest of the prompt is untouched — the reviewer still runs last.
      expect(result.prompt).toContain('# FINAL REMINDER');
      error.mockRestore();
    });

    it('treats a prompt with no §12 at all as carrying no emphasis', () => {
      const result = applyCarePlanEmphasis('# 1. A prompt from before v2.5\n', 'CP1');

      expect(result.outcome).toBe('absent');
      expect(result.stripped).toBe(0);
      expect(result.prompt).toBe('# 1. A prompt from before v2.5\n');
    });
  });
});

describe('§7.1 rule 1 — a step offered or a choice asked (v2.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateContent.mockResolvedValue({ text: 'I hear you.', fallbackUsed: false });
  });

  async function promptFor(overrides: Partial<A2Input>): Promise<string> {
    await handleTurn(makeInput(overrides));
    return mockGenerateContent.mock.calls[0][0].systemInstruction as string;
  }

  describe('the switch', () => {
    let saved: string | undefined;

    beforeEach(() => {
      saved = process.env.OKUVU_A2_TALK_OR_DO;
    });

    afterEach(() => {
      if (saved === undefined) delete process.env.OKUVU_A2_TALK_OR_DO;
      else process.env.OKUVU_A2_TALK_OR_DO = saved;
    });

    it('is off when the variable is unset — an image roll must not change how the companion opens', () => {
      delete process.env.OKUVU_A2_TALK_OR_DO;

      expect(talkOrDoEnabled()).toBe(false);
    });

    it('is off for anything other than the literal "on"', () => {
      for (const value of ['off', 'true', '1', 'ON', 'yes', '', 'On ']) {
        process.env.OKUVU_A2_TALK_OR_DO = value;
        expect(talkOrDoEnabled()).toBe(false);
      }
    });

    it('off ships the step-first arm: one step, no preference question', async () => {
      delete process.env.OKUVU_A2_TALK_OR_DO;

      const prompt = await promptFor({ carePlan: 'CP1' });

      expect(prompt).toContain(RULE1_STEP_PROBE);
      expect(prompt).not.toContain(RULE1_CHOICE_PROBE);
      expect(prompt).not.toContain('talk it through');
    });

    it('on ships the choice arm: talk it through, or try something', async () => {
      process.env.OKUVU_A2_TALK_OR_DO = 'on';

      const prompt = await promptFor({ carePlan: 'CP1' });

      expect(prompt).toContain(RULE1_CHOICE_PROBE);
      expect(prompt).not.toContain(RULE1_STEP_PROBE);
      expect(prompt).toContain('**talk it through**');
    });

    it('the per-turn override wins over the environment, for the harness A/B', async () => {
      process.env.OKUVU_A2_TALK_OR_DO = 'on';

      const offArm = await promptFor({ carePlan: 'CP2', talkOrDo: false });
      expect(offArm).toContain(RULE1_STEP_PROBE);
      expect(offArm).not.toContain(RULE1_CHOICE_PROBE);
    });
  });

  it('never lets an arm marker reach the model, in either arm', async () => {
    for (const talkOrDo of [false, true]) {
      vi.clearAllMocks();
      const prompt = await promptFor({ carePlan: 'CP2', talkOrDo });

      expect(prompt).not.toContain('[[RULE1');
    }
  });

  it('keeps the carve-outs that stop the question swallowing work the prompt already does', async () => {
    const prompt = await promptFor({ carePlan: 'CP2', talkOrDo: true });
    const choiceAt = prompt.indexOf(RULE1_CHOICE_PROBE);
    const rule2At = prompt.indexOf('2. **The user is ambiguous or resistant**');

    expect(choiceAt).toBeGreaterThan(-1);
    const arm = prompt.slice(choiceAt, rule2At);

    // Body-first states: no preference question in the middle of a panic.
    expect(arm).toContain('acute panic: the body comes first');
    // The rows that already name their move still name it, without a choice.
    expect(arm).toContain('caregiver burnout, the checking loop, self-criticism');
    // §5.1 keeps ownership of its four topics.
    expect(arm).toContain('§5.1 still wins');
    expect(arm).toContain('A talk-or-do question is not a route');
    // The client is never asked the same question twice.
    expect(arm).toContain('Do not put the same question to them twice');
  });

  it('logs the arm it used, so a production log answers it after the fact', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    await handleTurn(makeInput({ carePlan: 'CP1', talkOrDo: true }));

    const line = info.mock.calls.find((c) => c[1] === 'A2 care-plan emphasis');
    expect(line).toBeDefined();
    expect(line![0]).toMatchObject({ rule1: 'choice', rule1Outcome: 'blocks' });
    info.mockRestore();
  });

  describe('the shipped prompt', () => {
    it('carries both arms, each delimited exactly once — one artefact the gate can score both ways', () => {
      for (const tag of ['RULE1_STEP', 'RULE1_CHOICE']) {
        expect(A2_PROMPT.split(`[[${tag}]]`).length - 1).toBe(1);
        expect(A2_PROMPT.split(`[[/${tag}]]`).length - 1).toBe(1);
      }
      expect(A2_PROMPT).toContain(RULE1_STEP_PROBE);
      expect(A2_PROMPT).toContain(RULE1_CHOICE_PROBE);
    });

    it('keeps both arms inside §7.1, ahead of rule 2', () => {
      const section = A2_PROMPT.indexOf('## 7.1 One next move');
      const rule2 = A2_PROMPT.indexOf('2. **The user is ambiguous or resistant**');
      const choice = A2_PROMPT.indexOf('[[RULE1_CHOICE]]');
      const tableAt = A2_PROMPT.indexOf('Match the presentation, not the label');

      expect(section).toBeGreaterThan(-1);
      expect(choice).toBeGreaterThan(section);
      expect(rule2).toBeGreaterThan(choice);
      expect(tableAt).toBeGreaterThan(rule2);
    });
  });

  describe('malformed arm structure fails to the arm in production', () => {
    it('falls back to step-first rather than exposing an unreviewed arm', () => {
      const broken = A2_PROMPT.replace('[[/RULE1_STEP]]\n', '');
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = applyConversationDefault(broken, 'choice');

      expect(result.outcome).toBe('step');
      expect(result.kept).toBe('step');
      expect(result.prompt).toContain(RULE1_STEP_PROBE);
      expect(result.prompt).not.toContain(RULE1_CHOICE_PROBE);
      expect(result.prompt).not.toContain('[[RULE1');
      // The rest of §7.1 survives — rules 2-5 need rule 1 to have decided.
      expect(result.prompt).toContain('2. **The user is ambiguous or resistant**');
      error.mockRestore();
    });

    it('treats a prompt with no arms at all as the step arm, untouched', () => {
      const result = applyConversationDefault('# 1. A prompt from before v2.6\n', 'choice');

      expect(result.outcome).toBe('absent');
      expect(result.kept).toBe('step');
      expect(result.stripped).toBe(0);
      expect(result.prompt).toBe('# 1. A prompt from before v2.6\n');
    });
  });
});

describe('prompt header (v2.6 correction)', () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it('names the live version — v2.5 shipped a header reading v2.4', () => {
    expect(A2_PROMPT).toContain(`Version: ${A2_PROMPT_VERSION} |`);
    expect(A2_PROMPT).toContain(`A2 Support Companion · ${A2_PROMPT_VERSION}`);
  });

  it('names the model this deployment actually calls, and no other vendor', () => {
    expect(A2_PROMPT).toContain(`Model: ${DEFAULT_BEDROCK_MODEL_ID}`);
    expect(A2_PROMPT).not.toContain('OpenRouter');
    expect(A2_PROMPT).not.toContain('Llama-3.1');
  });

  it('resolves to a prompt file that exists on disk', () => {
    expect(existsSync(join(here, '..', 'prompts', `a2-okuvu-${A2_PROMPT_VERSION}.txt`))).toBe(true);
  });
});
