import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

/**
 * Push delivery, end to end at the route layer.
 *
 * What is pinned here is the part an owner would otherwise only discover from a
 * phone: `/devices` must associate a handset with the *signed-in* client, the
 * internal hop must refuse anyone who is not the portal, the lock-screen text
 * must be built server-side from a kind, and an admin broadcast must respect a
 * client's switch and the one-a-day cap.
 */

const ORIGINAL_ENV = { ...process.env };

const { prismaMock, sendPushMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    deviceToken: { upsert: vi.fn(), deleteMany: vi.fn() },
    notification: { createMany: vi.fn() },
  },
  sendPushMock: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../lib/push.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/push.js')>();
  return { ...actual, sendPushToUser: sendPushMock };
});

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const SECRET = 'test-internal-secret';

describe('device registration', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: CLIENT_ID } as never);
    prismaMock.deviceToken.upsert.mockResolvedValue({} as never);
    prismaMock.deviceToken.deleteMany.mockResolvedValue({ count: 1 } as never);
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
    process.env = { ...ORIGINAL_ENV };
  });

  it('registers a handset against the authenticated client', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/devices',
      payload: { token: 'fcm-token-1', platform: 'android' },
    });

    expect(response.statusCode).toBe(204);
    const args = prismaMock.deviceToken.upsert.mock.calls[0][0] as {
      where: { token: string };
      create: { user_id: string; token: string };
      update: { user_id: string };
    };
    expect(args.where.token).toBe('fcm-token-1');
    expect(args.create.user_id).toBe(CLIENT_ID);
    // Sign-out and back in as someone else on one handset: the row changes hands.
    expect(args.update.user_id).toBe(CLIENT_ID);
  });

  it('rejects an empty token rather than storing a row no message can reach', async () => {
    const response = await app.inject({ method: 'POST', url: '/devices', payload: { token: '  ' } });
    expect(response.statusCode).toBe(400);
    expect(prismaMock.deviceToken.upsert).not.toHaveBeenCalled();
  });

  it('rejects a platform the app cannot be built for yet', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/devices',
      payload: { token: 'fcm-token-1', platform: 'ios' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('forgets only the caller’s own token on sign-out', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/devices',
      payload: { token: 'fcm-token-1' },
    });

    expect(response.statusCode).toBe(204);
    expect(prismaMock.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'fcm-token-1', user_id: CLIENT_ID },
    });
  });
});

describe('internal push hop', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
    delete process.env.PUSH_INTERNAL_SECRET;
    vi.clearAllMocks();
    sendPushMock.mockResolvedValue({ configured: true, sent: 1, failed: 0, pruned: 0 });
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
    process.env = { ...ORIGINAL_ENV };
  });

  it('is inert when the shared secret has not been configured', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/internal/push/notify',
      payload: { userId: CLIENT_ID, kind: 'homework_assigned' },
    });
    expect(response.statusCode).toBe(503);
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it('refuses a caller without the secret', async () => {
    process.env.PUSH_INTERNAL_SECRET = SECRET;
    const response = await app.inject({
      method: 'POST',
      url: '/internal/push/notify',
      payload: { userId: CLIENT_ID, kind: 'homework_assigned' },
    });
    expect(response.statusCode).toBe(401);
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it('sends on a named kind, and never on caller-supplied text', async () => {
    process.env.PUSH_INTERNAL_SECRET = SECRET;
    const response = await app.inject({
      method: 'POST',
      url: '/internal/push/notify',
      headers: { 'x-okuvu-internal': SECRET },
      payload: {
        userId: CLIENT_ID,
        kind: 'homework_assigned',
        homeworkId: 'hw-1',
        // A caller trying to put clinical prose on a lock screen.
        title: 'Journal about the abuse',
        body: 'Your therapist assigned: journal about the abuse',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(sendPushMock).toHaveBeenCalledWith({
      userId: CLIENT_ID,
      kind: 'homework_assigned',
      appointmentAt: null,
      homeworkId: 'hw-1',
      appointmentId: null,
    });
  });

  it('requires a user and a kind', async () => {
    process.env.PUSH_INTERNAL_SECRET = SECRET;
    const response = await app.inject({
      method: 'POST',
      url: '/internal/push/notify',
      headers: { 'x-okuvu-internal': SECRET },
      payload: { userId: CLIENT_ID },
    });
    expect(response.statusCode).toBe(400);
  });

  it('answers 200 even when the send throws, because the row is already written', async () => {
    process.env.PUSH_INTERNAL_SECRET = SECRET;
    sendPushMock.mockRejectedValue(new Error('fcm down'));
    const response = await app.inject({
      method: 'POST',
      url: '/internal/push/notify',
      headers: { 'x-okuvu-internal': SECRET },
      payload: { userId: CLIENT_ID, kind: 'reminder_set' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ sent: 0 });
  });
});

describe('admin broadcast', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, PUSH_INTERNAL_SECRET: SECRET };
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
    vi.clearAllMocks();
    sendPushMock.mockResolvedValue({ configured: true, sent: 1, failed: 0, pruned: 0 });
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
    process.env = { ...ORIGINAL_ENV };
  });

  it('writes one inbox row per client for an approved broadcast kind', async () => {
    prismaMock.user.findMany
      .mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }] as never)
      .mockResolvedValueOnce([{ id: 'u1' }] as never);
    prismaMock.notification.createMany.mockResolvedValue({ count: 2 } as never);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/push/broadcast',
      headers: { 'x-okuvu-internal': SECRET },
      payload: {
        kind: 'festival_greeting',
        title: 'Happy Diwali',
        body: 'Wishing you a calm festival from all of us at OKUVU.',
        campaignId: 'camp-1',
      },
    });

    expect(response.statusCode).toBe(200);
    const data = prismaMock.notification.createMany.mock.calls[0][0] as {
      data: { user_id: string; kind: string; title: string; dedupe_key: string }[];
      skipDuplicates: boolean;
    };
    expect(data.data).toHaveLength(2);
    expect(data.data[0].dedupe_key).toBe('broadcast:camp-1:u1');
    expect(data.data[1].dedupe_key).toBe('broadcast:camp-1:u2');
    expect(data.skipDuplicates).toBe(true);
    // Only the user who still had today's slot is buzzed.
    expect(sendPushMock).toHaveBeenCalledTimes(1);
    expect(response.json()).toMatchObject({ recipients: 2, rowsWritten: 2, pushed: 1, skippedForCap: 1 });
  });

  it('refuses a kind that is not an announcement', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/internal/push/broadcast',
      headers: { 'x-okuvu-internal': SECRET },
      payload: {
        kind: 'appointment_cancelled',
        title: 'Session cancelled',
        body: 'This must never be a broadcast.',
        campaignId: 'camp-2',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });

  it('refuses an empty announcement', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/internal/push/broadcast',
      headers: { 'x-okuvu-internal': SECRET },
      payload: { kind: 'service_update', title: ' ', body: 'x', campaignId: 'camp-3' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('requires a campaign id so a retry cannot double-buzz the fleet', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/internal/push/broadcast',
      headers: { 'x-okuvu-internal': SECRET },
      payload: { kind: 'service_update', title: 'App update', body: 'We fixed a bug.' },
    });
    expect(response.statusCode).toBe(400);
  });
});
