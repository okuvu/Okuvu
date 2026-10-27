import { describe, it, expect, vi, beforeEach } from 'vitest';
import { restructureThought } from '../agents/a3/agent.js';
import { buildCognitiveRestructuringPrompt, buildCannedA3Json } from '../agents/a3/prompts.js';
import type { A3Input } from '../agents/a3/types.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/generate-content.js', () => ({
  generateContent: mockGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 250,
  DEFAULT_TIMEOUT_MS: 10_000,
}));

const CLIENT_MESSAGE = 'I am sure everyone at work thinks I am useless and I will always be behind.';

function makeInput(overrides: Partial<A3Input> = {}): A3Input {
  return { message: CLIENT_MESSAGE, safetyState: 'S1', ...overrides };
}

function validPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    thought: 'everyone at work thinks I am useless',
    distortion: 'mind_reading',
    evidence_for: ['I am sure everyone at work thinks I am useless'],
    evidence_against: [],
    alternative_thought: 'It may be worth checking whether anyone has actually said this.',
    confidence: 'medium',
    notes: null,
    ...overrides,
  });
}

describe('A3 Cognitive Restructuring — restructureThought', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('safety gating', () => {
    it('refuses at S3 without calling the model', async () => {
      const out = await restructureThought(makeInput({ safetyState: 'S3' }));
      expect(out.payload).toBeNull();
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('refused_safety_state_S3');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('refuses at S4 without calling the model', async () => {
      const out = await restructureThought(makeInput({ safetyState: 'S4' }));
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('refused_safety_state_S4');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('runs at S0, S1 and S2', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
      for (const state of ['S0', 'S1', 'S2'] as const) {
        const out = await restructureThought(makeInput({ safetyState: state }));
        expect(out.payload).not.toBeNull();
      }
    });
  });

  describe('grounding guard', () => {
    it('accepts a thought quoted verbatim from the message', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
      const out = await restructureThought(makeInput());
      expect(out.payload?.thought).toBe('everyone at work thinks I am useless');
    });

    it('discards the payload when the quote is not in the message (invented thought)', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ thought: 'I am a burden to my family' }),
        fallbackUsed: false,
      });
      const out = await restructureThought(makeInput());
      expect(out.payload).toBeNull();
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('schema_invalid');
    });

    it('tolerates punctuation and case differences when grounding', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ thought: 'Everyone at work thinks I am useless' }),
        fallbackUsed: false,
      });
      const out = await restructureThought(makeInput());
      expect(out.payload).not.toBeNull();
    });
  });

  describe('content guards', () => {
    it('rejects advice directed at the client', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ alternative_thought: 'You should just stop worrying about what they think.' }),
        fallbackUsed: false,
      });
      const out = await restructureThought(makeInput());
      expect(out.payload).toBeNull();
    });

    it('rejects a diagnosis or medication mention', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ alternative_thought: 'This sounds like generalised anxiety disorder.' }),
        fallbackUsed: false,
      });
      const out = await restructureThought(makeInput());
      expect(out.payload).toBeNull();
    });

    it('rejects an outcome promise', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ alternative_thought: 'If you do this you will definitely feel better.' }),
        fallbackUsed: false,
      });
      expect((await restructureThought(makeInput())).payload).toBeNull();
    });
  });

  describe('schema validation', () => {
    it('rejects an unknown distortion', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ distortion: 'vibes' }), fallbackUsed: false });
      expect((await restructureThought(makeInput())).payload).toBeNull();
    });

    it('rejects more than three evidence items', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ evidence_for: ['a', 'b', 'c', 'd'] }),
        fallbackUsed: false,
      });
      expect((await restructureThought(makeInput())).payload).toBeNull();
    });

    it('rejects a non-array evidence field', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ evidence_for: 'one thing' }), fallbackUsed: false });
      expect((await restructureThought(makeInput())).payload).toBeNull();
    });

    it('accepts none_identified with an empty alternative', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ distortion: 'none_identified', alternative_thought: '' }),
        fallbackUsed: false,
      });
      const out = await restructureThought(makeInput());
      expect(out.payload?.distortion).toBe('none_identified');
    });

    it('rejects none_identified carrying an alternative (contradictory output)', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ distortion: 'none_identified' }),
        fallbackUsed: false,
      });
      expect((await restructureThought(makeInput())).payload).toBeNull();
    });
  });

  describe('failure paths fail closed', () => {
    it('returns a null payload on unparseable JSON', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Sure! Here is your thought:', fallbackUsed: false });
      const out = await restructureThought(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('parse_failure');
    });

    it('returns a null payload when the model times out', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });
      const out = await restructureThought(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('llm_timeout');
    });

    it('returns a null payload when the provider throws', async () => {
      mockGenerateContent.mockRejectedValue(new Error('boom'));
      const out = await restructureThought(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('llm_api_error');
    });

    it('never returns prose — only a structured payload or null', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
      const out = await restructureThought(makeInput());
      expect(Object.keys(out).sort()).toEqual(
        ['agentId', 'failureReason', 'fallbackUsed', 'notes', 'payload'].sort(),
      );
      expect(out.agentId).toBe('A3');
    });
  });

  it('requests deterministic JSON output', async () => {
    mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
    await restructureThought(makeInput());
    const args = mockGenerateContent.mock.calls[0][0];
    expect(args.generationConfig.temperature).toBe(0);
    expect(args.generationConfig.responseMimeType).toBe('application/json');
    expect(args.cannedResponse).toBeTruthy();
  });

  it('prompt states the verbatim-quote rule and the no-advice rule', () => {
    const prompt = buildCognitiveRestructuringPrompt(makeInput());
    expect(prompt).toContain('verbatim substring');
    expect(prompt).toContain('Never argue');
    expect(prompt).not.toContain('undefined');
  });

  it('canned reply is valid JSON that survives the real parser', async () => {
    const canned = buildCannedA3Json(CLIENT_MESSAGE);
    JSON.parse(canned);
    mockGenerateContent.mockResolvedValue({ text: canned, fallbackUsed: false });
    const out = await restructureThought(makeInput());
    expect(out.payload).not.toBeNull();
  });
});
