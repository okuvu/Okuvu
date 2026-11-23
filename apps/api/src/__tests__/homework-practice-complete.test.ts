import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    homework: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    homeworkCompletion: { create: vi.fn() },
    reminder: { findMany: vi.fn() },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const HOMEWORK_ID = 'eff92515-592b-4483-be38-d5b82eeb7f38';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

/**
 * Completion is no longer something the client's tap can claim.
 *
 * `POST /users/me/homework/:id/complete` closed any assignment the client
 * pointed at, which cannot be told apart from a claim the work was not done —
 * the clinical authority removed it (23 Nov 2026). An exercise assignment now
 * closes only when its player reports reaching the end, by tool id, and only
 * once per IST day. These tests pin the three answers that route can give and
 * the absence of the old one.
 */
describe('POST /users/me/homework/practice-complete', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.homework.findFirst).mockResolvedValue({
      id: HOMEWORK_ID,
      frequency: null,
      last_completed_at: null,
    } as any);
    vi.mocked(prisma.homework.findUnique).mockResolvedValue({
      client_user_id: MOCK_USER_ID,
      status: 'active',
      frequency: null,
      reminder_time: null,
      due_at: null,
    } as any);
    vi.mocked(prisma.homework.update).mockResolvedValue({
      id: HOMEWORK_ID,
      status: 'completed',
    } as any);
    vi.mocked(prisma.homeworkCompletion.create).mockResolvedValue({ id: 'completion-1' } as any);
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('closes the assignment when the exercise player finishes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/homework/practice-complete',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ toolId: 'box_breathing' }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      completed: true,
      reason: null,
      homeworkId: HOMEWORK_ID,
      repeats: false,
      nextDueAt: null,
    });

    const prisma = await importMocks();
    expect(prisma.homework.findFirst).toHaveBeenCalledWith({
      where: { client_user_id: MOCK_USER_ID, tool_id: 'box_breathing', status: 'active' },
      orderBy: [{ due_at: 'asc' }, { assigned_at: 'asc' }],
      select: { id: true, frequency: true, last_completed_at: true },
    });
    expect(prisma.homework.update).toHaveBeenCalledWith({
      where: { id: HOMEWORK_ID },
      data: { status: 'completed', last_completed_at: expect.any(Date) },
    });
    // The history row says how it closed: the exercise ran, not a tap.
    expect(prisma.homeworkCompletion.create).toHaveBeenCalledWith({
      data: { homework_id: HOMEWORK_ID, client_user_id: MOCK_USER_ID, source: 'exercise' },
    });
  });

  it('answers "not assigned" without writing when that technique is not assigned', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.homework.findFirst).mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/users/me/homework/practice-complete',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ toolId: 'humming_breath' }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ completed: false, reason: 'not_assigned' });
    expect(prisma.homework.update).not.toHaveBeenCalled();
    expect(prisma.homeworkCompletion.create).not.toHaveBeenCalled();
  });

  it('does not count the same assignment twice in one IST day', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.homework.findFirst).mockResolvedValue({
      id: HOMEWORK_ID,
      frequency: 'once_daily',
      last_completed_at: new Date(),
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/users/me/homework/practice-complete',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ toolId: 'box_breathing' }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      completed: false,
      reason: 'already_done_today',
      homeworkId: HOMEWORK_ID,
    });
    expect(prisma.homework.update).not.toHaveBeenCalled();
  });

  it('keeps a repeating assignment open and says when it returns', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.homework.findFirst).mockResolvedValue({
      id: HOMEWORK_ID,
      frequency: 'once_daily',
      last_completed_at: null,
    } as any);
    vi.mocked(prisma.homework.findUnique).mockResolvedValue({
      client_user_id: MOCK_USER_ID,
      status: 'active',
      frequency: 'once_daily',
      reminder_time: null,
      due_at: null,
    } as any);
    vi.mocked(prisma.homework.update).mockResolvedValue({
      id: HOMEWORK_ID,
      status: 'active',
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/users/me/homework/practice-complete',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ toolId: 'box_breathing' }),
    });

    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.completed).toBe(true);
    expect(body.repeats).toBe(true);
    expect(body.nextDueAt).toEqual(expect.any(String));
    expect(prisma.homework.update).toHaveBeenCalledWith({
      where: { id: HOMEWORK_ID },
      data: {
        status: 'active',
        last_completed_at: expect.any(Date),
        due_at: expect.any(Date),
      },
    });
  });

  it('rejects a missing or malformed tool id before touching the database', async () => {
    const prisma = await importMocks();

    for (const payload of ['{}', JSON.stringify({ toolId: '../../etc/passwd' })]) {
      const res = await app.inject({
        method: 'POST',
        url: '/users/me/homework/practice-complete',
        headers: { 'content-type': 'application/json' },
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: 'INVALID_TOOL_ID' } });
    }

    expect(prisma.homework.findFirst).not.toHaveBeenCalled();
  });

  it('no longer offers a route that closes an arbitrary assignment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/users/me/homework/${HOMEWORK_ID}/complete`,
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });

    expect(res.statusCode).toBe(404);
    const prisma = await importMocks();
    expect(prisma.homework.update).not.toHaveBeenCalled();
  });
});
