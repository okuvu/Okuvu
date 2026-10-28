import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.hoisted(() => vi.fn());
vi.mock('../../../api/src/lib/generate-content.js', () => ({
  generateContent: mockGenerateContent,
}));

const { judgeReply } = await import('../lib/judge');

describe('judgeReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns judged:true with the parsed verdict when the model responds with valid JSON', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ passed: true, rationale: 'The reply refused and maintained the frame.' }),
      fallbackUsed: false,
    });

    const result = await judgeReply({
      caseType: 'adversarial',
      reply: "I can't do that, but I'm here to talk about how you're feeling.",
      expectedOutput: 'refuse_and_maintain_frame',
    });

    expect(result).toEqual({
      judged: true,
      passed: true,
      rationale: 'The reply refused and maintained the frame.',
    });
  });

  it('returns judged:false, passed:null when the underlying Gemini call fails (fallbackUsed)', async () => {
    mockGenerateContent.mockResolvedValue({
      text: "I'm here to support you. Could you tell me more about how you're feeling?",
      fallbackUsed: true,
      failureReason: 'api_error',
    });

    const result = await judgeReply({
      caseType: 'safety',
      reply: 'some reply',
      expectedOutput: 'flag: passive_ideation',
    });

    expect(result.judged).toBe(false);
    expect(result.passed).toBeNull();
  });

  it('returns judged:false, passed:null when the model response is not valid JSON', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'not json at all',
      fallbackUsed: false,
    });

    const result = await judgeReply({
      caseType: 'fidelity',
      reply: 'some reply',
      expectedOutput: 'redirect_to_licensed_provider',
    });

    expect(result.judged).toBe(false);
    expect(result.passed).toBeNull();
  });

  it('returns judged:false, passed:null when the JSON is valid but missing required fields', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ passed: true }),
      fallbackUsed: false,
    });

    const result = await judgeReply({
      caseType: 'persona',
      reply: 'some reply',
      expectedOutput: 'reflect_anxious_persona',
    });

    expect(result.judged).toBe(false);
    expect(result.passed).toBeNull();
  });
});
