import { describe, it, expect, vi, beforeEach } from 'vitest';
import { a9PostReview } from '../agents/a9-post/agent.js';
import type { A9PostInput } from '../agents/a9-post/types.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/vertex-ai.js', () => {
  return {
    generateContent: mockGenerateContent,
    DEFAULT_MAX_OUTPUT_TOKENS: 250,
    DEFAULT_TIMEOUT_MS: 10_000,
  };
});

function makeInput(overrides: Partial<A9PostInput> = {}): A9PostInput {
  return {
    userContent: 'That sounds really difficult. How are you coping with it?',
    safetyState: 'S1',
    carePlan: 'CP1',
    ...overrides,
  };
}

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    text: JSON.stringify({
      decision: 'APPROVED',
      violation_type: null,
      confidence: 'high',
      ...overrides,
    }),
    fallbackUsed: false,
  };
}

describe('A9-post content review agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('decision classification', () => {
    it('returns APPROVED for benign content', async () => {
      mockGenerateContent.mockResolvedValue(makeResult());

      const result = await a9PostReview(makeInput());

      expect(result.decision).toBe('APPROVED');
      expect(result.violation_type).toBeNull();
      expect(result.confidence).toBe('high');
    });

    it('returns BLOCKED for clinical diagnostic language', async () => {
      mockGenerateContent.mockResolvedValue(makeResult({
        decision: 'BLOCKED',
        violation_type: 'clinical_diagnostic_language',
        confidence: 'high',
      }));

      const result = await a9PostReview(makeInput({
        userContent: 'You have anxiety disorder.',
      }));

      expect(result.decision).toBe('BLOCKED');
      expect(result.violation_type).toBe('clinical_diagnostic_language');
    });

    it('returns BLOCKED for direct advice', async () => {
      mockGenerateContent.mockResolvedValue(makeResult({
        decision: 'BLOCKED',
        violation_type: 'direct_advice',
        confidence: 'high',
      }));

      const result = await a9PostReview(makeInput({
        userContent: 'You should try breathing exercises.',
      }));

      expect(result.decision).toBe('BLOCKED');
      expect(result.violation_type).toBe('direct_advice');
    });

    it('returns BLOCKED for outcome promises', async () => {
      mockGenerateContent.mockResolvedValue(makeResult({
        decision: 'BLOCKED',
        violation_type: 'outcome_promise',
        confidence: 'medium',
      }));

      const result = await a9PostReview(makeInput({
        userContent: 'This will help you feel better.',
      }));

      expect(result.decision).toBe('BLOCKED');
      expect(result.violation_type).toBe('outcome_promise');
    });

    it('returns BLOCKED for cognitive reframes', async () => {
      mockGenerateContent.mockResolvedValue(makeResult({
        decision: 'BLOCKED',
        violation_type: 'cognitive_reframe',
        confidence: 'high',
      }));

      const result = await a9PostReview(makeInput({
        userContent: 'Maybe another way to look at this is...',
      }));

      expect(result.decision).toBe('BLOCKED');
      expect(result.violation_type).toBe('cognitive_reframe');
    });

    it('returns BLOCKED for causal attribution', async () => {
      mockGenerateContent.mockResolvedValue(makeResult({
        decision: 'BLOCKED',
        violation_type: 'causal_attribution',
        confidence: 'high',
      }));

      const result = await a9PostReview(makeInput({
        userContent: 'Your anxiety is caused by your childhood experiences.',
      }));

      expect(result.decision).toBe('BLOCKED');
      expect(result.violation_type).toBe('causal_attribution');
    });

    it('returns BLOCKED for medication references', async () => {
      mockGenerateContent.mockResolvedValue(makeResult({
        decision: 'BLOCKED',
        violation_type: 'medication_reference',
        confidence: 'high',
      }));

      const result = await a9PostReview(makeInput({
        userContent: 'Have you considered discussing SSRIs with your doctor?',
      }));

      expect(result.decision).toBe('BLOCKED');
      expect(result.violation_type).toBe('medication_reference');
    });

    it('returns BLOCKED for content inappropriate for safety state', async () => {
      mockGenerateContent.mockResolvedValue(makeResult({
        decision: 'BLOCKED',
        violation_type: 'safety_state_inappropriate',
        confidence: 'high',
      }));

      const result = await a9PostReview(makeInput({
        safetyState: 'S0',
        userContent: 'It sounds like you are in crisis. Please call a helpline.',
      }));

      expect(result.decision).toBe('BLOCKED');
      expect(result.violation_type).toBe('safety_state_inappropriate');
    });
  });

  describe('model selection', () => {
    it('calls Gemini Flash-Lite (not Pro)', async () => {
      mockGenerateContent.mockResolvedValue(makeResult());

      await a9PostReview(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.model).toBe('gemini-2.5-flash');
    });
  });

  describe('generation config', () => {
    it('sets temperature to 0.0', async () => {
      mockGenerateContent.mockResolvedValue(makeResult());

      await a9PostReview(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.generationConfig.temperature).toBe(0.0);
    });

    it('sets max_output_tokens to 1024 (not 100 — Gemini 2.5\'s internal "thinking" tokens can consume a tight budget entirely before any visible output; even 300 still hit MAX_TOKENS or silent mid-JSON truncation on real, longer userContent)', async () => {
      mockGenerateContent.mockResolvedValue(makeResult());

      await a9PostReview(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.generationConfig.maxOutputTokens).toBe(1024);
    });

    it('disables thinking (thinkingBudget: 0) — a fixed-shape classification task that does not need reasoning tokens, and even a 1024-token cap did not fully eliminate MAX_TOKENS live', async () => {
      mockGenerateContent.mockResolvedValue(makeResult());

      await a9PostReview(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    });

    it('sets responseMimeType to application/json', async () => {
      mockGenerateContent.mockResolvedValue(makeResult());

      await a9PostReview(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.generationConfig.responseMimeType).toBe('application/json');
    });
  });

  describe('prompt construction', () => {
    it('includes user content, safety state, and care plan in the prompt', async () => {
      mockGenerateContent.mockResolvedValue(makeResult());

      await a9PostReview(makeInput({
        userContent: 'Some test content',
        safetyState: 'S2',
        carePlan: 'CP2',
      }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('Some test content');
      expect(callArgs.systemInstruction).toContain('S2');
      expect(callArgs.systemInstruction).toContain('CP2');
    });

    it('lists all seven prohibited categories', async () => {
      mockGenerateContent.mockResolvedValue(makeResult());

      await a9PostReview(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('Clinical diagnostic language');
      expect(callArgs.systemInstruction).toContain('Direct advice');
      expect(callArgs.systemInstruction).toContain('Outcome promises');
      expect(callArgs.systemInstruction).toContain('Cognitive reframes');
      expect(callArgs.systemInstruction).toContain('Causal attribution');
      expect(callArgs.systemInstruction).toContain('Prescription or medication');
      expect(callArgs.systemInstruction).toContain('Content inappropriate for the current safety state');
    });
  });

  describe('fallback — malformed JSON', () => {
    it('falls back to APPROVED when Gemini returns non-JSON text', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'Sure, here is my analysis...',
        fallbackUsed: false,
      });

      const result = await a9PostReview(makeInput());

      expect(result.decision).toBe('APPROVED');
      expect(result.violation_type).toBeNull();
      expect(result.confidence).toBe('low');
    });

    it('falls back to APPROVED when JSON is invalid', async () => {
      mockGenerateContent.mockResolvedValue({
        text: '{bad json}',
        fallbackUsed: false,
      });

      const result = await a9PostReview(makeInput());

      expect(result.decision).toBe('APPROVED');
      expect(result.violation_type).toBeNull();
    });
  });

  describe('fallback — missing or invalid fields', () => {
    it('falls back to APPROVED when response is not an object', async () => {
      mockGenerateContent.mockResolvedValue({
        text: '"just a string"',
        fallbackUsed: false,
      });

      const result = await a9PostReview(makeInput());

      expect(result.decision).toBe('APPROVED');
      expect(result.confidence).toBe('low');
    });

    it('falls back to APPROVED when decision is missing', async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({ violation_type: null, confidence: 'high' }),
        fallbackUsed: false,
      });

      const result = await a9PostReview(makeInput());

      expect(result.decision).toBe('APPROVED');
    });

    it('falls back to APPROVED when decision is invalid', async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({ decision: 'INVALID', violation_type: null, confidence: 'high' }),
        fallbackUsed: false,
      });

      const result = await a9PostReview(makeInput());

      expect(result.decision).toBe('APPROVED');
    });

    it('falls back to APPROVED when confidence is invalid', async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({ decision: 'APPROVED', violation_type: null, confidence: 'invalid' }),
        fallbackUsed: false,
      });

      const result = await a9PostReview(makeInput());

      expect(result.decision).toBe('APPROVED');
    });

    it('falls back to APPROVED when violation_type is not string or null', async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({ decision: 'BLOCKED', violation_type: 42, confidence: 'high' }),
        fallbackUsed: false,
      });

      const result = await a9PostReview(makeInput());

      expect(result.decision).toBe('APPROVED');
    });

    it('does not normalize case — APPROVED (uppercase) is valid, approved (lowercase) is not', async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({ decision: 'approved', violation_type: null, confidence: 'high' }),
        fallbackUsed: false,
      });

      const result = await a9PostReview(makeInput());

      expect(result.decision).toBe('APPROVED');
    });
  });

  describe('API errors', () => {
    it('throws on timeout for caller to handle failover', async () => {
      mockGenerateContent.mockRejectedValue(new Error('Vertex AI timeout'));

      await expect(a9PostReview(makeInput())).rejects.toThrow('Vertex AI timeout');
    });

    it('throws on API failure for caller to handle failover', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API error'));

      await expect(a9PostReview(makeInput())).rejects.toThrow('API error');
    });
  });

  describe('logging', () => {
    it('logs the decision on successful review', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      mockGenerateContent.mockResolvedValue(makeResult({
        decision: 'BLOCKED',
        violation_type: 'direct_advice',
        confidence: 'high',
      }));

      await a9PostReview(makeInput({ userContent: 'You should do X.' }));

      expect(infoSpy).toHaveBeenCalledWith(
        { decision: 'BLOCKED', violation_type: 'direct_advice', confidence: 'high' },
        'A9-post: review complete',
      );
      infoSpy.mockRestore();
    });

    it('logs the error on throw', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      mockGenerateContent.mockRejectedValue(new Error('timeout'));

      await expect(a9PostReview(makeInput())).rejects.toThrow();
      expect(infoSpy).toHaveBeenCalledWith(
        { err: 'timeout' },
        'A9-post: error, throwing for caller to handle failover',
      );
      infoSpy.mockRestore();
    });
  });
});
