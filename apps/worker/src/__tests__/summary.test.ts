import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SummaryResult } from '../lib/summary.js';

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockGenerateContent = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  getPrisma: () => ({
    sessionLog: { findUnique: mockFindUnique },
    sessionSummary: { upsert: mockUpsert },
  }),
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
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
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
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

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
      expect(mockUpsert).not.toHaveBeenCalled();
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
      expect(mockUpsert).not.toHaveBeenCalled();
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
      expect(mockUpsert).not.toHaveBeenCalled();
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
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('throws error on timeout', async () => {
      const turns = makeTranscriptTurns(3);
      mockFindUnique.mockResolvedValue(makeSession({ turns, turn_count: 6 }));
      mockGenerateContent.mockResolvedValue({ text: '', fallbackUsed: true, failureReason: 'timeout' });

      const { generateSessionSummary } = await import('../lib/summary.js');
      const logger = mockLogger();

      await expect(generateSessionSummary('sess-1', 'user-1', logger))
        .rejects.toThrow('Flash-Lite call failed: timeout');
      expect(mockUpsert).not.toHaveBeenCalled();
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
});
