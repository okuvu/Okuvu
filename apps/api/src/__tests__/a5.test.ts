import { describe, it, expect, vi, beforeEach } from 'vitest';
import { planInterpersonalSkill, findSecondPersonInstruction } from '../agents/a5/agent.js';
import { buildInterpersonalSkillsPrompt, buildCannedA5Json } from '../agents/a5/prompts.js';
import type { A5Input } from '../agents/a5/types.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/generate-content.js', () => ({
  generateContent: mockGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 250,
  DEFAULT_TIMEOUT_MS: 10_000,
}));

const CLIENT_MESSAGE = 'My sister keeps asking me to cover her shifts and I never say no.';

function makeInput(overrides: Partial<A5Input> = {}): A5Input {
  return { message: CLIENT_MESSAGE, safetyState: 'S1', ...overrides };
}

function validPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    skill: 'refusing',
    situation: 'My sister keeps asking me to cover her shifts',
    example_words: "I can't cover this Saturday, but I can do the next one.",
    purpose: 'To decline one request clearly without ending the conversation.',
    confidence: 'medium',
    ...overrides,
  });
}

function mockReply(text: string): void {
  mockGenerateContent.mockResolvedValue({ text, fallbackUsed: false });
}

describe('A5 Interpersonal Skills — planInterpersonalSkill', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('safety gating', () => {
    it('refuses at S3 without calling the model', async () => {
      const out = await planInterpersonalSkill(makeInput({ safetyState: 'S3' }));
      expect(out.payload).toBeNull();
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('refused_safety_state_S3');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('refuses at S4 without calling the model', async () => {
      const out = await planInterpersonalSkill(makeInput({ safetyState: 'S4' }));
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('refused_safety_state_S4');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('runs at S0, S1 and S2', async () => {
      mockReply(validPayload());
      for (const state of ['S0', 'S1', 'S2'] as const) {
        const out = await planInterpersonalSkill(makeInput({ safetyState: state }));
        expect(out.payload).not.toBeNull();
        expect(out.fallbackUsed).toBe(false);
      }
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });
  });

  describe('payload contract', () => {
    it('returns a complete interpersonal_skills payload', async () => {
      mockReply(validPayload());
      const out = await planInterpersonalSkill(makeInput());
      expect(out.payload).toEqual({
        type: 'interpersonal_skills',
        skill: 'refusing',
        situation: 'My sister keeps asking me to cover her shifts',
        example_words: "I can't cover this Saturday, but I can do the next one.",
        purpose: 'To decline one request clearly without ending the conversation.',
        confidence: 'medium',
      });
      expect(out.agentId).toBe('A5');
    });

    it('accepts every skill in the locked enum', async () => {
      for (const skill of ['boundary_setting', 'repair', 'asking_for_help', 'refusing', 'asserting_a_need']) {
        mockReply(validPayload({ skill }));
        const out = await planInterpersonalSkill(makeInput());
        expect(out.payload?.skill).toBe(skill);
      }
    });

    it('rejects an unknown skill', async () => {
      mockReply(validPayload({ skill: 'assertiveness_training' }));
      const out = await planInterpersonalSkill(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('schema_invalid');
    });

    it('rejects a skill that is not a string', async () => {
      mockReply(validPayload({ skill: 3 }));
      expect((await planInterpersonalSkill(makeInput())).payload).toBeNull();
    });

    it('rejects an empty situation', async () => {
      mockReply(validPayload({ situation: '   ' }));
      expect((await planInterpersonalSkill(makeInput())).payload).toBeNull();
    });

    it('rejects an empty example_words', async () => {
      mockReply(validPayload({ example_words: '' }));
      expect((await planInterpersonalSkill(makeInput())).payload).toBeNull();
    });

    it('rejects example_words longer than 240 characters', async () => {
      mockReply(validPayload({ example_words: `I ${'x'.repeat(250)}` }));
      expect((await planInterpersonalSkill(makeInput())).payload).toBeNull();
    });

    it('rejects an empty purpose', async () => {
      mockReply(validPayload({ purpose: '  ' }));
      expect((await planInterpersonalSkill(makeInput())).payload).toBeNull();
    });

    it('rejects a purpose longer than 400 characters', async () => {
      mockReply(validPayload({ purpose: 'p'.repeat(401) }));
      expect((await planInterpersonalSkill(makeInput())).payload).toBeNull();
    });

    it('rejects an unknown confidence', async () => {
      mockReply(validPayload({ confidence: 'certain' }));
      expect((await planInterpersonalSkill(makeInput())).payload).toBeNull();
    });

    it('rejects a missing required field', async () => {
      const parsed = JSON.parse(validPayload()) as Record<string, unknown>;
      delete parsed.confidence;
      mockReply(JSON.stringify(parsed));
      const out = await planInterpersonalSkill(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('schema_invalid');
    });
  });

  describe('grounding guard', () => {
    it('accepts a situation quoted from the message', async () => {
      mockReply(validPayload());
      const out = await planInterpersonalSkill(makeInput());
      expect(out.payload?.situation).toBe('My sister keeps asking me to cover her shifts');
    });

    it('discards the payload when the situation is not in the message', async () => {
      mockReply(validPayload({ situation: 'My mother criticises my cooking' }));
      const out = await planInterpersonalSkill(makeInput());
      expect(out.payload).toBeNull();
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('schema_invalid');
    });

    it('tolerates case and punctuation differences when grounding', async () => {
      mockReply(validPayload({ situation: 'my sister keeps asking me to cover her shifts' }));
      const out = await planInterpersonalSkill(makeInput());
      expect(out.payload).not.toBeNull();
    });
  });

  describe('example_words must be the client\'s own script', () => {
    it('rejects second-person direction', async () => {
      mockReply(validPayload({ example_words: 'You should tell her that you are busy.' }));
      const out = await planInterpersonalSkill(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('schema_invalid');
    });

    it('rejects "you need to" phrasing', async () => {
      mockReply(validPayload({ example_words: 'You need to set a limit with her.' }));
      expect((await planInterpersonalSkill(makeInput())).payload).toBeNull();
    });

    it('detects the second-person forms directly', () => {
      expect(findSecondPersonInstruction('You should say no.')).toBe('you should');
      expect(findSecondPersonInstruction("I can't cover this Saturday.")).toBeNull();
    });

    it('accepts a first-person script that mentions the other person', async () => {
      mockReply(validPayload({ example_words: "I can't cover Saturday, but I can help you plan the week." }));
      expect((await planInterpersonalSkill(makeInput())).payload).not.toBeNull();
    });
  });

  describe('content guards', () => {
    it('rejects advice inside purpose', async () => {
      mockReply(validPayload({ purpose: 'You should practise this every day until it feels natural.' }));
      expect((await planInterpersonalSkill(makeInput())).payload).toBeNull();
    });

    it('rejects a diagnosis mention', async () => {
      mockReply(validPayload({ purpose: 'This is typical of an avoidant personality disorder.' }));
      expect((await planInterpersonalSkill(makeInput())).payload).toBeNull();
    });

    it('rejects an outcome promise', async () => {
      mockReply(validPayload({ purpose: 'This will definitely make her stop asking.' }));
      expect((await planInterpersonalSkill(makeInput())).payload).toBeNull();
    });

    it('rejects a forbidden phrase hidden in the situation quote', async () => {
      const message = 'My sister said you should cover her shift and I froze.';
      mockReply(
        validPayload({
          situation: 'you should cover her shift',
          example_words: "I can't cover it this week.",
        }),
      );
      const out = await planInterpersonalSkill(makeInput({ message }));
      expect(out.payload).toBeNull();
    });
  });

  describe('failure paths fail closed', () => {
    it('returns a null payload on unparseable JSON', async () => {
      mockReply('Here is a script you could use:');
      const out = await planInterpersonalSkill(makeInput());
      expect(out.payload).toBeNull();
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('parse_failure');
    });

    it('returns a null payload when the model times out', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });
      const out = await planInterpersonalSkill(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('llm_timeout');
    });

    it('returns a null payload when the provider throws', async () => {
      mockGenerateContent.mockRejectedValue(new Error('boom'));
      const out = await planInterpersonalSkill(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('llm_api_error');
    });

    it('returns a null payload on non-object JSON', async () => {
      mockReply('["refusing"]');
      const out = await planInterpersonalSkill(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('schema_invalid');
    });

    it('never returns prose — only a structured payload or null', async () => {
      mockReply(validPayload());
      const out = await planInterpersonalSkill(makeInput());
      expect(Object.keys(out).sort()).toEqual(
        ['agentId', 'failureReason', 'fallbackUsed', 'notes', 'payload'].sort(),
      );
      expect(typeof out.payload).toBe('object');
    });
  });

  describe('call configuration', () => {
    it('requests deterministic JSON output with a schema and a canned reply', async () => {
      mockReply(validPayload());
      await planInterpersonalSkill(makeInput());
      const args = mockGenerateContent.mock.calls[0][0];
      expect(args.generationConfig.temperature).toBe(0);
      expect(args.generationConfig.responseMimeType).toBe('application/json');
      expect(args.generationConfig.responseSchema.required).toContain('example_words');
      expect(args.cannedResponse).toBe(buildCannedA5Json(CLIENT_MESSAGE));
    });

    it('forwards recent history ahead of the current message', async () => {
      mockReply(validPayload());
      await planInterpersonalSkill(
        makeInput({
          recentHistory: [
            { role: 'user', content: 'She asked again last night.' },
            { role: 'assistant', content: 'That sounds persistent.' },
          ],
        }),
      );
      const args = mockGenerateContent.mock.calls[0][0];
      expect(args.contents).toHaveLength(3);
      expect(args.contents[0]).toEqual({ role: 'user', parts: [{ text: 'She asked again last night.' }] });
      expect(args.contents[1].role).toBe('model');
      expect(args.contents[2]).toEqual({ role: 'user', parts: [{ text: CLIENT_MESSAGE }] });
    });

    it('prompt states the verbatim-situation rule and the first-person rule', () => {
      const prompt = buildInterpersonalSkillsPrompt(makeInput());
      expect(prompt).toContain('verbatim substring');
      expect(prompt).toContain('you should');
      expect(prompt).toContain('boundary_setting');
      expect(prompt).not.toContain('undefined');
    });
  });

  describe('canned reply', () => {
    it('is valid JSON that survives the real parser, including grounding', async () => {
      const canned = buildCannedA5Json(CLIENT_MESSAGE);
      expect(() => JSON.parse(canned)).not.toThrow();
      mockReply(canned);
      const out = await planInterpersonalSkill(makeInput());
      expect(out.payload).not.toBeNull();
      expect(out.payload?.type).toBe('interpersonal_skills');
      expect(out.payload?.skill).toBe('refusing');
    });

    it('is deterministic for the same message', () => {
      expect(buildCannedA5Json(CLIENT_MESSAGE)).toBe(buildCannedA5Json(CLIENT_MESSAGE));
    });

    it('varies with the message content', () => {
      const repair = JSON.parse(buildCannedA5Json('I argued with my brother and said something I regret.'));
      const asking = JSON.parse(buildCannedA5Json('I need help with the forms and I cannot manage alone.'));
      expect(repair.skill).toBe('repair');
      expect(asking.skill).toBe('asking_for_help');
      expect(repair.skill).not.toBe(asking.skill);
    });

    it('keeps the situation grounded for a multi-sentence message', async () => {
      const message = 'She rang me at midnight again. I did not answer.';
      const canned = buildCannedA5Json(message);
      mockReply(canned);
      const out = await planInterpersonalSkill(makeInput({ message }));
      expect(out.payload).not.toBeNull();
      expect(JSON.parse(canned).situation).toBe('She rang me at midnight again.');
    });
  });
});
