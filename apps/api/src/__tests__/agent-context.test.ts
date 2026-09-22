import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    turn: {
      findMany: vi.fn(),
    },
    homework: {
      findFirst: vi.fn(),
    },
  },
}));

const MOCK_FIREBASE_UID = 'mock-firebase-uid-1';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

function buildFullUser() {
  return {
    id: 'user-1',
    firebase_uid: MOCK_FIREBASE_UID,
    phone_number: '+15551234567',
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-06-29'),
    language_mode: 'english' as const,
    safety_state: {
      id: 'ss-1',
      user_id: 'user-1',
      safety_state_current: 'S2' as const,
      safety_state_at_last_session_end: 'S2' as const,
      updated_at: new Date('2026-06-29'),
    },
    clinical_config: {
      id: 'cc-1',
      user_id: 'user-1',
      care_plan_id: 'CP1' as const,
      assignment_state: 'confirmed' as const,
      confidence_at_last_eval: 0.85,
      turns_evaluated: 42,
      care_plan_focus: null,
    },
    engagement_profile: {
      current_streak: 5,
      longest_streak: 0,
      voice_mode_enabled: true,
      consent_1: true,
      consent_2: false,
      consent_3: true,
      consent_4: false,
    },
    session_logs: [
      {
        id: 'sess-1',
        user_id: 'user-1',
        session_started_at: new Date('2026-06-29T14:00:00Z'),
        session_ended_at: new Date('2026-06-29T14:30:00Z'),
        turn_count: 12,
        session_feedback_score: 4,
        summaries: [{ summary_text: 'Session 1 was productive.', status: 'COMPLETED' }],
      },
      {
        id: 'sess-2',
        user_id: 'user-1',
        session_started_at: new Date('2026-06-28T10:00:00Z'),
        session_ended_at: new Date('2026-06-28T10:20:00Z'),
        turn_count: 8,
        session_feedback_score: 3,
        summaries: [],
      },
      {
        id: 'sess-3',
        user_id: 'user-1',
        session_started_at: new Date('2026-06-27T09:00:00Z'),
        session_ended_at: null,
        turn_count: 5,
        session_feedback_score: null,
        summaries: [{ summary_text: 'Short check-in.', status: 'COMPLETED' }],
      },
    ],
    session_summaries: [
      { summary_text: 'Latest overall summary.', created_at: new Date('2026-06-29T14:00:00Z'), status: 'COMPLETED' },
    ],
    assigned_therapists: [{ therapist: { name: 'Dr. Priya Nair' } }],
  };
}

function buildUserWithManySessions(count: number) {
  const user: Record<string, any> = {
    id: 'user-2',
    firebase_uid: MOCK_FIREBASE_UID,
    phone_number: '+15559876543',
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2026-06-29'),
    language_mode: 'english' as const,
    safety_state: null,
    clinical_config: {
      id: 'cc-2',
      user_id: 'user-2',
      care_plan_id: 'CP2' as const,
      assignment_state: 'provisional' as const,
      confidence_at_last_eval: null,
      turns_evaluated: 0,
      care_plan_focus: null,
    },
    engagement_profile: {
      current_streak: 1,
      longest_streak: 0,
      voice_mode_enabled: false,
      consent_1: true,
      consent_2: false,
      consent_3: false,
      consent_4: false,
    },
    session_logs: Array.from({ length: count }, (_, i) => ({
      id: `sess-${i + 1}`,
      user_id: 'user-2',
      session_started_at: new Date(2026, 5, 30 - i, 10, 0, 0),
      session_ended_at: new Date(2026, 5, 30 - i, 10, 15, 0),
      turn_count: 3 + i,
      session_feedback_score: i % 2 === 0 ? 5 : null,
      summaries: i === 0 ? [{ summary_text: `Most recent summary.`, status: 'COMPLETED' }] : [],
    })),
    session_summaries: [
      { summary_text: 'Latest overall summary for many sessions.', created_at: new Date('2026-06-29T14:00:00Z'), status: 'COMPLETED' },
    ],
    assigned_therapists: [],
  };
  return user;
}

function buildUserWithNoRelations() {
  return {
    id: 'user-3',
    firebase_uid: MOCK_FIREBASE_UID,
    phone_number: '+15551112222',
    created_at: new Date('2026-06-29'),
    updated_at: new Date('2026-06-29'),
    language_mode: 'english' as const,
    safety_state: null,
    clinical_config: null,
    engagement_profile: null,
    session_logs: [],
    session_summaries: [],
    assigned_therapists: [],
  };
}

describe('GET /users/me/context', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('positive — full history', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(buildFullUser() as any);
      vi.mocked(prisma.homework.findFirst).mockResolvedValue({
        id: 'hw-1',
        description: 'Practice box breathing before bed.',
      } as any);
      app = buildApp();
    });

    it('returns 200 with all fields populated', async () => {
      const prisma = await importMocks();
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.safety_state).toBe('S2');
      expect(body.care_plan).toEqual({
        id: 'cc-1',
        care_plan_id: 'CP1',
        assignment_state: 'confirmed',
      });
      expect(body.recent_history).toHaveLength(3);
      expect(body.recent_history[0]).toMatchObject({
        session_id: 'sess-1',
        turn_count: 12,
        session_feedback_score: 4,
        summary: 'Session 1 was productive.',
      });
      expect(body.session_summary).toMatch(/^\[\d+ days ago\]: Latest overall summary\.$/);
      expect(body.engagement).toEqual({ current_streak: 5, longest_streak: 0, voice_mode_enabled: true, consent_1: true, consent_2: false, consent_3: true, consent_4: false });
      expect(body.language_mode).toBe('english');
      expect(body.therapist_name).toBe('Dr. Priya Nair');
      expect(body.homework).toBe('Practice box breathing before bed.');
    });

    it('falls back to a generic care_plan_focus label when ClinicalConfig.care_plan_focus is null (OKUVU v2.0)', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });
      const body = response.json();

      // buildFullUser() is CP1 with care_plan_focus: null
      expect(body.care_plan_focus).toBe('anxiety and worry');
    });

    it('queries with correct include structure and take limit', async () => {
      const prisma = await importMocks();
      await app.inject({ method: 'GET', url: '/users/me/context' });

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { firebase_uid: MOCK_FIREBASE_UID },
          include: expect.objectContaining({
            safety_state: true,
            clinical_config: true,
            engagement_profile: expect.objectContaining({
              select: { current_streak: true, longest_streak: true, voice_mode_enabled: true, consent_1: true, consent_2: true, consent_3: true, consent_4: true },
            }),
            session_logs: expect.objectContaining({ take: 6 }),
            session_summaries: expect.objectContaining({ take: 3, where: { status: 'COMPLETED', summary_text: { not: null } } }),
            assigned_therapists: expect.objectContaining({ take: 1 }),
          }),
        }),
      );
    });

    it('fetches active homework via the shared getActiveHomework query', async () => {
      const prisma = await importMocks();
      await app.inject({ method: 'GET', url: '/users/me/context' });

      expect(prisma.homework.findFirst).toHaveBeenCalledWith({
        where: { client_user_id: 'user-1', status: 'active' },
        orderBy: { assigned_at: 'desc' },
        select: { id: true, description: true },
      });
    });

    it('includes ISO string dates in recent_history entries', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });
      const body = response.json();

      for (const entry of body.recent_history) {
        expect(typeof entry.session_started_at).toBe('string');
        expect(() => new Date(entry.session_started_at)).not.toThrow();
      }
    });

    it('orders recent_history most-recent-first', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });
      const body = response.json();

      const dates = body.recent_history.map((e: any) => new Date(e.session_started_at).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    });

    it('makes exactly one Prisma call — no sequential queries', async () => {
      const prisma = await importMocks();
      await app.inject({ method: 'GET', url: '/users/me/context' });

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    });

    it('returns only the 10 expected top-level fields', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });
      const body = response.json();

      expect(Object.keys(body).sort()).toEqual([
        'care_plan',
        'care_plan_focus',
        'engagement',
        'homework',
        'language_mode',
        'recent_history',
        'safety_state',
        'session_summary',
        'therapist_name',
        'user_memory',
      ]);
    });
  });

  describe('negative — brand-new user (no User row)', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      app = buildApp();
    });

    it('returns 200 with empty/null defaults, not an error', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.safety_state).toBeNull();
      expect(body.care_plan).toBeNull();
      expect(body.recent_history).toEqual([]);
      expect(body.session_summary).toBeNull();
      expect(body.engagement).toEqual({ current_streak: 0, longest_streak: 0, voice_mode_enabled: false, consent_1: true, consent_2: false, consent_3: false, consent_4: false });
      expect(body.language_mode).toBe('english');
      expect(body.therapist_name).toBeNull();
      expect(body.care_plan_focus).toBeNull();
      expect(body.homework).toBeNull();
      expect(Object.keys(body).sort()).toEqual([
        'care_plan',
        'care_plan_focus',
        'engagement',
        'homework',
        'language_mode',
        'recent_history',
        'safety_state',
        'session_summary',
        'therapist_name',
        'user_memory',
      ]);
    });
  });

  describe('negative — user exists but has no related data', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(buildUserWithNoRelations() as any);
      app = buildApp();
    });

    it('returns 200 with null/empty for unpopulated relations', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.safety_state).toBeNull();
      expect(body.care_plan).toBeNull();
      expect(body.recent_history).toEqual([]);
      expect(body.session_summary).toBeNull();
      expect(body.engagement).toEqual({ current_streak: 0, longest_streak: 0, voice_mode_enabled: false, consent_1: true, consent_2: false, consent_3: false, consent_4: false });
    });
  });

  describe('edge — long session history bounded to 6', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(buildUserWithManySessions(10) as any);
      app = buildApp();
    });

    it('calls Prisma with take:6, and mock returns only 6 as Prisma would', async () => {
      const prisma = await importMocks();
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });

      expect(response.statusCode).toBe(200);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            session_logs: expect.objectContaining({ take: 6 }),
          }),
        }),
      );
    });

    it('returns most recent sessions, not arbitrary ones', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });
      const body = response.json();

      const dates = body.recent_history.map((e: any) => new Date(e.session_started_at).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    });
  });

  describe('edge — session with no summary', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(buildFullUser() as any);
      app = buildApp();
    });

    it('returns null summary for sessions without one', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });
      const body = response.json();

      const sess2 = body.recent_history.find((e: any) => e.session_id === 'sess-2');
      expect(sess2.summary).toBeNull();
    });
  });

  describe('edge — no top-level session_summary', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      const user = buildFullUser();
      user.session_summaries = [];
      vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
      app = buildApp();
    });

    it('returns null for session_summary', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });
      const body = response.json();

      expect(body.session_summary).toBeNull();
    });
  });

  describe('E7-S04 fallback — most recent closed session has no summary', () => {
    const MOCK_TURNS = [
      { role: 'assistant' as const, content: 'That sounds difficult. What aspects of work?', turn_number: 2 },
      { role: 'user' as const, content: 'Work has been really stressful.', turn_number: 2 },
      { role: 'assistant' as const, content: 'Can you tell me more about that?', turn_number: 1 },
      { role: 'user' as const, content: 'I feel anxious today.', turn_number: 1 },
    ];

    beforeEach(async () => {
      const prisma = await importMocks();
      const user = buildFullUser();
      // Make the most recent closed session (sess-1) have no summary
      user.session_logs[0].summaries = [];
      vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
      vi.mocked(prisma.turn.findMany).mockResolvedValue(MOCK_TURNS as any);
      app = buildApp();
    });

    it('fetches raw turns and uses them as fallback summary', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });
      const body = response.json();

      const sess1 = body.recent_history.find((e: any) => e.session_id === 'sess-1');
      expect(sess1.summary).toBe(
        'User: I feel anxious today.\nAssistant: Can you tell me more about that?\nUser: Work has been really stressful.\nAssistant: That sounds difficult. What aspects of work?',
      );
    });

    it('calls turn.findMany with correct session id', async () => {
      const prisma = await importMocks();
      await app.inject({ method: 'GET', url: '/users/me/context' });

      expect(prisma.turn.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { session_id: 'sess-1' },
          orderBy: { turn_number: 'desc' },
          take: 20,
        }),
      );
    });

    it('returns sessions with completed summaries as-is', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });
      const body = response.json();

      const sess3 = body.recent_history.find((e: any) => e.session_id === 'sess-3');
      expect(sess3.summary).toBe('Short check-in.');
    });
  });

  describe('E7-S04 fallback — summary status is FAILED', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      const user = buildFullUser();
      user.session_logs[0].summaries = [{ summary_text: 'partial', status: 'FAILED' }];
      vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
      vi.mocked(prisma.turn.findMany).mockResolvedValue([] as any);
      app = buildApp();
    });

    it('triggers fallback when summary status is FAILED', async () => {
      const prisma = await importMocks();
      await app.inject({ method: 'GET', url: '/users/me/context' });

      expect(prisma.turn.findMany).toHaveBeenCalled();
    });
  });

  describe('E7-S04 fallback — no prior sessions (new user)', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      app = buildApp();
    });

    it('does not call turn.findMany for new users', async () => {
      const prisma = await importMocks();
      await app.inject({ method: 'GET', url: '/users/me/context' });

      expect(prisma.turn.findMany).not.toHaveBeenCalled();
    });

    it('returns empty recent_history for new users', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });
      const body = response.json();

      expect(body.recent_history).toEqual([]);
    });
  });

  describe('auth — 401 without bypass', () => {
    beforeEach(() => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
    });

    it('returns 401 when no Authorization header', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/context' });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/me/context',
        headers: { authorization: 'Bearer invalid-token' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
