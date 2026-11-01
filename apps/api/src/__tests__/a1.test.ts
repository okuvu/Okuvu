import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifySafety } from '../agents/a1/agent.js';
import type { A1Input } from '../agents/a1/types.js';
import { buildSafetyPrompt, SAFETY_RUBRIC } from '../agents/a1/prompts.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/generate-content.js', () => {
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

// Full valid v2.0 output — safetyState is the only field most tests care
// about, but crisis_language_detected/basis/signal_strength are required by
// the parser now, so every "success path" mock needs them present.
function validJson(overrides: Partial<{
  safetyState: string;
  crisis_language_detected: boolean;
  basis: string;
  signal_strength: string;
  notes: string | null;
}> = {}): string {
  return JSON.stringify({
    safetyState: 'S0',
    crisis_language_detected: false,
    basis: 'literal',
    signal_strength: 'medium',
    notes: null,
    ...overrides,
  });
}

describe('A1 Safety Gate — classifySafety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('valid classifications (S0–S4)', () => {
    it('classifies normal message as S0', async () => {
      mockGenerateContent.mockResolvedValue({ text: validJson({ safetyState: 'S0' }), fallbackUsed: false });

      const result = await classifySafety(makeInput({ message: 'I had a great day' }));

      expect(result.safetyState).toBe('S0');
      expect(result.fallbackUsed).toBe(false);
    });

    it('classifies mild distress as S1', async () => {
      mockGenerateContent.mockResolvedValue({ text: validJson({ safetyState: 'S1' }), fallbackUsed: false });

      const result = await classifySafety(makeInput({ message: 'I am a bit nervous about my exam' }));

      expect(result.safetyState).toBe('S1');
      expect(result.fallbackUsed).toBe(false);
    });

    it('classifies moderate distress as S2', async () => {
      mockGenerateContent.mockResolvedValue({ text: validJson({ safetyState: 'S2' }), fallbackUsed: false });

      const result = await classifySafety(makeInput({ message: 'I have been struggling with anxiety all week' }));

      expect(result.safetyState).toBe('S2');
      expect(result.fallbackUsed).toBe(false);
    });

    it('classifies elevated risk as S3', async () => {
      mockGenerateContent.mockResolvedValue({ text: validJson({ safetyState: 'S3' }), fallbackUsed: false });

      const result = await classifySafety(makeInput({ message: 'I feel like nothing matters anymore' }));

      expect(result.safetyState).toBe('S3');
      expect(result.fallbackUsed).toBe(false);
    });
  });

  describe('generation config', () => {
    it('sets temperature to 0.0 (OKUVU v2.0 — deterministic safety classification)', async () => {
      mockGenerateContent.mockResolvedValue({ text: validJson(), fallbackUsed: false });

      await classifySafety(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.generationConfig.temperature).toBe(0.0);
    });
  });

  describe('S4 crisis detection — at least 3 distinct examples', () => {
    it('classifies explicit suicide intent as S4', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson({ safetyState: 'S4', crisis_language_detected: true, signal_strength: 'high' }),
        fallbackUsed: false,
      });

      const result = await classifySafety(makeInput({ message: 'I want to end my life' }));

      expect(result.safetyState).toBe('S4');
      expect(result.fallbackUsed).toBe(false);
    });

    it('classifies active crisis plan as S4', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson({ safetyState: 'S4', crisis_language_detected: true, signal_strength: 'high' }),
        fallbackUsed: false,
      });

      const result = await classifySafety(makeInput({ message: 'I have a plan to kill myself tonight' }));

      expect(result.safetyState).toBe('S4');
      expect(result.fallbackUsed).toBe(false);
    });

    it('classifies immediate self-harm language as S4', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson({ safetyState: 'S4', crisis_language_detected: true, signal_strength: 'high' }),
        fallbackUsed: false,
      });

      const result = await classifySafety(makeInput({ message: 'I am going to hurt myself right now' }));

      expect(result.safetyState).toBe('S4');
      expect(result.fallbackUsed).toBe(false);
    });
  });

  describe('v2.0 output fields — crisis_language_detected, basis, signal_strength, notes', () => {
    it('passes through crisis_language_detected=true even on a non-S4 classification', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson({ safetyState: 'S1', crisis_language_detected: true, basis: 'ambiguous' }),
        fallbackUsed: false,
      });

      const result = await classifySafety(makeInput({ message: 'this exam is killing me' }));

      expect(result.safetyState).toBe('S1');
      expect(result.crisis_language_detected).toBe(true);
      expect(result.basis).toBe('ambiguous');
    });

    it('passes through basis and signal_strength', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson({ basis: 'contextual', signal_strength: 'low' }),
        fallbackUsed: false,
      });

      const result = await classifySafety(makeInput());

      expect(result.basis).toBe('contextual');
      expect(result.signal_strength).toBe('low');
    });

    it('passes through notes when present', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson({ notes: 'ladder' }),
        fallbackUsed: false,
      });

      const result = await classifySafety(makeInput());

      expect(result.notes).toBe('ladder');
    });

    it('defaults notes to null when omitted', async () => {
      const { notes: _omit, ...rest } = JSON.parse(validJson());
      mockGenerateContent.mockResolvedValue({ text: JSON.stringify(rest), fallbackUsed: false });

      const result = await classifySafety(makeInput());

      expect(result.notes).toBeNull();
    });

    it('falls back to S2 when a required v2.0 field (basis) is missing', async () => {
      const { basis: _omit, ...rest } = JSON.parse(validJson());
      mockGenerateContent.mockResolvedValue({ text: JSON.stringify(rest), fallbackUsed: false });

      const result = await classifySafety(makeInput());

      expect(result.safetyState).toBe('S2');
      expect(result.fallbackUsed).toBe(true);
    });

    it('fallback output has fail-closed defaults (crisis_language_detected: false, basis: ambiguous, signal_strength: low)', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });

      const result = await classifySafety(makeInput());

      expect(result.crisis_language_detected).toBe(false);
      expect(result.basis).toBe('ambiguous');
      expect(result.signal_strength).toBe('low');
      expect(result.notes).toBe('llm_timeout');
    });
  });

  describe('timeout fallback', () => {
    it('returns S2 on timeout', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });

      const result = await classifySafety(makeInput());

      expect(result.safetyState).toBe('S2');
      expect(result.fallbackUsed).toBe(true);
    });

    it('logs llm_timeout reason code on timeout', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });

      await classifySafety(makeInput());

      // E17-S4: the log line now carries the failure *kind* alongside the reason.
      expect(spy).toHaveBeenCalledWith({ reason: 'llm_timeout', failureKind: null }, expect.any(String));
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

    it('logs llm_api_error reason code on API failure', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'api_error' });

      await classifySafety(makeInput());

      expect(spy).toHaveBeenCalledWith({ reason: 'llm_api_error', failureKind: null }, expect.any(String));
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
      mockGenerateContent.mockResolvedValue({ text: validJson({ safetyState: 'S7' }), fallbackUsed: false });

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
      mockGenerateContent.mockResolvedValue({ text: validJson({ safetyState: 'S0' }), fallbackUsed: false });

      await classifySafety(makeInput({ message: 'hi' }));

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('classifies "hi" as genuine S0', async () => {
      mockGenerateContent.mockResolvedValue({ text: validJson({ safetyState: 'S0' }), fallbackUsed: false });

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
    it('output is always the fixed A1Output shape — never prose', async () => {
      mockGenerateContent.mockResolvedValue({ text: validJson(), fallbackUsed: false });

      const result = await classifySafety(makeInput());

      expect(Object.keys(result).sort()).toEqual([
        'basis',
        'crisis_language_detected',
        'fallbackUsed',
        'notes',
        'safetyState',
        'signal_strength',
      ]);
      expect(typeof result.safetyState).toBe('string');
      expect(typeof result.fallbackUsed).toBe('boolean');
    });

    it('fallback output is still the fixed A1Output shape', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });

      const result = await classifySafety(makeInput());

      expect(Object.keys(result).sort()).toEqual([
        'basis',
        'crisis_language_detected',
        'fallbackUsed',
        'notes',
        'safetyState',
        'signal_strength',
      ]);
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

      expect(prompt).toContain('safety triage layer of OKUVU');
      expect(prompt).toContain('S0');
      expect(prompt).toContain('S1');
      expect(prompt).toContain('S2');
      expect(prompt).toContain('S3');
      expect(prompt).toContain('S4');
    });

    it('includes at least 3 S4 crisis examples in the prompt', () => {
      const prompt = buildSafetyPrompt({ message: 'hello' });

      const crisisExamples = [
        "I've decided to end it tonight. I have the pills.",
        "I'm going to jump. I'm on the terrace now.",
        "I already took something. I don't know how much.",
      ];
      for (const example of crisisExamples) {
        expect(prompt).toContain(example);
      }
    });

    it('instructs ambiguous S2/S3 splits to choose S3 (the higher state)', () => {
      const prompt = buildSafetyPrompt({ message: 'hello' });

      expect(prompt).toContain('Between S2 and S3 -> S3');
      expect(prompt).toContain('choose the higher');
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

    it('includes the output JSON schema fields', () => {
      const prompt = buildSafetyPrompt({ message: 'hello' });

      expect(prompt).toContain('crisis_language_detected');
      expect(prompt).toContain('signal_strength');
      expect(prompt).toContain('"basis"');
    });
  });
});

// ─── E17-S4 — the deterministic crisis floor under a failed classification ──
//
// E17-S1 §7 and E17-S2 §465 both logged the same hole from opposite ends: when
// the classifier could not answer, every turn became "S2, no crisis language".
// S2 routes to A2, so an explicit disclosure got supportive chat while the
// model was down. The floor below makes a technical failure unable to downgrade
// a literal disclosure: no model, no parsing, just the keyword module
// (`agents/a1/crisis-keywords.ts`) and S4.
describe('A1 — crisis floor when the classifier is unreachable (E17-S4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const DISCLOSURES = [
    'I want to die',
    'I am going to kill myself',
    'I keep thinking about suicide',
    'I want to end my life',
    'I just want to end it all',
  ];

  it.each(DISCLOSURES)('classifies %j as S4 on a timeout', async (message) => {
    mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout', failureKind: 'timeout' });

    const result = await classifySafety(makeInput({ message }));

    expect(result.safetyState).toBe('S4');
    expect(result.crisis_language_detected).toBe(true);
    expect(result.basis).toBe('literal');
    expect(result.signal_strength).toBe('high');
    expect(result.fallbackUsed).toBe(true);
    expect(result.notes).toBe('llm_timeout:crisis_keyword_floor');
  });

  it('classifies a disclosure as S4 when the model call throws outright', async () => {
    mockGenerateContent.mockRejectedValue(new Error('bedrock down'));

    const result = await classifySafety(makeInput({ message: 'I want to die' }));

    expect(result.safetyState).toBe('S4');
    expect(result.crisis_language_detected).toBe(true);
    expect(result.notes).toBe('llm_api_error:crisis_keyword_floor');
  });

  it('classifies a disclosure as S4 when the model answers unparseably', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'sorry, I cannot help with that', fallbackUsed: false });

    const result = await classifySafety(makeInput({ message: 'I want to end my life' }));

    expect(result.safetyState).toBe('S4');
    expect(result.crisis_language_detected).toBe(true);
    expect(result.notes).toBe('parse_failure:crisis_keyword_floor');
  });

  it('names a throttle as a throttle rather than as a generic api error', async () => {
    mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'api_error', failureKind: 'throttled' });

    const result = await classifySafety(makeInput({ message: 'I want to die' }));

    expect(result.notes).toBe('llm_throttled:crisis_keyword_floor');
  });

  it('still fails to S2 — not S4 — for a non-disclosure on the same failure', async () => {
    mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'api_error', failureKind: 'throttled' });

    const result = await classifySafety(makeInput({ message: 'work has been stressful' }));

    expect(result.safetyState).toBe('S2');
    expect(result.crisis_language_detected).toBe(false);
    expect(result.basis).toBe('ambiguous');
    expect(result.signal_strength).toBe('low');
    expect(result.notes).toBe('llm_throttled');
  });

  it('does not touch the classifier’s verdict when the model does answer', async () => {
    mockGenerateContent.mockResolvedValue({
      text: validJson({ safetyState: 'S0', crisis_language_detected: false }),
      fallbackUsed: false,
    });

    const result = await classifySafety(makeInput({ message: 'I want to die' }));

    // Documented, deliberate: the floor only applies to a *failed* call. A real
    // classification that says S0 is not overridden by a keyword — the keyword
    // list is not a classifier and is never allowed to outvote one.
    expect(result.safetyState).toBe('S0');
    expect(result.fallbackUsed).toBe(false);
  });
});
