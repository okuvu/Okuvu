import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyGovernance } from '../agents/a9/agent.js';
import type { GovernanceInput } from '../agents/a9/types.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/generate-content.js', () => {
  return {
    generateContent: mockGenerateContent,
    DEFAULT_MAX_OUTPUT_TOKENS: 250,
    DEFAULT_TIMEOUT_MS: 10_000,
  };
});

function makeInput(overrides: Partial<GovernanceInput> = {}): GovernanceInput {
  return {
    userId: 'user-1',
    message: 'I have been feeling anxious lately',
    ...overrides,
  };
}

// Full valid v2.0 output — reasonCode/confidence are required by the parser
// now, so every "success path" mock needs them present.
function validJson(overrides: Partial<{
  governanceState: string;
  reasonCode: string | null;
  confidence: string;
  notes: string | null;
}> = {}): string {
  return JSON.stringify({
    governanceState: 'Active',
    reasonCode: null,
    confidence: 'medium',
    notes: null,
    ...overrides,
  });
}

describe('A9 Governance Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('governance state classification', () => {
    for (const state of ['Active', 'Restricted', 'Blocked'] as const) {
      it(`returns ${state} when Gemini responds with ${state}`, async () => {
        mockGenerateContent.mockResolvedValue({
          text: validJson({ governanceState: state }),
          fallbackUsed: false,
        });

        const result = await classifyGovernance(makeInput());

        expect(result.governanceState).toBe(state);
        expect(result.fallbackUsed).toBe(false);
      });
    }
  });

  describe('model selection', () => {
    it('calls Gemini Flash-Lite (not Pro)', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson(),
        fallbackUsed: false,
      });

      await classifyGovernance(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.model).toBe('gemini-2.5-flash');
    });

    it('defaults to gemini-2.5-flash when GEMINI_FLASH_LITE_MODEL is unset', async () => {
      const originalModel = process.env.GEMINI_FLASH_LITE_MODEL;
      delete process.env.GEMINI_FLASH_LITE_MODEL;

      try {
        vi.resetModules();
        const { classifyGovernance: freshClassify } = await import('../agents/a9/agent.js');

        mockGenerateContent.mockResolvedValue({
          text: validJson(),
          fallbackUsed: false,
        });

        await freshClassify(makeInput());

        const callArgs = mockGenerateContent.mock.calls[0][0];
        expect(callArgs.model).toBe('gemini-2.5-flash');
      } finally {
        if (originalModel === undefined) {
          delete process.env.GEMINI_FLASH_LITE_MODEL;
        } else {
          process.env.GEMINI_FLASH_LITE_MODEL = originalModel;
        }
      }
    });

    it('does not override model with a Gemini-specific name when LLM_PROVIDER=openrouter', async () => {
      const originalProvider = process.env.LLM_PROVIDER;
      process.env.LLM_PROVIDER = 'openrouter';

      try {
        vi.resetModules();
        const { classifyGovernance: freshClassify } = await import('../agents/a9/agent.js');

        mockGenerateContent.mockResolvedValue({
          text: validJson(),
          fallbackUsed: false,
        });

        await freshClassify(makeInput());

        const callArgs = mockGenerateContent.mock.calls[0][0];
        expect(callArgs.model).toBeUndefined();
      } finally {
        if (originalProvider === undefined) {
          delete process.env.LLM_PROVIDER;
        } else {
          process.env.LLM_PROVIDER = originalProvider;
        }
      }
    });
  });

  describe('generation config', () => {
    it('sets temperature to 0.0 (OKUVU v2.0 — deterministic governance classification)', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson(),
        fallbackUsed: false,
      });

      await classifyGovernance(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.generationConfig.temperature).toBe(0.0);
    });

    it('sets max_output_tokens to 200', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson(),
        fallbackUsed: false,
      });

      await classifyGovernance(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.generationConfig.maxOutputTokens).toBe(200);
    });

    it('sets responseMimeType to application/json', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson(),
        fallbackUsed: false,
      });

      await classifyGovernance(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.generationConfig.responseMimeType).toBe('application/json');
    });
  });

  describe('prompt construction', () => {
    it('passes the governance prompt as system instruction', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson(),
        fallbackUsed: false,
      });

      await classifyGovernance(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('governance gate of OKUVU');
      expect(callArgs.systemInstruction).toContain('Active');
      expect(callArgs.systemInstruction).toContain('Restricted');
      expect(callArgs.systemInstruction).toContain('Blocked');
    });

    it('includes the reasonCode taxonomy and the narrow-Blocked doctrine', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson(),
        fallbackUsed: false,
      });

      await classifyGovernance(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain('safety_relevant_defer');
      expect(callArgs.systemInstruction).toContain('boundary_repeat');
      expect(callArgs.systemInstruction).toContain('Blocked is narrow');
    });

    it('passes the user message as content', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson(),
        fallbackUsed: false,
      });

      await classifyGovernance(makeInput({ message: 'I want to hurt myself' }));

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.contents[0].parts[0].text).toBe('I want to hurt myself');
    });
  });

  describe('v2.0 output fields — reasonCode, confidence, notes', () => {
    it('passes through reasonCode and confidence', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson({ governanceState: 'Restricted', reasonCode: 'medication_request', confidence: 'high' }),
        fallbackUsed: false,
      });

      const result = await classifyGovernance(makeInput());

      expect(result.reasonCode).toBe('medication_request');
      expect(result.confidence).toBe('high');
    });

    it('passes through notes when present', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson({ notes: 'naive cry for help' }),
        fallbackUsed: false,
      });

      const result = await classifyGovernance(makeInput());

      expect(result.notes).toBe('naive cry for help');
    });

    it('defaults notes to null when omitted', async () => {
      const { notes: _omit, ...rest } = JSON.parse(validJson());
      mockGenerateContent.mockResolvedValue({ text: JSON.stringify(rest), fallbackUsed: false });

      const result = await classifyGovernance(makeInput());

      expect(result.notes).toBeNull();
    });

    it('falls back to Restricted when confidence is missing', async () => {
      const { confidence: _omit, ...rest } = JSON.parse(validJson());
      mockGenerateContent.mockResolvedValue({ text: JSON.stringify(rest), fallbackUsed: false });

      const result = await classifyGovernance(makeInput());

      expect(result.governanceState).toBe('Restricted');
      expect(result.fallbackUsed).toBe(true);
    });

    it('falls back to Restricted when reasonCode is an unknown value', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson({ reasonCode: 'not_a_real_code' }),
        fallbackUsed: false,
      });

      const result = await classifyGovernance(makeInput());

      expect(result.governanceState).toBe('Restricted');
      expect(result.fallbackUsed).toBe(true);
    });

    it('fallback output has fail-closed defaults (reasonCode: null, confidence: low, notes: parse_error)', async () => {
      mockGenerateContent.mockRejectedValue(new Error('timeout'));

      const result = await classifyGovernance(makeInput());

      expect(result.reasonCode).toBeNull();
      expect(result.confidence).toBe('low');
      expect(result.notes).toBe('parse_error');
    });
  });

  describe('fallback — malformed JSON', () => {
    it('falls back to Restricted when Gemini returns non-JSON text', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'Sure, here is my analysis...',
        fallbackUsed: false,
      });

      const result = await classifyGovernance(makeInput());

      expect(result.governanceState).toBe('Restricted');
      expect(result.fallbackUsed).toBe(true);
    });

    it('falls back to Restricted when JSON is invalid', async () => {
      mockGenerateContent.mockResolvedValue({
        text: '{bad json}',
        fallbackUsed: false,
      });

      const result = await classifyGovernance(makeInput());

      expect(result.governanceState).toBe('Restricted');
      expect(result.fallbackUsed).toBe(true);
    });
  });

  describe('fallback — missing or invalid fields', () => {
    it('falls back to Restricted when governanceState field is missing', async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({}),
        fallbackUsed: false,
      });

      const result = await classifyGovernance(makeInput());

      expect(result.governanceState).toBe('Restricted');
      expect(result.fallbackUsed).toBe(true);
    });

    it('falls back to Restricted when governanceState is not a string', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson({ governanceState: '42' }).replace('"42"', '42'),
        fallbackUsed: false,
      });

      const result = await classifyGovernance(makeInput());

      expect(result.governanceState).toBe('Restricted');
      expect(result.fallbackUsed).toBe(true);
    });

    it('falls back to Restricted when governanceState is an unknown value', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson({ governanceState: 'UnknownState' }),
        fallbackUsed: false,
      });

      const result = await classifyGovernance(makeInput());

      expect(result.governanceState).toBe('Restricted');
      expect(result.fallbackUsed).toBe(true);
    });

    it('does not normalize case — Active (capitalized) is valid, active (lowercase) is not', async () => {
      mockGenerateContent.mockResolvedValue({
        text: validJson({ governanceState: 'active' }),
        fallbackUsed: false,
      });

      const result = await classifyGovernance(makeInput());

      expect(result.governanceState).toBe('Restricted');
      expect(result.fallbackUsed).toBe(true);
    });
  });

  describe('fallback — API errors', () => {
    it('falls back to Restricted on timeout', async () => {
      mockGenerateContent.mockRejectedValue(new Error('LLM timeout'));

      const result = await classifyGovernance(makeInput());

      expect(result.governanceState).toBe('Restricted');
      expect(result.fallbackUsed).toBe(true);
    });

    it('falls back to Restricted on API failure', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API error'));

      const result = await classifyGovernance(makeInput());

      expect(result.governanceState).toBe('Restricted');
      expect(result.fallbackUsed).toBe(true);
    });

    it('falls back to Restricted on unexpected error', async () => {
      mockGenerateContent.mockRejectedValue(new Error('Something unexpected'));

      const result = await classifyGovernance(makeInput());

      expect(result.governanceState).toBe('Restricted');
      expect(result.fallbackUsed).toBe(true);
    });
  });

  describe('logging', () => {
    it('logs the governance state on successful classification', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      mockGenerateContent.mockResolvedValue({
        text: validJson({ governanceState: 'Active' }),
        fallbackUsed: false,
      });

      await classifyGovernance(makeInput());

      expect(infoSpy).toHaveBeenCalledWith(
        { governanceState: 'Active' },
        'A9: classification complete',
      );
      infoSpy.mockRestore();
    });

    it('logs the error on fallback', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      mockGenerateContent.mockRejectedValue(new Error('timeout'));

      await classifyGovernance(makeInput());

      expect(infoSpy).toHaveBeenCalledWith(
        { err: 'timeout' },
        'A9: error, falling back to Restricted',
      );
      infoSpy.mockRestore();
    });
  });
});
