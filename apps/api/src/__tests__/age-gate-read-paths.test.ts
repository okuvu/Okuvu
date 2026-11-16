import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The 18+ gate as the two read paths apply it.
 *
 * The app shows the blocking screen, but the gate has to hold server-side: a
 * reinstall, an older build, or a client that removes the screen must not reach
 * a client surface. `today` and `context` are where that is decided, and both
 * answer from the row they already load — no extra query on the home screen's
 * hot path.
 */

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    homework: { findMany: vi.fn(), findFirst: vi.fn() },
    clinicalConfig: { findUnique: vi.fn() },
    reminder: { findMany: vi.fn() },
    userToolPreference: { findMany: vi.fn() },
    therapistClient: { findFirst: vi.fn() },
    appointment: { findMany: vi.fn() },
    clientCodeSequence: { upsert: vi.fn() },
    therapist: { findMany: vi.fn() },
    sessionLog: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

const { getAgentContextBundle } = await import('../lib/agent-context.js');
const { getTodayCard } = await import('../lib/today-card.js');
const { prisma } = await import('../lib/prisma.js');

const userMock = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
};
const homeworkMock = prisma.homework as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    language_mode: 'english',
    quote_of_day_enabled: false,
    age_confirmed_at: new Date('2026-11-01T00:00:00Z'),
    age_declined_at: null,
    safety_state: null,
    clinical_config: null,
    engagement_profile: null,
    session_logs: [],
    session_summaries: [
      { summary_text: 'Discussed exam stress and sleep.', created_at: new Date('2026-11-02T00:00:00Z') },
    ],
    user_memory: null,
    assigned_therapists: [],
    ...overrides,
  };
}

describe('18+ gate on the read paths', () => {
  beforeEach(() => {
    userMock.findUnique.mockReset();
    userMock.findFirst.mockReset();
    userMock.findFirst.mockResolvedValue(null);
    homeworkMock.findMany.mockReset();
    homeworkMock.findMany.mockResolvedValue([]);
    homeworkMock.findFirst.mockReset();
    homeworkMock.findFirst.mockResolvedValue(null);
  });

  it('returns an empty, flagged context bundle for a recorded refusal', async () => {
    userMock.findUnique.mockResolvedValue(
      row({ age_confirmed_at: null, age_declined_at: new Date('2026-11-01T00:00:00Z') }),
    );

    const bundle = await getAgentContextBundle('google-sub-1');

    expect(bundle.under_18).toBe(true);
    // Nothing from the record leaks into the bundle — the rolling summary is
    // clinical content and must not reach a declined client.
    expect(bundle.session_summary).toBeNull();
    expect(bundle.recent_history).toEqual([]);
    expect(bundle.care_plan).toBeNull();
  });

  it('does not flag a confirmed adult', async () => {
    userMock.findUnique.mockResolvedValue(row());

    const bundle = await getAgentContextBundle('google-sub-1');

    expect(bundle.under_18).toBeUndefined();
    expect(bundle.session_summary).toContain('exam stress');
  });

  it('does not flag someone who has never been asked', async () => {
    userMock.findUnique.mockResolvedValue(
      row({ age_confirmed_at: null, age_declined_at: null }),
    );

    const bundle = await getAgentContextBundle('google-sub-1');

    expect(bundle.under_18).toBeUndefined();
  });

  it('today-card answers under_18 instead of a card, before activating the client', async () => {
    userMock.findUnique.mockResolvedValue(
      row({ age_confirmed_at: null, age_declined_at: new Date('2026-11-01T00:00:00Z') }),
    );

    const result = await getTodayCard('google-sub-1');

    expect(result.status).toBe('under_18');
    // No client-side activation write for someone who said they are under 18.
    expect(userMock.findUnique).toHaveBeenCalledTimes(1);
  });

  // The happy path (a confirmed adult gets a card) is covered by today-card's
  // own suite; what this file pins is the gate itself, in both directions.
});
