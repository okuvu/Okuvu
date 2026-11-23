import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    therapistClient: { findFirst: vi.fn() },
    clientGoal: { findMany: vi.fn() },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const THERAPIST_ID = '8f14e45f-ceea-467f-a1c5-2b2b2b2b2b2b';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

/**
 * The client sees the goals their therapist wrote, in the therapist's order,
 * with the one the pair is on now marked.
 *
 * The clinical authority's rule (23 Nov 2026): client and therapist should
 * both be aware of the goals and work them one at a time. Two properties are
 * the whole reason this is a server route rather than an app-side filter — a
 * dropped goal never reaches the client, and a goal from a therapist whose
 * care has ended does not come back.
 */
describe('GET /users/me/goals', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.therapistClient.findFirst).mockResolvedValue({ therapist_id: THERAPIST_ID } as any);
    vi.mocked(prisma.clientGoal.findMany).mockResolvedValue([
      { id: 'g2', text: 'Speak up once in a team meeting', status: 'active' },
      { id: 'g1', text: 'Sleep before midnight three nights a week', status: 'achieved' },
    ] as any);
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('returns the goals in position order and marks the first active one as focus', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/goals' });
    const prisma = await importMocks();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      goals: [
        { id: 'g2', text: 'Speak up once in a team meeting', status: 'active', isFocus: true },
        { id: 'g1', text: 'Sleep before midnight three nights a week', status: 'achieved', isFocus: false },
      ],
      activeCount: 1,
    });

    // Scoped to the live link and to the two statuses a client may see: no
    // `dropped`, and no goal from a therapist whose care has ended.
    expect(prisma.clientGoal.findMany).toHaveBeenCalledWith({
      where: {
        therapist_id: THERAPIST_ID,
        client_user_id: MOCK_USER_ID,
        status: { in: ['active', 'achieved'] },
      },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
      select: { id: true, text: true, status: true },
    });
    expect(prisma.therapistClient.findFirst).toHaveBeenCalledWith({
      where: { client_user_id: MOCK_USER_ID, ended_at: null },
      orderBy: { created_at: 'desc' },
      select: { therapist_id: true },
    });
  });

  it('marks only the first active goal as focus, even when several are active', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.clientGoal.findMany).mockResolvedValue([
      { id: 'g1', text: 'Goal one', status: 'achieved' },
      { id: 'g2', text: 'Goal two', status: 'active' },
      { id: 'g3', text: 'Goal three', status: 'active' },
    ] as any);

    const res = await app.inject({ method: 'GET', url: '/users/me/goals' });

    expect(res.json().goals.map((goal: { id: string; isFocus: boolean }) => [goal.id, goal.isFocus])).toEqual([
      ['g1', false],
      ['g2', true],
      ['g3', false],
    ]);
    expect(res.json().activeCount).toBe(2);
  });

  it('returns an empty list when the client has no live therapist link', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.therapistClient.findFirst).mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/users/me/goals' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ goals: [], activeCount: 0 });
    expect(prisma.clientGoal.findMany).not.toHaveBeenCalled();
  });

  it('401s when the token names no user row', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/users/me/goals' });

    expect(res.statusCode).toBe(401);
    expect(prisma.clientGoal.findMany).not.toHaveBeenCalled();
  });
});
