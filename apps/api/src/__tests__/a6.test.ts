import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exploreValues } from '../agents/a6/agent.js';
import { buildMeaningValuesPrompt, buildCannedA6Json } from '../agents/a6/prompts.js';
import type { A6Input } from '../agents/a6/types.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/generate-content.js', () => ({
  generateContent: mockGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 250,
  DEFAULT_TIMEOUT_MS: 10_000,
}));

const CLIENT_MESSAGE = "I keep letting people down at work, and I still get up early to walk my sister's dog.";

function makeInput(overrides: Partial<A6Input> = {}): A6Input {
  return { message: CLIENT_MESSAGE, safetyState: 'S1', ...overrides };
}

function validPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    value: 'showing up for family',
    evidence: 'I still get up early to walk my sister\'s dog',
    next_step: 'Set aside ten minutes this week to walk the dog without rushing it.',
    confidence: 'medium',
    ...overrides,
  });
}

describe('A6 Meaning & Values — exploreValues', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('safety gating', () => {
    it('refuses at S3 without calling the model', async () => {
      const out = await exploreValues(makeInput({ safetyState: 'S3' }));
      expect(out.payload).toBeNull();
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('refused_safety_state_S3');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('refuses at S4 without calling the model', async () => {
      const out = await exploreValues(makeInput({ safetyState: 'S4' }));
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('refused_safety_state_S4');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('runs at S0, S1 and S2', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
      for (const state of ['S0', 'S1', 'S2'] as const) {
        const out = await exploreValues(makeInput({ safetyState: state }));
        expect(out.payload).not.toBeNull();
      }
    });
  });

  describe('grounding guard', () => {
    it('accepts evidence quoted verbatim from the message', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
      const out = await exploreValues(makeInput());
      expect(out.payload).toEqual({
        type: 'meaning_values',
        value: 'showing up for family',
        evidence: 'I still get up early to walk my sister\'s dog',
        next_step: 'Set aside ten minutes this week to walk the dog without rushing it.',
        confidence: 'medium',
      });
    });

    it('discards the payload when the evidence is invented', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ evidence: 'I am a burden to everyone around me' }),
        fallbackUsed: false,
      });
      const out = await exploreValues(makeInput());
      expect(out.payload).toBeNull();
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('schema_invalid');
    });

    it('tolerates case and punctuation differences when grounding', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ evidence: 'I keep letting people down at work' }),
        fallbackUsed: false,
      });
      const out = await exploreValues(makeInput());
      expect(out.payload?.evidence).toBe('I keep letting people down at work');
    });

    it('rejects an empty evidence field even though it is technically grounded-free', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ evidence: '' }), fallbackUsed: false });
      expect((await exploreValues(makeInput())).payload).toBeNull();
    });
  });

  describe('content guards — no moralising, no prescribing values', () => {
    it('rejects advice directed at the client', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ next_step: 'You should tell your sister how you feel this week.' }),
        fallbackUsed: false,
      });
      expect((await exploreValues(makeInput())).payload).toBeNull();
    });

    it('rejects a moralising next_step the shared advice list would miss', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ next_step: 'Choose the right thing to do, not the easy thing.' }),
        fallbackUsed: false,
      });
      expect((await exploreValues(makeInput())).payload).toBeNull();
    });

    it('rejects a value framed as what good people do', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ value: 'what good people do when they are tired' }),
        fallbackUsed: false,
      });
      expect((await exploreValues(makeInput())).payload).toBeNull();
    });

    it('rejects a value the client is told they must believe', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ value: 'you must believe your family comes first' }),
        fallbackUsed: false,
      });
      expect((await exploreValues(makeInput())).payload).toBeNull();
    });

    it('rejects a diagnosis or medication mention', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ next_step: 'Ask your doctor about medication for low mood.' }),
        fallbackUsed: false,
      });
      expect((await exploreValues(makeInput())).payload).toBeNull();
    });
  });

  describe('schema validation', () => {
    it('rejects an empty value', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ value: '   ' }), fallbackUsed: false });
      expect((await exploreValues(makeInput())).payload).toBeNull();
    });

    it('rejects an empty next_step', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ next_step: '' }), fallbackUsed: false });
      expect((await exploreValues(makeInput())).payload).toBeNull();
    });

    it('rejects an over-long value rather than truncating it', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ value: 'a'.repeat(260) }), fallbackUsed: false });
      expect((await exploreValues(makeInput())).payload).toBeNull();
    });

    it('rejects an over-long next_step', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ next_step: 'step '.repeat(60) }), fallbackUsed: false });
      expect((await exploreValues(makeInput())).payload).toBeNull();
    });

    it('rejects a non-string value', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ value: 42 }), fallbackUsed: false });
      expect((await exploreValues(makeInput())).payload).toBeNull();
    });

    it('rejects an unknown confidence level', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ confidence: 'certain' }), fallbackUsed: false });
      expect((await exploreValues(makeInput())).payload).toBeNull();
    });

    it('rejects a payload that omits a required field', async () => {
      const { next_step: _omitted, ...rest } = JSON.parse(validPayload()) as Record<string, unknown>;
      mockGenerateContent.mockResolvedValue({ text: JSON.stringify(rest), fallbackUsed: false });
      const out = await exploreValues(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('schema_invalid');
    });
  });

  describe('failure paths fail closed', () => {
    it('returns a null payload on unparseable JSON', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Here is a value you might hold:', fallbackUsed: false });
      const out = await exploreValues(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('parse_failure');
    });

    it('returns a null payload when the model times out', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });
      const out = await exploreValues(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('llm_timeout');
    });

    it('returns a null payload when the provider throws', async () => {
      mockGenerateContent.mockRejectedValue(new Error('boom'));
      const out = await exploreValues(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('llm_api_error');
    });
  });

  it('never returns prose — only a structured payload or null', async () => {
    mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
    const out = await exploreValues(makeInput());
    expect(Object.keys(out).sort()).toEqual(
      ['agentId', 'failureReason', 'fallbackUsed', 'notes', 'payload'].sort(),
    );
    expect(out.agentId).toBe('A6');
  });

  it('requests deterministic JSON output with a canned reply', async () => {
    mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
    await exploreValues(makeInput());
    const args = mockGenerateContent.mock.calls[0][0];
    expect(args.generationConfig.temperature).toBe(0);
    expect(args.generationConfig.responseMimeType).toBe('application/json');
    expect(args.cannedResponse).toBeTruthy();
  });

  it('passes recent history and the current message as turns', async () => {
    mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
    await exploreValues(makeInput({ recentHistory: [{ role: 'assistant', content: 'What mattered today?' }] }));
    const contents = mockGenerateContent.mock.calls[0][0].contents;
    expect(contents).toHaveLength(2);
    expect(contents[0].role).toBe('model');
    expect(contents[1].parts[0].text).toBe(CLIENT_MESSAGE);
  });

  it('prompt states the verbatim-quote rule and the no-moralising rule', () => {
    const prompt = buildMeaningValuesPrompt(makeInput({ sessionCount: 3 }));
    expect(prompt).toContain('verbatim substring');
    expect(prompt).toContain('Never moralise');
    expect(prompt).toContain('Sessions completed so far: 3');
    expect(prompt).not.toContain('undefined');
  });

  it('canned reply is valid JSON that survives the real parser', async () => {
    const canned = buildCannedA6Json(CLIENT_MESSAGE);
    JSON.parse(canned);
    mockGenerateContent.mockResolvedValue({ text: canned, fallbackUsed: false });
    const out = await exploreValues(makeInput());
    expect(out.payload).not.toBeNull();
    expect(out.payload?.type).toBe('meaning_values');
    expect(out.payload?.value.length).toBeGreaterThan(0);
    expect(out.payload?.next_step.length).toBeGreaterThan(0);
  });
});
