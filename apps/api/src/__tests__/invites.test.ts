import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    inviteToken: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('POST /invites/redeem (therapist-portal wireframes C-06)', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('rejects a missing token', async () => {
    const response = await app.inject({ method: 'POST', url: '/invites/redeem', payload: {} });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_BODY');
  });

  it('returns 404 for an unknown token', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.inviteToken.findUnique).mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/invites/redeem',
      payload: { token: 'nope' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 409 when already redeemed', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.inviteToken.findUnique).mockResolvedValue({
      id: 'inv_1',
      client_user_id: 'user_1',
      expires_at: new Date(Date.now() + 86400000),
      redeemed_at: new Date(),
    } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/invites/redeem',
      payload: { token: 'used-token' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('ALREADY_REDEEMED');
  });

  it('returns 410 when expired', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.inviteToken.findUnique).mockResolvedValue({
      id: 'inv_1',
      client_user_id: 'user_1',
      expires_at: new Date(Date.now() - 1000),
      redeemed_at: null,
    } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/invites/redeem',
      payload: { token: 'expired-token' },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json().error.code).toBe('EXPIRED');
  });

  it('returns 409 when this device is already a different OKUVU account', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.inviteToken.findUnique).mockResolvedValue({
      id: 'inv_1',
      client_user_id: 'user_1',
      expires_at: new Date(Date.now() + 86400000),
      redeemed_at: null,
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'some_other_user' } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/invites/redeem',
      payload: { token: 'valid-token' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('ACCOUNT_ALREADY_LINKED');
  });

  it('links firebase_uid and marks redeemed_at on success', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.inviteToken.findUnique).mockResolvedValue({
      id: 'inv_1',
      client_user_id: 'user_1',
      expires_at: new Date(Date.now() + 86400000),
      redeemed_at: null,
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
    vi.mocked(prisma.inviteToken.update).mockResolvedValue({} as never);

    const response = await app.inject({
      method: 'POST',
      url: '/invites/redeem',
      payload: { token: 'valid-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, user_id: 'user_1' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { firebase_uid: 'mock-firebase-uid-1' },
    });
    expect(prisma.inviteToken.update).toHaveBeenCalledWith({
      where: { id: 'inv_1' },
      data: { redeemed_at: expect.any(Date) },
    });
  });
});
