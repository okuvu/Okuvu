import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    homework: { findUnique: vi.fn(), update: vi.fn() },
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
 * The Flutter client posted to this route with `Content-Type: application/json`
 * and no body at all, and Fastify's default JSON parser rejected it with
 * "Body cannot be empty when content-type is set to 'application/json'" (400)
 * before the handler ran — so "Mark done" never reached the database. In
 * production that surfaced as the client's "Couldn't save that. Please try
 * again." These tests pin the parser behaviour that fix depends on: a body-less
 * POST is a valid call, and genuinely broken JSON is still a 400 rather than a
 * 500.
 */
describe('POST /users/me/homework/:id/complete', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
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
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('accepts an empty body sent as application/json (the client’s shape)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/users/me/homework/${HOMEWORK_ID}/complete`,
      headers: { 'content-type': 'application/json' },
      payload: '',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, status: 'completed', repeats: false });

    const prisma = await importMocks();
    expect(prisma.homework.update).toHaveBeenCalledWith({
      where: { id: HOMEWORK_ID },
      data: { status: 'completed', last_completed_at: expect.any(Date) },
    });
  });

  it('accepts a call with no content-type at all', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/users/me/homework/${HOMEWORK_ID}/complete`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, status: 'completed', repeats: false });
  });

  it('accepts an explicit empty JSON object', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/users/me/homework/${HOMEWORK_ID}/complete`,
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });

    expect(res.statusCode).toBe(200);
  });

  it('still rejects malformed JSON with 400, not 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/users/me/homework/${HOMEWORK_ID}/complete`,
      headers: { 'content-type': 'application/json' },
      payload: '{"broken":',
    });

    expect(res.statusCode).toBe(400);
  });

  it('404s an assignment belonging to another client', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.homework.findUnique).mockResolvedValue({
      client_user_id: 'someone-else',
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: `/users/me/homework/${HOMEWORK_ID}/complete`,
      headers: { 'content-type': 'application/json' },
      payload: '',
    });

    expect(res.statusCode).toBe(404);
    expect(prisma.homework.update).not.toHaveBeenCalled();
  });
});
