import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scoreOnboardingTurn } from '../agents/a2/agent.js';
import { decideAssignment } from '../onboarding/care-plan-assignment.js';
import type { ScoredTurn } from '../onboarding/care-plan-assignment.js';
import type { ConversationTurn } from '../agents/a2/types.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/generate-content.js', () => {
  return {
    generateContent: mockGenerateContent,
    DEFAULT_MAX_OUTPUT_TOKENS: 250,
    DEFAULT_TIMEOUT_MS: 10_000,
  };
});

function makeOnboardingTurn(text: string, role: 'user' | 'assistant' = 'user'): ConversationTurn {
  return { role, content: text };
}

function makeScoredTurn(overrides: Partial<ScoredTurn> = {}): ScoredTurn {
  return {
    anxiety_score: 0.1,
    depression_score: 0.1,
    stress_score: 0.1,
    confidence: 0.7,
    reasoning_note: 'Generic assessment note',
    ...overrides,
  };
}

describe('scoreOnboardingTurn()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed OnboardingInferenceOutput on successful Gemini response', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        anxiety_score: 0.8,
        depression_score: 0.3,
        stress_score: 0.5,
        confidence: 0.85,
        reasoning_note: 'Clear anxiety indicators present',
      }),
      fallbackUsed: false,
    });

    const result = await scoreOnboardingTurn([
      makeOnboardingTurn('I feel really anxious all the time'),
    ]);

    expect(result.anxiety_score).toBe(0.8);
    expect(result.depression_score).toBe(0.3);
    expect(result.stress_score).toBe(0.5);
    expect(result.confidence).toBe(0.85);
    expect(result.reasoning_note).toBe('Clear anxiety indicators present');
  });

  it('returns fallback when Gemini call falls back', async () => {
    mockGenerateContent.mockResolvedValue({
      text: "I'm here to support you.",
      fallbackUsed: true,
    });

    const result = await scoreOnboardingTurn([
      makeOnboardingTurn('I feel anxious'),
    ]);

    expect(result.anxiety_score).toBe(0);
    expect(result.depression_score).toBe(0);
    expect(result.stress_score).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.reasoning_note).toContain('non-contributing');
  });

  it('returns fallback when Gemini returns malformed JSON', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '{bad json',
      fallbackUsed: false,
    });

    const result = await scoreOnboardingTurn([
      makeOnboardingTurn('I feel anxious'),
    ]);

    expect(result.anxiety_score).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('returns fallback when scores are out of valid range', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        anxiety_score: 1.5,
        depression_score: 0.3,
        stress_score: 0.5,
        confidence: 0.8,
        reasoning_note: 'Invalid scores',
      }),
      fallbackUsed: false,
    });

    const result = await scoreOnboardingTurn([
      makeOnboardingTurn('I feel anxious'),
    ]);

    expect(result.anxiety_score).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('returns fallback when scores are negative', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        anxiety_score: -0.1,
        depression_score: 0.3,
        stress_score: 0.5,
        confidence: 0.8,
        reasoning_note: 'Negative score',
      }),
      fallbackUsed: false,
    });

    const result = await scoreOnboardingTurn([
      makeOnboardingTurn('I feel anxious'),
    ]);

    expect(result.anxiety_score).toBe(0);
  });

  it('returns fallback when required fields are missing', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ anxiety_score: 0.8 }),
      fallbackUsed: false,
    });

    const result = await scoreOnboardingTurn([
      makeOnboardingTurn('I feel anxious'),
    ]);

    expect(result.anxiety_score).toBe(0);
  });

  it('returns fallback when reasoning_note is not a string', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        anxiety_score: 0.8,
        depression_score: 0.3,
        stress_score: 0.5,
        confidence: 0.8,
        reasoning_note: 123,
      }),
      fallbackUsed: false,
    });

    const result = await scoreOnboardingTurn([
      makeOnboardingTurn('I feel anxious'),
    ]);

    expect(result.confidence).toBe(0);
  });

  it('returns fallback on Gemini API error', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Vertex AI timeout'));

    const result = await scoreOnboardingTurn([
      makeOnboardingTurn('I feel anxious'),
    ]);

    expect(result.anxiety_score).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('passes conversation turns as contents to Gemini', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        anxiety_score: 0.5,
        depression_score: 0.3,
        stress_score: 0.4,
        confidence: 0.6,
        reasoning_note: 'Moderate indicators',
      }),
      fallbackUsed: false,
    });

    const turns = [
      makeOnboardingTurn('I have been feeling anxious', 'user'),
      makeOnboardingTurn('That sounds challenging.', 'assistant'),
      makeOnboardingTurn('Yes, it affects my sleep', 'user'),
    ];

    await scoreOnboardingTurn(turns);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.contents).toHaveLength(3);
    expect(callArgs.contents[0].role).toBe('user');
    expect(callArgs.contents[1].role).toBe('model');
    expect(callArgs.contents[2].role).toBe('user');
  });

  it('uses the scoring prompt as system instruction', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        anxiety_score: 0.5,
        depression_score: 0.3,
        stress_score: 0.4,
        confidence: 0.6,
        reasoning_note: 'Moderate',
      }),
      fallbackUsed: false,
    });

    await scoreOnboardingTurn([makeOnboardingTurn('I feel anxious')]);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.systemInstruction).toContain('anxiety_score');
    expect(callArgs.systemInstruction).toContain('depression_score');
    expect(callArgs.systemInstruction).toContain('stress_score');
    expect(callArgs.systemInstruction).not.toContain('carePlan');
  });

  it('uses responseSchema with JSON mime type', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        anxiety_score: 0.5,
        depression_score: 0.3,
        stress_score: 0.4,
        confidence: 0.6,
        reasoning_note: 'Moderate',
      }),
      fallbackUsed: false,
    });

    await scoreOnboardingTurn([makeOnboardingTurn('I feel anxious')]);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.generationConfig.responseMimeType).toBe('application/json');
    expect(callArgs.generationConfig.responseSchema).toBeDefined();
    expect(callArgs.generationConfig.responseSchema.properties.anxiety_score.type).toBe('NUMBER');
  });

  it('sets maxOutputTokens to 500', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        anxiety_score: 0.5,
        depression_score: 0.3,
        stress_score: 0.4,
        confidence: 0.6,
        reasoning_note: 'Moderate',
      }),
      fallbackUsed: false,
    });

    await scoreOnboardingTurn([makeOnboardingTurn('I feel anxious')]);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.generationConfig.maxOutputTokens).toBe(500);
  });
});

describe('decideAssignment()', () => {
  describe('Positive cases — confirmed assignments', () => {
    it('3 turns with high anxiety → CP1 + confirmed', () => {
      const result = decideAssignment([
        makeScoredTurn({ anxiety_score: 0.8, depression_score: 0.2, stress_score: 0.2, confidence: 0.6, reasoning_note: 'Turn 1' }),
        makeScoredTurn({ anxiety_score: 0.85, depression_score: 0.2, stress_score: 0.2, confidence: 0.65, reasoning_note: 'Turn 2' }),
        makeScoredTurn({ anxiety_score: 0.9, depression_score: 0.15, stress_score: 0.1, confidence: 0.75, reasoning_note: 'Turn 3' }),
      ]);

      expect(result.care_plan_id).toBe('CP1');
      expect(result.assignment_state).toBe('confirmed');
      expect(result.confidence_at_last_eval).toBe(0.75);
      expect(result.turns_evaluated).toBe(3);
    });

    it('3 turns with high depression → CP2 + confirmed', () => {
      const result = decideAssignment([
        makeScoredTurn({ anxiety_score: 0.2, depression_score: 0.75, stress_score: 0.2, confidence: 0.6, reasoning_note: 'Turn 1' }),
        makeScoredTurn({ anxiety_score: 0.2, depression_score: 0.8, stress_score: 0.2, confidence: 0.65, reasoning_note: 'Turn 2' }),
        makeScoredTurn({ anxiety_score: 0.15, depression_score: 0.85, stress_score: 0.1, confidence: 0.8, reasoning_note: 'Turn 3' }),
      ]);

      expect(result.care_plan_id).toBe('CP2');
      expect(result.assignment_state).toBe('confirmed');
    });

    it('3 turns with high stress → CP3 + confirmed', () => {
      const result = decideAssignment([
        makeScoredTurn({ anxiety_score: 0.2, depression_score: 0.2, stress_score: 0.7, confidence: 0.6, reasoning_note: 'Turn 1' }),
        makeScoredTurn({ anxiety_score: 0.2, depression_score: 0.2, stress_score: 0.8, confidence: 0.7, reasoning_note: 'Turn 2' }),
        makeScoredTurn({ anxiety_score: 0.1, depression_score: 0.1, stress_score: 0.9, confidence: 0.85, reasoning_note: 'Turn 3' }),
      ]);

      expect(result.care_plan_id).toBe('CP3');
      expect(result.assignment_state).toBe('confirmed');
    });
  });

  describe('Negative cases — fallback and low confidence', () => {
    it('3 turns of low/ambiguous scores → CP1 + provisional', () => {
      const result = decideAssignment([
        makeScoredTurn({ anxiety_score: 0.15, depression_score: 0.1, stress_score: 0.12, confidence: 0.2, reasoning_note: 'Turn 1' }),
        makeScoredTurn({ anxiety_score: 0.1, depression_score: 0.15, stress_score: 0.12, confidence: 0.25, reasoning_note: 'Turn 2' }),
        makeScoredTurn({ anxiety_score: 0.12, depression_score: 0.1, stress_score: 0.15, confidence: 0.3, reasoning_note: 'Turn 3' }),
      ]);

      expect(result.care_plan_id).toBe('CP1');
      expect(result.assignment_state).toBe('provisional');
      expect(result.reasoning_note).toContain('below minimal floor');
    });

    it('3 turns with high scores but low confidence → CP1 + provisional', () => {
      const result = decideAssignment([
        makeScoredTurn({ anxiety_score: 0.8, depression_score: 0.2, stress_score: 0.2, confidence: 0.3, reasoning_note: 'Turn 1' }),
        makeScoredTurn({ anxiety_score: 0.85, depression_score: 0.2, stress_score: 0.2, confidence: 0.4, reasoning_note: 'Turn 2' }),
        makeScoredTurn({ anxiety_score: 0.9, depression_score: 0.15, stress_score: 0.1, confidence: 0.5, reasoning_note: 'Turn 3' }),
      ]);

      expect(result.assignment_state).toBe('provisional');
      expect(result.confidence_at_last_eval).toBe(0.5);
      expect(result.care_plan_id).toBe('CP1');
    });

    it('treats all scores strictly below floor → CP1 + provisional', () => {
      const result = decideAssignment([
        makeScoredTurn({ anxiety_score: 0.25, depression_score: 0.2, stress_score: 0.15, confidence: 0.4, reasoning_note: 'Below floor' }),
      ]);

      expect(result.care_plan_id).toBe('CP1');
      expect(result.assignment_state).toBe('provisional');
      expect(result.reasoning_note).toContain('below minimal floor');
    });
  });

  describe('Edge cases', () => {
    it('empty turns array → CP1 + provisional with 0 turns', () => {
      const result = decideAssignment([]);

      expect(result.care_plan_id).toBe('CP1');
      expect(result.assignment_state).toBe('provisional');
      expect(result.turns_evaluated).toBe(0);
      expect(result.confidence_at_last_eval).toBe(0);
    });

    it('single turn → provisional (less than 3 turns)', () => {
      const result = decideAssignment([
        makeScoredTurn({ anxiety_score: 0.9, depression_score: 0.1, stress_score: 0.1, confidence: 0.85, reasoning_note: 'Single turn' }),
      ]);

      expect(result.assignment_state).toBe('provisional');
      expect(result.turns_evaluated).toBe(1);
      expect(result.care_plan_id).toBe('CP1');
    });

    it('2 turns with high confidence → provisional (less than 3 turns)', () => {
      const result = decideAssignment([
        makeScoredTurn({ anxiety_score: 0.9, depression_score: 0.1, stress_score: 0.1, confidence: 0.8, reasoning_note: 'Turn 1' }),
        makeScoredTurn({ anxiety_score: 0.85, depression_score: 0.1, stress_score: 0.1, confidence: 0.9, reasoning_note: 'Turn 2' }),
      ]);

      expect(result.assignment_state).toBe('provisional');
      expect(result.turns_evaluated).toBe(2);
    });

    it('high confidence on Turn 1, low on Turns 2-3 → state reflects confidence_at_last_eval', () => {
      const result = decideAssignment([
        makeScoredTurn({ anxiety_score: 0.85, depression_score: 0.1, stress_score: 0.1, confidence: 0.85, reasoning_note: 'High confidence turn 1' }),
        makeScoredTurn({ anxiety_score: 0.35, depression_score: 0.2, stress_score: 0.2, confidence: 0.3, reasoning_note: 'Low confidence turn 2' }),
        makeScoredTurn({ anxiety_score: 0.4, depression_score: 0.15, stress_score: 0.15, confidence: 0.25, reasoning_note: 'Low confidence turn 3' }),
      ]);

      expect(result.confidence_at_last_eval).toBe(0.25);
      expect(result.care_plan_id).toBe('CP1');
      expect(result.assignment_state).toBe('provisional');
    });

    it('tie-breaking: two domains similarly high → uses cumulative sum, falls back to CP1 on persistent tie', () => {
      const result = decideAssignment([
        makeScoredTurn({ anxiety_score: 0.7, depression_score: 0.7, stress_score: 0.1, confidence: 0.7, reasoning_note: 'Turn 1 — anxiety and depression tied' }),
        makeScoredTurn({ anxiety_score: 0.75, depression_score: 0.75, stress_score: 0.1, confidence: 0.7, reasoning_note: 'Turn 2 — still tied' }),
        makeScoredTurn({ anxiety_score: 0.72, depression_score: 0.72, stress_score: 0.1, confidence: 0.8, reasoning_note: 'Turn 3 — still tied' }),
      ]);

      expect(result.care_plan_id).toBe('CP1');
    });

    it('tie-breaking: cumulative sum breaks tie correctly', () => {
      const result = decideAssignment([
        makeScoredTurn({ anxiety_score: 0.7, depression_score: 0.7, stress_score: 0.1, confidence: 0.7, reasoning_note: 'Turn 1 — tied' }),
        makeScoredTurn({ anxiety_score: 0.72, depression_score: 0.7, stress_score: 0.1, confidence: 0.7, reasoning_note: 'Turn 2 — anxiety slightly higher cumulatively' }),
        makeScoredTurn({ anxiety_score: 0.72, depression_score: 0.7, stress_score: 0.1, confidence: 0.8, reasoning_note: 'Turn 3' }),
      ]);

      expect(result.care_plan_id).toBe('CP1');
    });

    it('reasoning_note concatenates all turn notes', () => {
      const result = decideAssignment([
        makeScoredTurn({ anxiety_score: 0.8, depression_score: 0.2, stress_score: 0.1, confidence: 0.5, reasoning_note: 'First assessment' }),
        makeScoredTurn({ anxiety_score: 0.85, depression_score: 0.2, stress_score: 0.1, confidence: 0.6, reasoning_note: 'Second assessment' }),
        makeScoredTurn({ anxiety_score: 0.9, depression_score: 0.15, stress_score: 0.1, confidence: 0.75, reasoning_note: 'Third assessment' }),
      ]);

      expect(result.reasoning_note).toContain('Turn 1: First assessment');
      expect(result.reasoning_note).toContain('Turn 2: Second assessment');
      expect(result.reasoning_note).toContain('Turn 3: Third assessment');
    });
  });

  describe('determinism', () => {
    it('produces identical results for identical inputs', () => {
      const turns = [
        makeScoredTurn({ anxiety_score: 0.8, depression_score: 0.3, stress_score: 0.2, confidence: 0.75, reasoning_note: 'Test' }),
        makeScoredTurn({ anxiety_score: 0.85, depression_score: 0.25, stress_score: 0.2, confidence: 0.8, reasoning_note: 'Test 2' }),
        makeScoredTurn({ anxiety_score: 0.9, depression_score: 0.2, stress_score: 0.15, confidence: 0.85, reasoning_note: 'Test 3' }),
      ];

      const first = decideAssignment(turns);
      const second = decideAssignment(turns);

      expect(first).toEqual(second);
    });
  });
});
