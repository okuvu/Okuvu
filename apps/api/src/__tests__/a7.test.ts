import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prepareTransition, MIN_SESSIONS_FOR_TRANSITION } from '../agents/a7/agent.js';
import { buildMaintenanceTransitionPrompt, buildCannedA7Json } from '../agents/a7/prompts.js';
import type { A7Input } from '../agents/a7/types.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/generate-content.js', () => ({
  generateContent: mockGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 250,
  DEFAULT_TIMEOUT_MS: 10_000,
}));

const CLIENT_MESSAGE = 'I have started going for a walk after dinner most days and it helps me sleep.';
const MEMORY_CONTEXT = 'Sessions 1-5: the client named the walk after dinner as the thing that steadies them.';

function makeInput(overrides: Partial<A7Input> = {}): A7Input {
  return { message: CLIENT_MESSAGE, safetyState: 'S1', sessionCount: 6, ...overrides };
}

function validPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    gain: 'Going for a walk after dinner most days',
    anchor: 'going for a walk after dinner',
    plan: 'Keep the walk on the days between sessions, and agree a check-in two weeks out.',
    confidence: 'medium',
    ...overrides,
  });
}

describe('A7 Maintenance & Transition — prepareTransition', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('safety gating', () => {
    it('refuses at S3 without calling the model', async () => {
      const out = await prepareTransition(makeInput({ safetyState: 'S3' }));
      expect(out.payload).toBeNull();
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('refused_safety_state_S3');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('refuses at S4 without calling the model', async () => {
      const out = await prepareTransition(makeInput({ safetyState: 'S4' }));
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('refused_safety_state_S4');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('reports the safety refusal ahead of the session-count refusal', async () => {
      const out = await prepareTransition(makeInput({ safetyState: 'S3', sessionCount: 1 }));
      expect(out.failureReason).toBe('refused_safety_state_S3');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });
  });

  describe('session-count gate', () => {
    it(`refuses at session 1 with insufficient_sessions and no model call`, async () => {
      const out = await prepareTransition(makeInput({ sessionCount: 1 }));
      expect(out.payload).toBeNull();
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('insufficient_sessions');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('refuses at session 3', async () => {
      const out = await prepareTransition(makeInput({ sessionCount: 3 }));
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('insufficient_sessions');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it(`runs at the boundary session (${MIN_SESSIONS_FOR_TRANSITION})`, async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
      const out = await prepareTransition(makeInput({ sessionCount: MIN_SESSIONS_FOR_TRANSITION }));
      expect(out.payload).not.toBeNull();
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('runs at session 10', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
      const out = await prepareTransition(makeInput({ sessionCount: 10 }));
      expect(out.payload?.type).toBe('maintenance_transition');
    });

    it('refuses a non-integer session count (NaN would slip past a bare < 4 check)', async () => {
      const out = await prepareTransition(makeInput({ sessionCount: Number.NaN }));
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('insufficient_sessions');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('refuses a fractional session count', async () => {
      const out = await prepareTransition(makeInput({ sessionCount: 5.5 }));
      expect(out.failureReason).toBe('insufficient_sessions');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });
  });

  describe('grounding guard on the anchor', () => {
    it('accepts an anchor quoted from the message', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
      const out = await prepareTransition(makeInput());
      expect(out.payload).toEqual({
        type: 'maintenance_transition',
        gain: 'Going for a walk after dinner most days',
        anchor: 'going for a walk after dinner',
        plan: 'Keep the walk on the days between sessions, and agree a check-in two weeks out.',
        confidence: 'medium',
      });
    });

    it('accepts an anchor drawn from prior-session memory', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ anchor: 'named the walk after dinner as the thing that steadies them' }),
        fallbackUsed: false,
      });
      const out = await prepareTransition(makeInput({ userMemoryContext: MEMORY_CONTEXT }));
      expect(out.payload?.anchor).toBe('named the walk after dinner as the thing that steadies them');
    });

    it('rejects a fabricated anchor that is in neither the message nor memory', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ anchor: 'your breathing exercise before bed' }),
        fallbackUsed: false,
      });
      const out = await prepareTransition(makeInput({ userMemoryContext: MEMORY_CONTEXT }));
      expect(out.payload).toBeNull();
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('schema_invalid');
    });

    it('rejects an empty anchor', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ anchor: '  ' }), fallbackUsed: false });
      expect((await prepareTransition(makeInput())).payload).toBeNull();
    });
  });

  describe('content guards — no discharge language, no outcome promises', () => {
    it('rejects a plan that calls the client cured', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ plan: 'You are cured now, so we can space sessions out.' }),
        fallbackUsed: false,
      });
      expect((await prepareTransition(makeInput())).payload).toBeNull();
    });

    it('rejects a plan that calls the client recovered', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ gain: 'You have fully recovered from the low mood' }),
        fallbackUsed: false,
      });
      expect((await prepareTransition(makeInput())).payload).toBeNull();
    });

    it('rejects a plan claiming the client no longer needs support', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ plan: 'You no longer need weekly sessions.' }),
        fallbackUsed: false,
      });
      expect((await prepareTransition(makeInput())).payload).toBeNull();
    });

    it('rejects a guarantee of outcome', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ plan: 'This guarantees the walk will keep working.' }),
        fallbackUsed: false,
      });
      expect((await prepareTransition(makeInput())).payload).toBeNull();
    });

    it('rejects advice directed at the client', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ plan: 'You should keep walking every single day.' }),
        fallbackUsed: false,
      });
      expect((await prepareTransition(makeInput())).payload).toBeNull();
    });

    it('rejects a diagnosis mention', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validPayload({ gain: 'Your generalised anxiety disorder is settling' }),
        fallbackUsed: false,
      });
      expect((await prepareTransition(makeInput())).payload).toBeNull();
    });
  });

  describe('schema validation', () => {
    it('rejects an empty gain', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ gain: '' }), fallbackUsed: false });
      expect((await prepareTransition(makeInput())).payload).toBeNull();
    });

    it('rejects an empty plan', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ plan: '   ' }), fallbackUsed: false });
      expect((await prepareTransition(makeInput())).payload).toBeNull();
    });

    it('rejects an over-long plan rather than truncating it', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ plan: 'plan '.repeat(100) }), fallbackUsed: false });
      expect((await prepareTransition(makeInput())).payload).toBeNull();
    });

    it('rejects an unknown confidence level', async () => {
      mockGenerateContent.mockResolvedValue({ text: validPayload({ confidence: 'certain' }), fallbackUsed: false });
      expect((await prepareTransition(makeInput())).payload).toBeNull();
    });

    it('rejects a payload that omits a required field', async () => {
      const { plan: _omitted, ...rest } = JSON.parse(validPayload()) as Record<string, unknown>;
      mockGenerateContent.mockResolvedValue({ text: JSON.stringify(rest), fallbackUsed: false });
      const out = await prepareTransition(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('schema_invalid');
    });
  });

  describe('failure paths fail closed', () => {
    it('returns a null payload on unparseable JSON', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Sounds like things are improving!', fallbackUsed: false });
      const out = await prepareTransition(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('parse_failure');
    });

    it('returns a null payload when the model times out', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });
      const out = await prepareTransition(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('llm_timeout');
    });

    it('returns a null payload when the provider throws', async () => {
      mockGenerateContent.mockRejectedValue(new Error('boom'));
      const out = await prepareTransition(makeInput());
      expect(out.payload).toBeNull();
      expect(out.failureReason).toBe('llm_api_error');
    });
  });

  it('never returns prose — only a structured payload or null', async () => {
    mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
    const out = await prepareTransition(makeInput());
    expect(Object.keys(out).sort()).toEqual(
      ['agentId', 'failureReason', 'fallbackUsed', 'notes', 'payload'].sort(),
    );
    expect(out.agentId).toBe('A7');
  });

  it('requests deterministic JSON output with a canned reply', async () => {
    mockGenerateContent.mockResolvedValue({ text: validPayload(), fallbackUsed: false });
    await prepareTransition(makeInput());
    const args = mockGenerateContent.mock.calls[0][0];
    expect(args.generationConfig.temperature).toBe(0);
    expect(args.generationConfig.responseMimeType).toBe('application/json');
    expect(args.cannedResponse).toBeTruthy();
  });

  it('prompt carries the grounding rule, the session count and the no-discharge rule', () => {
    const prompt = buildMaintenanceTransitionPrompt(makeInput({ sessionCount: 7, userMemoryContext: MEMORY_CONTEXT }));
    expect(prompt).toContain('verbatim substring');
    expect(prompt).toContain('Sessions completed so far: 7');
    expect(prompt).toContain('never guarantee a result');
    expect(prompt).toContain('spaced out, not ended');
    expect(prompt).not.toContain('undefined');
  });

  it('canned reply is valid JSON that survives the real parser', async () => {
    const canned = buildCannedA7Json(CLIENT_MESSAGE);
    JSON.parse(canned);
    mockGenerateContent.mockResolvedValue({ text: canned, fallbackUsed: false });
    const out = await prepareTransition(makeInput({ sessionCount: MIN_SESSIONS_FOR_TRANSITION }));
    expect(out.payload).not.toBeNull();
    expect(out.payload?.type).toBe('maintenance_transition');
    expect(out.payload?.anchor.length).toBeGreaterThan(0);
  });
});
