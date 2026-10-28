import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateInsights } from '../agents/a10/agent.js';
import { buildInsightPrompt, buildCannedA10Json } from '../agents/a10/prompts.js';
import type { A10Input, Insight } from '../agents/a10/types.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('../lib/generate-content.js', () => ({
  generateContent: mockGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 250,
  DEFAULT_TIMEOUT_MS: 10_000,
}));

const GROUNDED_EVIDENCE = 'persistent worry about performance reviews at work';

const SUMMARIES: A10Input['sessionSummaries'] = [
  {
    sessionId: 's1',
    date: '2026-01-05',
    summary: `Client described ${GROUNDED_EVIDENCE}. Reported sleeping badly before one-to-ones.`,
  },
  {
    sessionId: 's2',
    date: '2026-01-12',
    summary: `Performance reviews again dominated the session; client described ${GROUNDED_EVIDENCE}.`,
  },
  {
    sessionId: 's3',
    date: '2026-01-19',
    summary: `Client reported better sleep after setting a cut-off time for email. Still described ${GROUNDED_EVIDENCE}.`,
  },
];

function makeInput(overrides: Partial<A10Input> = {}): A10Input {
  return { clientId: 'client_1', sessionSummaries: SUMMARIES, ...overrides };
}

function insight(overrides: Partial<Insight> = {}): Insight {
  return {
    id: 'i1',
    theme: 'anticipatory strain around performance reviews',
    evidence: [GROUNDED_EVIDENCE],
    confidence: 'medium',
    source_session_ids: ['s1', 's2'],
    ...overrides,
  };
}

function reply(insights: unknown[]): string {
  return JSON.stringify({ insights });
}

function mockReply(insights: unknown[]): void {
  mockGenerateContent.mockResolvedValue({ text: reply(insights), fallbackUsed: false });
}

describe('A10 Insight Generator — generateInsights', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('insufficient data — no model call', () => {
    it('returns insufficientData with zero summaries and never calls the model', async () => {
      const out = await generateInsights(makeInput({ sessionSummaries: [] }));

      expect(out.insights).toEqual([]);
      expect(out.insufficientData).toBe(true);
      expect(out.fallbackUsed).toBe(false);
      expect(out.failureReason).toBeNull();
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('returns insufficientData with two summaries under the default minimum of 3', async () => {
      const out = await generateInsights(makeInput({ sessionSummaries: SUMMARIES.slice(0, 2) }));

      expect(out.insights).toEqual([]);
      expect(out.insufficientData).toBe(true);
      expect(out.notes).toContain('insufficient_sessions:2<3');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('treats minSessions below 1 as the default of 3', async () => {
      const out = await generateInsights(makeInput({ sessionSummaries: SUMMARIES.slice(0, 2), minSessions: 0 }));

      expect(out.insufficientData).toBe(true);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('counts only summaries with an id and non-empty text toward the threshold', async () => {
      const out = await generateInsights(
        makeInput({
          sessionSummaries: [
            SUMMARIES[0],
            { sessionId: 's2', date: '2026-01-12', summary: '   ' },
            { sessionId: '', date: '2026-01-19', summary: 'something was discussed' },
          ],
        }),
      );

      expect(out.insufficientData).toBe(true);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('runs when an explicit lower minSessions is met', async () => {
      mockReply([insight()]);

      const out = await generateInsights(makeInput({ sessionSummaries: SUMMARIES.slice(0, 2), minSessions: 2 }));

      expect(out.insufficientData).toBe(false);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(out.insights).toHaveLength(1);
    });
  });

  describe('valid insights', () => {
    it('returns a grounded insight with every field intact', async () => {
      mockReply([insight()]);

      const out = await generateInsights(makeInput());

      expect(out.insufficientData).toBe(false);
      expect(out.fallbackUsed).toBe(false);
      expect(out.failureReason).toBeNull();
      expect(out.insights[0]).toEqual({
        id: 'i1',
        theme: 'anticipatory strain around performance reviews',
        evidence: [GROUNDED_EVIDENCE],
        confidence: 'medium',
        source_session_ids: ['s1', 's2'],
      });
    });

    it('accepts evidence after punctuation and case differ from the summary', async () => {
      mockReply([
        insight({ evidence: ['Persistent worry about performance reviews, at work'] }),
      ]);

      const out = await generateInsights(makeInput());

      expect(out.insights).toHaveLength(1);
      expect(out.notes).toBeNull();
    });

    it('deduplicates repeated source session ids', async () => {
      mockReply([insight({ source_session_ids: ['s1', 's1', 's2'] })]);

      const out = await generateInsights(makeInput());

      expect(out.insights[0].source_session_ids).toEqual(['s1', 's2']);
    });

    it('derives a deterministic id when the model omits one', async () => {
      const withoutId = { ...insight(), id: undefined };
      mockReply([withoutId]);

      const out = await generateInsights(makeInput());

      expect(out.insights).toHaveLength(1);
      expect(out.insights[0].id).toBe('insight_1');
    });

    it('returns an empty list, not a failure, when the model finds no pattern', async () => {
      mockReply([]);

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
      expect(out.fallbackUsed).toBe(false);
      expect(out.insufficientData).toBe(false);
      expect(out.notes).toBe('no_insights_returned');
    });
  });

  describe('grounding guard — discard, never repair', () => {
    it('drops an insight whose evidence is not in any supplied summary', async () => {
      mockReply([insight({ evidence: ['client is avoiding conflict with their manager'] })]);

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
      expect(out.fallbackUsed).toBe(false);
      expect(out.notes).toContain('dropped_ungrounded_evidence:1');
    });

    it('drops an insight when only one of several evidence strings is ungrounded', async () => {
      mockReply([insight({ evidence: [GROUNDED_EVIDENCE, 'reported waking at 3am every night'] })]);

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
    });

    it('keeps the grounded insight and drops only the invented one', async () => {
      mockReply([
        insight({ id: 'i1' }),
        insight({ id: 'i2', theme: 'sleep disruption before reviews', evidence: ['no such sentence exists'] }),
      ]);

      const out = await generateInsights(makeInput());

      expect(out.insights.map((i) => i.id)).toEqual(['i1']);
      expect(out.notes).toContain('dropped_ungrounded_evidence:1');
    });

    it('drops an insight with an empty evidence array', async () => {
      mockReply([insight({ evidence: [] })]);

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
      expect(out.notes).toContain('dropped_schema_invalid:1');
    });

    it('drops an insight citing a session id that was not supplied', async () => {
      mockReply([insight({ source_session_ids: ['s1', 's9'] })]);

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
      expect(out.notes).toContain('dropped_unknown_session_id:1');
    });

    it('drops an insight with an empty source_session_ids array', async () => {
      mockReply([insight({ source_session_ids: [] })]);

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
    });
  });

  describe('caps and content guards', () => {
    it('caps the output at five insights', async () => {
      const many = Array.from({ length: 8 }, (_unused, index) =>
        insight({ id: `i${index + 1}` }),
      );
      mockReply(many);

      const out = await generateInsights(makeInput());

      expect(out.insights).toHaveLength(5);
      expect(out.insights.map((i) => i.id)).toEqual(['i1', 'i2', 'i3', 'i4', 'i5']);
      expect(out.notes).toContain('capped_insights:3');
    });

    it('rejects a theme containing advice', async () => {
      mockReply([insight({ theme: 'you should leave your job' })]);

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
      expect(out.notes).toContain('dropped_theme_rejected:1');
    });

    it('rejects a theme carrying a diagnostic label', async () => {
      mockReply([insight({ theme: 'generalised anxiety disorder presentation' })]);

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
    });

    it('rejects a theme naming medication', async () => {
      mockReply([insight({ theme: 'medication review needed' })]);

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
    });

    it('rejects an insight with an unknown confidence value', async () => {
      mockReply([insight({ confidence: 'certain' as Insight['confidence'] })]);

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
    });
  });

  describe('technical failures fail closed', () => {
    it('returns no insights on timeout', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('llm_timeout');
    });

    it('returns no insights when the provider throws', async () => {
      mockGenerateContent.mockRejectedValue(new Error('boom'));

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('llm_api_error');
    });

    it('returns no insights on unparseable JSON', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Here are the patterns I found:', fallbackUsed: false });

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
      expect(out.failureReason).toBe('parse_failure');
    });

    it('returns no insights when insights is not an array', async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({ insights: 'three patterns' }),
        fallbackUsed: false,
      });

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
      expect(out.fallbackUsed).toBe(true);
      expect(out.failureReason).toBe('schema_invalid');
    });

    it('returns no insights when the required field is missing', async () => {
      mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ patterns: [] }), fallbackUsed: false });

      const out = await generateInsights(makeInput());

      expect(out.insights).toEqual([]);
      expect(out.failureReason).toBe('schema_invalid');
    });

    it('never fabricates an insight on a fallback path', async () => {
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'api_error' });

      const out = await generateInsights(makeInput());

      expect(out.fallbackUsed).toBe(true);
      expect(out.insights).toHaveLength(0);
    });
  });

  describe('call shape and prompt', () => {
    it('requests deterministic JSON with a canned sandbox reply', async () => {
      mockReply([insight()]);

      await generateInsights(makeInput());

      const args = mockGenerateContent.mock.calls[0][0];
      expect(args.generationConfig.temperature).toBe(0);
      expect(args.generationConfig.responseMimeType).toBe('application/json');
      expect(args.cannedResponse).toBeTruthy();
    });

    it('sends every summary id and the mood series in the user turn', async () => {
      mockReply([insight()]);

      await generateInsights(makeInput({ moodSeries: [{ date: '2026-01-06', score: 4 }] }));

      const userText = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
      expect(userText).toContain('s1');
      expect(userText).toContain('s2');
      expect(userText).toContain('s3');
      expect(userText).toContain('2026-01-06: 4/10');
    });

    it('prompt states the verbatim-evidence and no-diagnosis rules', () => {
      const prompt = buildInsightPrompt(makeInput());

      expect(prompt).toContain('verbatim substring');
      expect(prompt).toContain('Never diagnose');
      expect(prompt).not.toContain('undefined');
    });

    it('prompt frames the output as therapist-facing and descriptive', () => {
      const prompt = buildInsightPrompt(makeInput());

      expect(prompt).toContain('therapist');
      expect(prompt).toContain('Describe, do not prescribe');
      expect(prompt).toContain('never shown to the client');
    });

    it('canned reply is grounded JSON that survives the real parser', async () => {
      const canned = buildCannedA10Json(makeInput());
      const parsed = JSON.parse(canned) as { insights: Insight[] };
      expect(parsed.insights.length).toBeGreaterThan(0);

      mockGenerateContent.mockResolvedValue({ text: canned, fallbackUsed: false });
      const out = await generateInsights(makeInput());

      expect(out.fallbackUsed).toBe(false);
      expect(out.insights.length).toBe(parsed.insights.length);
      expect(out.notes).toBeNull();
    });
  });

  it('always returns the fixed A10Output shape', async () => {
    mockReply([insight()]);

    const out = await generateInsights(makeInput());

    expect(Object.keys(out).sort()).toEqual(
      ['fallbackUsed', 'failureReason', 'insufficientData', 'insights', 'notes'].sort(),
    );
  });
});
