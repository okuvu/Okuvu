import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };
const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    therapistClient: { findFirst: vi.fn() },
    sessionSummary: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma as any;
}

function relationship(overrides: Record<string, unknown> = {}) {
  return {
    summary_access_granted_at: new Date(NOW - 2 * DAY_MS),
    summary_access_closed_at: null,
    therapist: { name: 'Dr Nirmal' },
    ...overrides,
  };
}

function summary(sessionId: string, shareWithTherapist: boolean | null, startedAt: Date) {
  return {
    session_id: sessionId,
    status: 'COMPLETED',
    share_with_therapist: shareWithTherapist,
    session: { session_started_at: startedAt },
  };
}

/**
 * Per-session summary sharing — the layer under the relationship switch.
 *
 * The rule that must not regress: a client's withhold always wins, and a
 * per-session allow never survives a closed relationship window.
 */
describe('per-session summary sharing', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' });
    vi.mocked(prisma.therapistClient.findFirst).mockResolvedValue(relationship());
    vi.mocked(prisma.sessionSummary.findMany).mockResolvedValue([
      summary('s-1', null, new Date('2026-11-18T10:00:00Z')),
      summary('s-2', false, new Date('2026-11-11T10:00:00Z')),
    ]);
    vi.mocked(prisma.sessionSummary.findUnique).mockResolvedValue({ id: 'summary-1' });
    vi.mocked(prisma.sessionSummary.update).mockResolvedValue({});
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
  });

  it('lists sessions without any summary text', async () => {
    const response = await app.inject({ method: 'GET', url: '/users/me/sessions/sharing' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as any;
    expect(body.therapistName).toBe('Dr Nirmal');
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0]).toEqual({
      sessionId: 's-1',
      startedAt: '2026-11-18T10:00:00.000Z',
      status: 'COMPLETED',
      shared: true,
    });
    expect(JSON.stringify(body)).not.toContain('summaryText');
    expect(JSON.stringify(body)).not.toContain('summary_text');
  });

  it('honours a per-session withhold inside an open relationship window', async () => {
    const response = await app.inject({ method: 'GET', url: '/users/me/sessions/sharing' });
    const body = response.json() as any;

    expect(body.sessions[1].sessionId).toBe('s-2');
    expect(body.sessions[1].shared).toBe(false);
  });

  it('shares nothing when the relationship window is closed', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.therapistClient.findFirst).mockResolvedValue(
      relationship({ summary_access_closed_at: new Date(NOW - DAY_MS) }),
    );

    const response = await app.inject({ method: 'GET', url: '/users/me/sessions/sharing' });
    const body = response.json() as any;

    expect(body.expiresAt).toBeNull();
    expect(body.sessions.every((s: any) => s.shared === false)).toBe(true);
  });

  it('records a withhold on the client’s own session', async () => {
    const prisma = await importMocks();

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/sessions/s-1/summary-share',
      payload: { shared: false },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.sessionSummary.update).toHaveBeenCalledWith({
      where: { id: 'summary-1' },
      data: { share_with_therapist: false },
    });
    expect(prisma.sessionSummary.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id_session_id: { user_id: 'user-1', session_id: 's-1' } },
      }),
    );
  });

  it('answers not-found for a session the caller does not own', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.sessionSummary.findUnique).mockResolvedValue(null);

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/sessions/someone-elses/summary-share',
      payload: { shared: true },
    });

    expect(response.statusCode).toBe(404);
    expect(prisma.sessionSummary.update).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean answer', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/sessions/s-1/summary-share',
      payload: { shared: 'yes' },
    });

    expect(response.statusCode).toBe(400);
  });
});
