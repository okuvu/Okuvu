import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    sessionLog: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_SESSION_ID = '770e8400-e29b-41d4-a716-446655440002';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

function sessionRow(overrides?: Partial<{
  id: string;
  session_ended_at: Date | null;
  turn_count: number;
  turns: Array<{ content: string }>;
  _count: { turns: number };
}>) {
  return {
    id: MOCK_SESSION_ID,
    session_started_at: new Date('2026-10-28T09:00:00Z'),
    session_ended_at: new Date('2026-10-28T09:25:00Z'),
    turn_count: 6,
    turns: [{ content: 'I could not sleep again last night.' }],
    _count: { turns: 12 },
    ...overrides,
  };
}

function transcriptRow(overrides?: Partial<{
  turns: Array<{ role: string; content: string; turn_number: number }>;
}>) {
  return {
    id: MOCK_SESSION_ID,
    session_started_at: new Date('2026-10-28T09:00:00Z'),
    session_ended_at: new Date('2026-10-28T09:25:00Z'),
    turns: [
      { role: 'user', content: 'I could not sleep again last night.', turn_number: 1 },
      { role: 'assistant', content: 'That sounds exhausting. What was going through your mind?', turn_number: 1 },
      { role: 'user', content: 'Work, mostly.', turn_number: 2 },
      { role: 'assistant', content: 'What part of work is loudest right now?', turn_number: 2 },
    ],
    ...overrides,
  };
}

describe('past conversations', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('GET /sessions', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.sessionLog.findMany).mockResolvedValue([sessionRow()] as any);
      app = buildApp();
    });

    it('returns the user\'s past conversations newest first, with a preview', async () => {
      const response = await app.inject({ method: 'GET', url: '/sessions' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        sessions: [
          {
            id: MOCK_SESSION_ID,
            started_at: '2026-10-28T09:00:00.000Z',
            ended_at: '2026-10-28T09:25:00.000Z',
            turn_count: 6,
            message_count: 12,
            preview: 'I could not sleep again last night.',
          },
        ],
      });
    });

    it('only asks the database for this user\'s sessions that hold turns', async () => {
      const prisma = await importMocks();
      await app.inject({ method: 'GET', url: '/sessions' });

      const args = vi.mocked(prisma.sessionLog.findMany).mock.calls[0][0] as any;
      expect(args.where).toEqual({ user_id: MOCK_USER_ID, turn_count: { gt: 0 } });
      expect(args.orderBy).toEqual({ session_started_at: 'desc' });
      expect(args.take).toBe(20);
    });

    it('flattens a multi-line opening turn into one line and trims long ones', async () => {
      const prisma = await importMocks();
      const long = `First line\nsecond   line\n${'x'.repeat(300)}`;
      vi.mocked(prisma.sessionLog.findMany).mockResolvedValue([
        sessionRow({ turns: [{ content: long }] }),
      ] as any);

      const body = (await app.inject({ method: 'GET', url: '/sessions' })).json();
      const preview: string = body.sessions[0].preview;

      expect(preview.startsWith('First line second line xxx')).toBe(true);
      expect(preview).not.toContain('\n');
      expect(preview.length).toBe(140);
      expect(preview.endsWith('…')).toBe(true);
    });

    it('leaves preview null when the opening turn is blank', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.sessionLog.findMany).mockResolvedValue([sessionRow({ turns: [] })] as any);

      const body = (await app.inject({ method: 'GET', url: '/sessions' })).json();
      expect(body.sessions[0].preview).toBeNull();
    });

    it('keeps an unclosed session (app killed mid-chat) rather than hiding it', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.sessionLog.findMany).mockResolvedValue([
        sessionRow({ session_ended_at: null }),
      ] as any);

      const body = (await app.inject({ method: 'GET', url: '/sessions' })).json();
      expect(body.sessions[0].ended_at).toBeNull();
    });

    it('reports the stored message count, not turn_count doubled', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.sessionLog.findMany).mockResolvedValue([
        sessionRow({ turn_count: 3, _count: { turns: 5 } }),
      ] as any);

      const body = (await app.inject({ method: 'GET', url: '/sessions' })).json();
      expect(body.sessions[0].message_count).toBe(5);
    });

    it('rejects an out-of-range limit with 400', async () => {
      const response = await app.inject({ method: 'GET', url: '/sessions?limit=500' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('invalid_limit');
    });

    it('accepts a limit inside the range', async () => {
      const response = await app.inject({ method: 'GET', url: '/sessions?limit=5' });

      expect(response.statusCode).toBe(200);
    });

    it('returns 401 when the token maps to no user', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const response = await app.inject({ method: 'GET', url: '/sessions' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /sessions/:id', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.sessionLog.findFirst).mockResolvedValue(transcriptRow() as any);
      app = buildApp();
    });

    it('returns the conversation turn by turn', async () => {
      const response = await app.inject({ method: 'GET', url: `/sessions/${MOCK_SESSION_ID}` });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(MOCK_SESSION_ID);
      expect(body.turns).toHaveLength(4);
      expect(body.turns[0]).toEqual({
        role: 'user',
        content: 'I could not sleep again last night.',
        turn_number: 1,
      });
      expect(body.turns[1].role).toBe('assistant');
    });

    it('scopes the lookup to the owner so another user\'s id is a 404, not a transcript', async () => {
      const prisma = await importMocks();
      const response = await app.inject({ method: 'GET', url: `/sessions/${MOCK_SESSION_ID}` });

      const args = vi.mocked(prisma.sessionLog.findFirst).mock.calls[0][0] as any;
      expect(args.where).toEqual({ id: MOCK_SESSION_ID, user_id: MOCK_USER_ID });
      expect(response.statusCode).toBe(200);
    });

    it('returns 404 when the session does not exist or belongs to someone else', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.sessionLog.findFirst).mockResolvedValue(null);

      const response = await app.inject({ method: 'GET', url: `/sessions/${MOCK_SESSION_ID}` });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('session_not_found');
    });

    it('returns 401 when the token maps to no user', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const response = await app.inject({ method: 'GET', url: `/sessions/${MOCK_SESSION_ID}` });

      expect(response.statusCode).toBe(401);
    });
  });
});
