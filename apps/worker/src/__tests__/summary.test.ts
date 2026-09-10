import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SummaryResult } from '../lib/summary.js';

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockGenerateContent = vi.fn();
const mockCount = vi.fn();
const mockUserMemoryFind = vi.fn();
const mockUserMemoryUpsert = vi.fn();
const mockExecuteRaw = vi.fn();
const mockGenerateEmbedding = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  getPrisma: () => ({
    sessionLog: { findUnique: mockFindUnique, count: mockCount },
    sessionSummary: { upsert: mockUpsert },
    userMemory: { findUnique: mockUserMemoryFind, upsert: mockUserMemoryUpsert },
    $executeRaw: mockExecuteRaw,
  }),
}));

vi.mock('../lib/embedding.js', () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

vi.mock('../lib/vertex-ai.js', () => ({
  generateContent: mockGenerateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 1000,
  DEFAULT_TIMEOUT_MS: 25_000,
}));

function mockLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    user_id: 'user-1',
    session_started_at: new Date('2026-07-06T10:00:00Z'),
    session_ended_at: new Date('2026-07-06T10:30:00Z'),
    turn_count: 8,
    session_feedback_score: null,
    turns: [],
    ...overrides,
  };
}

function makeTurn(role: string, content: string, turnNumber: number) {
  return { role, content, turn_number: turnNumber };
}

function makeTranscriptTurns(count: number) {
  const turns: Array<{ role: string; content: string; turn_number: number }> = [];
  for (let i = 0; i < count; i++) {
    const num = i + 1;
    turns.push(makeTurn('user', `User message ${num}`, num));
    turns.push(makeTurn('assistant', `Assistant response ${num}`, num));
  }
  return turns;
}

const validFlashLiteOutput = JSON.stringify({
  narrative_summary: 'User discussed feeling anxious about work deadlines and mentioned sleep difficulties.',
  themes: ['anxiety', 'work stress', 'sleep'],
  emotional_state: 'anxious but engaged',
  key_points: ['User has upcoming deadlines', 'Reports trouble falling asleep'],
});

describe('generateSessionSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('positive — normal session', () => {
    it('generates a summary and upserts as COMPLETED for an 8-turn session', async () => {
      const turns = makeTranscriptTurns(4); // 4 user + 4 assistant = 8 turns
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 8 }));
      mockGenerateContent.mockResolvedValue({ text: validFlashLiteOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      const result = await generateSessionSummary('sess-1', 'user-1', logger);

      expect(result.status).toBe('completed');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: 'COMPLETED' }),
          update: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('includes the transcript in the Flash-Lite call', async () => {
      const turns = makeTranscriptTurns(2);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 4 }));
      mockGenerateContent.mockResolvedValue({ text: validFlashLiteOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      await generateSessionSummary('sess-1', 'user-1', logger);

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.contents[0].parts[0].text).toContain('User message 1');
      expect(callArgs.contents[0].parts[0].text).toContain('Assistant response 2');
      expect(callArgs.generationConfig.responseMimeType).toBe('application/json');
    });

    it('sets temperature to 0.0 (OKUVU v2.0 — deterministic summarization)', async () => {
      const turns = makeTranscriptTurns(2);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 4 }));
      mockGenerateContent.mockResolvedValue({ text: validFlashLiteOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      await generateSessionSummary('sess-1', 'user-1', logger);

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.generationConfig.temperature).toBe(0.0);
    });
  });

  describe('OKUVU v2.0 output — homework_progress, safety_flags, and other new fields', () => {
    const richOutput = JSON.stringify({
      narrative_summary: 'User opened about exam pressure and did a grounding exercise.',
      themes: ['exam pressure', 'sleep'],
      emotional_state: 'anxious at open, settled after grounding',
      techniques_used: ['grounding_5431'],
      homework_progress: {
        assigned: '5-4-3-2-1 grounding before bed',
        user_reported: 'not_done',
        user_quotes: ['yaar homework hi nahi hua, bhool hi gayi'],
      },
      safety_flags: {
        crisis_language_detected: false,
        elevated_risk_turns: 0,
        escalation_handled: 'none_needed',
        quotes: [],
      },
      referrals_made: 'therapist_referral',
      key_points: ['exam pressure primary stressor'],
      open_loops: ['grounding homework still pending'],
      language: 'hinglish',
    });

    it('accepts the full v2.0 shape (homework_progress, safety_flags, referrals_made, open_loops, language) and persists it as COMPLETED', async () => {
      const turns = makeTranscriptTurns(4);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 8 }));
      mockGenerateContent.mockResolvedValue({ text: richOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      const result = await generateSessionSummary('sess-1', 'user-1', logger);

      expect(result.status).toBe('completed');
      const upsertCall = mockUpsert.mock.calls[0][0];
      const persisted = JSON.parse(upsertCall.create.summary_text);
      expect(persisted.homework_progress.user_reported).toBe('not_done');
      expect(persisted.safety_flags.crisis_language_detected).toBe(false);
      expect(persisted.referrals_made).toBe('therapist_referral');
      expect(persisted.open_loops).toEqual(['grounding homework still pending']);
      expect(persisted.language).toBe('hinglish');
    });

    it('still succeeds when the new v2.0 fields are entirely absent (backward-tolerant parsing)', async () => {
      const turns = makeTranscriptTurns(4);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 8 }));
      mockGenerateContent.mockResolvedValue({ text: validFlashLiteOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      const result = await generateSessionSummary('sess-1', 'user-1', logger);

      expect(result.status).toBe('completed');
    });
  });

  describe('positive — idempotent upsert', () => {
    it('updates in place on duplicate delivery, not creating a second record', async () => {
      const turns = makeTranscriptTurns(3);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 6 }));
      mockGenerateContent.mockResolvedValue({ text: validFlashLiteOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();

      const first = await generateSessionSummary('sess-1', 'user-1', logger);
      expect(first.status).toBe('completed');
      expect(mockUpsert).toHaveBeenCalledTimes(1);

      const second = await generateSessionSummary('sess-1', 'user-1', logger);
      expect(second.status).toBe('completed');
      expect(mockUpsert).toHaveBeenCalledTimes(2);

      const firstCall = mockUpsert.mock.calls[0][0];
      const secondCall = mockUpsert.mock.calls[1][0];

      expect(firstCall.where).toEqual(
        { user_id_session_id: { user_id: 'user-1', session_id: 'sess-1' } },
      );
      expect(secondCall.where).toEqual(
        { user_id_session_id: { user_id: 'user-1', session_id: 'sess-1' } },
      );

      expect(firstCall.create.user_id).toBe('user-1');
      expect(firstCall.create.session_id).toBe('sess-1');
      expect(secondCall.create.user_id).toBe('user-1');
      expect(secondCall.create.session_id).toBe('sess-1');

      expect(firstCall.create.last_updated_turn).toBe(6);
      expect(secondCall.create.last_updated_turn).toBe(6);
    });
  });

  describe('negative — trivial session', () => {
    it('skips LLM call and upserts SKIPPED_TRIVIAL for a zero-turn session', async () => {
      mockFindUnique.mockResolvedValue(makeSession({ turns: [], turn_count: 0 }));

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      const result = await generateSessionSummary('sess-1', 'user-1', logger);

      expect(result.status).toBe('skipped_trivial');
      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: 'SKIPPED_TRIVIAL', summary_text: null }),
          update: expect.objectContaining({ status: 'SKIPPED_TRIVIAL', summary_text: null }),
        }),
      );
    });

    it('skips LLM call and upserts SKIPPED_TRIVIAL for a one-turn session', async () => {
      mockFindUnique.mockResolvedValue(
        makeSession({ turns: [makeTurn('user', 'hi', 1)], turn_count: 1 }),
      );

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      const result = await generateSessionSummary('sess-1', 'user-1', logger);

      expect(result.status).toBe('skipped_trivial');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });
  });

  describe('edge — long transcript', () => {
    it('truncates to the most recent 20 turns when session exceeds the limit', async () => {
      const turns = makeTranscriptTurns(15); // 30 turns total (15 user + 15 assistant)
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 30 }));
      mockGenerateContent.mockResolvedValue({ text: validFlashLiteOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      const result = await generateSessionSummary('sess-1', 'user-1', logger);

      expect(result.status).toBe('completed');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);

      const callArgs = mockGenerateContent.mock.calls[0][0];
      const transcript = callArgs.contents[0].parts[0].text;
      const lines = transcript.split('\n').filter((l: string) => l.trim());

      expect(lines.length).toBe(20);
      expect(transcript).toContain('User message 6');
      expect(transcript).not.toContain('User message 5');
    });
  });

  describe('edge — malformed Flash-Lite output', () => {
    it('throws error when Flash-Lite returns non-JSON text', async () => {
      const turns = makeTranscriptTurns(3);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 6 }));
      mockGenerateContent.mockResolvedValue({ text: 'Sure, here is my analysis...', fallbackUsed: false });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();

      await expect(generateSessionSummary('sess-1', 'user-1', logger))
        .rejects.toThrow('Malformed Flash-Lite output');
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });

    it('throws error when JSON is missing required narrative_summary', async () => {
      const turns = makeTranscriptTurns(3);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 6 }));
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({ themes: ['anxiety'] }),
        fallbackUsed: false,
      });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();

      await expect(generateSessionSummary('sess-1', 'user-1', logger))
        .rejects.toThrow('Malformed Flash-Lite output');
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });

    it('throws error when themes is not an array', async () => {
      const turns = makeTranscriptTurns(3);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 6 }));
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({ narrative_summary: 'Summary.', themes: 'not-an-array' }),
        fallbackUsed: false,
      });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();

      await expect(generateSessionSummary('sess-1', 'user-1', logger))
        .rejects.toThrow('Malformed Flash-Lite output');
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge — Flash-Lite API failure', () => {
    it('throws error when Flash-Lite call fails (fallbackUsed=true)', async () => {
      const turns = makeTranscriptTurns(3);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 6 }));
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'api_error' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();

      await expect(generateSessionSummary('sess-1', 'user-1', logger))
        .rejects.toThrow('Flash-Lite call failed: api_error');
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });

    it('throws error on timeout', async () => {
      const turns = makeTranscriptTurns(3);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 6 }));
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();

      await expect(generateSessionSummary('sess-1', 'user-1', logger))
        .rejects.toThrow('Flash-Lite call failed: timeout');
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge — session not found', () => {
    it('returns session_not_found status without throwing when session_id does not exist', async () => {
      mockFindUnique.mockResolvedValue(null);

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      const result = await generateSessionSummary('nonexistent', 'user-1', logger);

      expect(result.status).toBe('session_not_found');
      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('memory extraction integration', () => {
    it('calls updateUserMemory after a COMPLETED summary', async () => {
      const turns = makeTranscriptTurns(4);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 8 }));
      mockGenerateContent.mockResolvedValue({ text: validFlashLiteOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });
      mockCount.mockResolvedValue(3);
      mockUserMemoryFind.mockResolvedValue(null);
      mockUserMemoryUpsert.mockResolvedValue({ id: 'mem-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      const result = await generateSessionSummary('sess-1', 'user-1', logger);

      expect(result.status).toBe('completed');
      expect(mockCount).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
      expect(mockUserMemoryFind).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
      expect(mockUserMemoryUpsert).toHaveBeenCalled();
    });

    it('does not throw when memory extraction fails — A10A job must not fail', async () => {
      const turns = makeTranscriptTurns(4);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 8 }));
      mockGenerateContent.mockResolvedValue({ text: validFlashLiteOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });
      mockCount.mockRejectedValue(new Error('DB connection failed'));

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      const result = await generateSessionSummary('sess-1', 'user-1', logger);

      expect(result.status).toBe('completed');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'memory_extraction_catch_all' }),
        expect.any(String),
      );
    });

    it('upserts UserMemory with session_count: 1 on first session', async () => {
      const turns = makeTranscriptTurns(4);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 8 }));
      mockGenerateContent.mockResolvedValue({ text: validFlashLiteOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });
      mockCount.mockResolvedValue(1);
      mockUserMemoryFind.mockResolvedValue(null);
      mockUserMemoryUpsert.mockResolvedValue({ id: 'mem-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      await generateSessionSummary('sess-1', 'user-1', logger);

      expect(mockUserMemoryUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1' },
          create: expect.objectContaining({ session_count: 1 }),
          update: expect.objectContaining({ session_count: { increment: 1 } }),
        }),
      );
    });

    it('forces emotional_baseline to null when session_count < 3', async () => {
      const memoryWithBaseline = JSON.stringify({
        life_context: ['works as engineer'],
        recurring_themes: ['work stress'],
        what_helps: ['exercise'],
        what_doesnt_help: [],
        significant_events: [],
        current_stressors: ['deadlines'],
        emotional_baseline: 'feeling anxious but engaged',
      });

      const turns = makeTranscriptTurns(4);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 8 }));
      mockGenerateContent
        .mockResolvedValueOnce({ text: validFlashLiteOutput, fallbackUsed: false })
        .mockResolvedValueOnce({ text: memoryWithBaseline, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });
      mockCount.mockResolvedValue(1);
      mockUserMemoryFind.mockResolvedValue(null);
      mockUserMemoryUpsert.mockResolvedValue({ id: 'mem-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      await generateSessionSummary('sess-1', 'user-1', logger);

      expect(mockUserMemoryUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1' },
          create: expect.objectContaining({ emotional_baseline: null }),
          update: expect.objectContaining({ emotional_baseline: null }),
        }),
      );
    });

    it('persists homework_track from the memory-extraction output (OKUVU v2.0 — the new field)', async () => {
      const memoryWithHomework = JSON.stringify({
        life_context: [],
        recurring_themes: [],
        what_helps: [],
        what_doesnt_help: [],
        significant_events: [],
        current_stressors: [],
        homework_track: ['grounding before bed — not_done, forgot [session 5]'],
        emotional_baseline: null,
      });

      const turns = makeTranscriptTurns(4);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 8 }));
      mockGenerateContent
        .mockResolvedValueOnce({ text: validFlashLiteOutput, fallbackUsed: false })
        .mockResolvedValueOnce({ text: memoryWithHomework, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });
      mockCount.mockResolvedValue(5);
      mockUserMemoryFind.mockResolvedValue(null);
      mockUserMemoryUpsert.mockResolvedValue({ id: 'mem-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      await generateSessionSummary('sess-1', 'user-1', logger);

      expect(mockUserMemoryUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1' },
          create: expect.objectContaining({
            homework_track: ['grounding before bed — not_done, forgot [session 5]'],
          }),
          update: expect.objectContaining({
            homework_track: ['grounding before bed — not_done, forgot [session 5]'],
          }),
        }),
      );
    });

    it('defaults homework_track to an empty array when the memory-extraction output omits it', async () => {
      const memoryWithoutHomework = JSON.stringify({
        life_context: [],
        recurring_themes: [],
        what_helps: [],
        what_doesnt_help: [],
        significant_events: [],
        current_stressors: [],
        emotional_baseline: null,
      });

      const turns = makeTranscriptTurns(4);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 8 }));
      mockGenerateContent
        .mockResolvedValueOnce({ text: validFlashLiteOutput, fallbackUsed: false })
        .mockResolvedValueOnce({ text: memoryWithoutHomework, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });
      mockCount.mockResolvedValue(5);
      mockUserMemoryFind.mockResolvedValue(null);
      mockUserMemoryUpsert.mockResolvedValue({ id: 'mem-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      await generateSessionSummary('sess-1', 'user-1', logger);

      expect(mockUserMemoryUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ homework_track: [] }),
          update: expect.objectContaining({ homework_track: [] }),
        }),
      );
    });
  });

  describe('embedding integration', () => {
    beforeEach(() => {
      mockGenerateEmbedding.mockResolvedValue(new Array(768).fill(0.01));
    });

    it('calls generateEmbedding with summary_text after a COMPLETED summary', async () => {
      const turns = makeTranscriptTurns(4);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 8 }));
      mockGenerateContent.mockResolvedValue({ text: validFlashLiteOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      const result = await generateSessionSummary('sess-1', 'user-1', logger);

      expect(result.status).toBe('completed');
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
      expect(mockGenerateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('User discussed feeling anxious'),
      );
    });

    it('executes $executeRaw UPDATE with the returned embedding', async () => {
      const turns = makeTranscriptTurns(4);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 8 }));
      mockGenerateContent.mockResolvedValue({ text: validFlashLiteOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      await generateSessionSummary('sess-1', 'user-1', logger);

      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
      const rawSql = mockExecuteRaw.mock.calls[0][0];
      expect(rawSql).toBeInstanceOf(Array);
    });

    it('does not throw when embedding fails — A10A job must not fail', async () => {
      const turns = makeTranscriptTurns(4);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 8 }));
      mockGenerateContent.mockResolvedValue({ text: validFlashLiteOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });
      mockGenerateEmbedding.mockRejectedValue(new Error('Vertex AI embedding error'));

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      const result = await generateSessionSummary('sess-1', 'user-1', logger);

      expect(result.status).toBe('completed');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'embedding_failed', err: 'Vertex AI embedding error', session_id: 'sess-1' }),
        expect.stringContaining('Failed to generate or store embedding'),
      );
    });

    it('does not call generateEmbedding on SKIPPED_TRIVIAL', async () => {
      mockFindUnique.mockResolvedValue(makeSession({ turns: [], turn_count: 0 }));

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      await generateSessionSummary('sess-1', 'user-1', logger);

      expect(mockGenerateEmbedding).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    it('still extracts memory when embedding fails', async () => {
      const turns = makeTranscriptTurns(4);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 8 }));
      mockGenerateContent.mockResolvedValue({ text: validFlashLiteOutput, fallbackUsed: false });
      mockUpsert.mockResolvedValue({ id: 'sum-1' });
      mockGenerateEmbedding.mockRejectedValue(new Error('Vertex AI embedding error'));
      mockCount.mockResolvedValue(3);
      mockUserMemoryFind.mockResolvedValue(null);
      mockUserMemoryUpsert.mockResolvedValue({ id: 'mem-1' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();
      const result = await generateSessionSummary('sess-1', 'user-1', logger);

      expect(result.status).toBe('completed');
      expect(mockUserMemoryUpsert).toHaveBeenCalled();
    });
  });
});
