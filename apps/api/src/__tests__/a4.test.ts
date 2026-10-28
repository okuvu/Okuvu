import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildActivationPlan } from '../agents/a4/agent.js';
import { buildBehaviouralActivationPrompt, buildCannedA4Json } from '../agents/a4/prompts.js';
import type { A4Input } from '../agents/a4/types.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/generate-content.js', () => ({
  generateContent: mockGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 250,
  DEFAULT_TIMEOUT_MS: 10_000,
}));

const CLIENT_MESSAGE =
  'I have been putting off the tax paperwork for three weeks and I feel worse every time I think about it.';

function makeInput(overrides: Partial<A4Input> = {}): A4Input {
  return { message: CLIENT_MESSAGE, safetyState: 'S1', ...overrides };
}

function validPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    action: 'Open the tax folder and work on one form for ten minutes',
    when: 'after breakfast tomorrow',
    rationale: 'Ten minutes of contact with the paperwork is smaller than finishing all of it.',
    predicted_difficulty: 4,
    confidence: 'medium',
    ...overrides,
  });
}

function mockReply(text: string): void {
  mockGenerateContent.mockResolvedValue({ text, fallbackUsed: false });
}

describe('A4 Behavioural Activation — buildActivationPlan', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('safety gating', () => {
    it('refuses at S3 without calling the model', async () => {
      const out = await buildActivationPlan(makeInput({ safetyState: 'S3' }));
      expect(out.payload).toBeNull();
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('refused_safety_state_S3');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('refuses at S4 without calling the model', async () => {
      const out = await buildActivationPlan(makeInput({ safetyState: 'S4' }));
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('refused_safety_state_S4');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('runs at S0, S1 and S2', async () => {
      mockReply(validPayload());
      for (const state of ['S0', 'S1', 'S2'] as const) {
        const out = await buildActivationPlan(makeInput({ safetyState: state }));
        expect(out.payload).not.toBeNull();
        expect(out.fallbackUsed).toBe(false);
      }
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });
  });

  describe('payload contract', () => {
    it('returns a complete behavioural_activation payload', async () => {
      mockReply(validPayload());
      const out = await buildActivationPlan(makeInput());
      expect(out.payload).toEqual({
        type: 'behavioural_activation',
        action: 'Open the tax folder and work on one form for ten minutes',
        when: 'after breakfast tomorrow',
        rationale: 'Ten minutes of contact with the paperwork is smaller than finishing all of it.',
        predicted_difficulty: 4,
        confidence: 'medium',
      });
      expect(out.agentId).toBe('A4');
    });

    it('accepts a null when', async () => {
      mockReply(validPayload({ when: null }));
      const out = await buildActivationPlan(makeInput());
      expect(out.payload?.when).toBeNull();
    });

    it('treats a blank when as absent rather than failing', async () => {
      mockReply(validPayload({ when: '   ' }));
      const out = await buildActivationPlan(makeInput());
      expect(out.payload?.when).toBeNull();
    });

    it('rejects a non-string when', async () => {
      mockReply(validPayload({ when: 42 }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('rejects an empty action', async () => {
      mockReply(validPayload({ action: '   ' }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('rejects an action longer than 240 characters', async () => {
      mockReply(validPayload({ action: `Walk ${'a'.repeat(250)}` }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('rejects an empty rationale', async () => {
      mockReply(validPayload({ rationale: '' }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('rejects a rationale longer than 400 characters', async () => {
      mockReply(validPayload({ rationale: 'r'.repeat(401) }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('rejects an unknown confidence', async () => {
      mockReply(validPayload({ confidence: 'certain' }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('rejects a missing required field', async () => {
      const parsed = JSON.parse(validPayload()) as Record<string, unknown>;
      delete parsed.when;
      mockReply(JSON.stringify(parsed));
      const out = await buildActivationPlan(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('schema_invalid');
    });
  });

  describe('predicted_difficulty is an integer 0–10', () => {
    it('accepts the boundaries 0 and 10', async () => {
      for (const value of [0, 10]) {
        mockReply(validPayload({ predicted_difficulty: value }));
        const out = await buildActivationPlan(makeInput());
        expect(out.payload?.predicted_difficulty).toBe(value);
      }
    });

    it('rejects a float', async () => {
      mockReply(validPayload({ predicted_difficulty: 4.5 }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('rejects a negative value', async () => {
      mockReply(validPayload({ predicted_difficulty: -1 }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('rejects a value above 10', async () => {
      mockReply(validPayload({ predicted_difficulty: 11 }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('rejects a numeric string', async () => {
      mockReply(validPayload({ predicted_difficulty: '4' }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });
  });

  describe('concrete-action guard', () => {
    it('rejects a mood target dressed as an action', async () => {
      mockReply(validPayload({ action: 'Try to be happier this week' }));
      const out = await buildActivationPlan(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('schema_invalid');
    });

    it('rejects "think positive"', async () => {
      mockReply(validPayload({ action: 'Think positive about the paperwork' }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('rejects "be more social"', async () => {
      mockReply(validPayload({ action: 'Be more social with the people at work' }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('still accepts a concrete action that mentions a mood word incidentally', async () => {
      mockReply(validPayload({ action: 'Text Sam to ask if they want to walk on Saturday morning' }));
      const out = await buildActivationPlan(makeInput());
      expect(out.payload).not.toBeNull();
    });
  });

  describe('content guards', () => {
    it('rejects advice directed at the client', async () => {
      mockReply(validPayload({ rationale: 'You should just stop worrying about the paperwork.' }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('rejects a diagnosis or medication mention', async () => {
      mockReply(validPayload({ rationale: 'This avoidance fits a diagnosis of generalised anxiety.' }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('rejects an outcome promise', async () => {
      mockReply(validPayload({ rationale: 'This will definitely cure the dread you feel.' }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });

    it('rejects a forbidden phrase hidden in when', async () => {
      mockReply(validPayload({ when: 'you should do it before dinner' }));
      expect((await buildActivationPlan(makeInput())).payload).toBeNull();
    });
  });

  describe('failure paths fail closed', () => {
    it('returns a null payload on unparseable JSON', async () => {
      mockReply('Sure! Here is a plan for you:');
      const out = await buildActivationPlan(makeInput());
      expect(out.payload).toBeNull();
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('parse_failure');
    });

    it('returns a null payload when the model times out', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });
      const out = await buildActivationPlan(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('llm_timeout');
    });

    it('returns a null payload when the provider throws', async () => {
      mockGenerateContent.mockRejectedValue(new Error('boom'));
      const out = await buildActivationPlan(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('llm_api_error');
    });

    it('never returns prose — only a structured payload or null', async () => {
      mockReply(validPayload());
      const out = await buildActivationPlan(makeInput());
      expect(Object.keys(out).sort()).toEqual(
        ['agentId', 'failureReason', 'fallbackUsed', 'notes', 'payload'].sort(),
      );
      expect(typeof out.payload).toBe('object');
    });
  });

  describe('call configuration', () => {
    it('requests deterministic JSON output with a schema and a canned reply', async () => {
      mockReply(validPayload());
      await buildActivationPlan(makeInput());
      const args = mockGenerateContent.mock.calls[0][0];
      expect(args.generationConfig.temperature).toBe(0);
      expect(args.generationConfig.responseMimeType).toBe('application/json');
      expect(args.generationConfig.responseSchema.required).toContain('predicted_difficulty');
      expect(args.cannedResponse).toBe(buildCannedA4Json(CLIENT_MESSAGE));
    });

    it('forwards recent history ahead of the current message', async () => {
      mockReply(validPayload());
      await buildActivationPlan(
        makeInput({
          recentHistory: [
            { role: 'user', content: 'Work is a lot right now.' },
            { role: 'assistant', content: 'That sounds heavy.' },
          ],
        }),
      );
      const args = mockGenerateContent.mock.calls[0][0];
      expect(args.contents).toHaveLength(3);
      expect(args.contents[0]).toEqual({ role: 'user', parts: [{ text: 'Work is a lot right now.' }] });
      expect(args.contents[1].role).toBe('model');
      expect(args.contents[2]).toEqual({ role: 'user', parts: [{ text: CLIENT_MESSAGE }] });
    });

    it('prompt states the concrete-action rule and the no-advice rule', () => {
      const prompt = buildBehaviouralActivationPrompt(makeInput());
      expect(prompt).toContain('"try to be happier"');
      expect(prompt).toContain('smallest version');
      expect(prompt).toContain('predicted_difficulty');
      expect(prompt).not.toContain('undefined');
    });
  });

  describe('canned reply', () => {
    it('is valid JSON that survives the real parser', async () => {
      const canned = buildCannedA4Json(CLIENT_MESSAGE);
      expect(() => JSON.parse(canned)).not.toThrow();
      mockReply(canned);
      const out = await buildActivationPlan(makeInput());
      expect(out.payload).not.toBeNull();
      expect(out.payload?.type).toBe('behavioural_activation');
    });

    it('is deterministic for the same message', () => {
      expect(buildCannedA4Json(CLIENT_MESSAGE)).toBe(buildCannedA4Json(CLIENT_MESSAGE));
    });

    it('varies with the message content', () => {
      const lonely = buildCannedA4Json('I feel lonely and nobody calls me any more.');
      const tired = buildCannedA4Json('I am exhausted and cannot get out of bed in the mornings.');
      expect(lonely).not.toBe(tired);
      expect(JSON.parse(lonely).action).toContain('message');
      expect(JSON.parse(tired).action).toContain('bed');
    });
  });
});
