import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

/**
 * The push sender, tested where it can actually be wrong.
 *
 * Three things here are load-bearing and none of them are visible on a phone
 * until they fail: the credential parser (a base64 value from Secrets Manager vs
 * a raw JSON file), the assertion Google exchanges for a token, and what the
 * message body contains — because that body is rendered on a lock screen anyone
 * can read.
 */

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const FAKE_ACCOUNT = {
  project_id: 'okuvu-236a6',
  client_email: 'fcm@okuvu-236a6.iam.gserviceaccount.com',
  private_key: privateKey,
};

const ORIGINAL_ENV = { ...process.env };

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
    deviceToken: { deleteMany: vi.fn() },
  },
}));

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

async function load() {
  return import('../lib/push.js');
}

function decodeSegment(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

describe('push credential handling', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
    prismaMock.deviceToken.deleteMany.mockResolvedValue({ count: 0 } as never);
  });

  afterEach(async () => {
    const { resetPushTokenCache } = await load();
    resetPushTokenCache();
    vi.unstubAllGlobals();
  });

  it('reads a raw service-account JSON', async () => {
    const { parseServiceAccount } = await load();
    const parsed = parseServiceAccount(JSON.stringify(FAKE_ACCOUNT));
    expect(parsed?.project_id).toBe('okuvu-236a6');
    expect(parsed?.private_key).toContain('BEGIN PRIVATE KEY');
  });

  it('reads a base64-encoded service account, which is how Secrets Manager hands it over', async () => {
    const { parseServiceAccount } = await load();
    const encoded = Buffer.from(JSON.stringify(FAKE_ACCOUNT)).toString('base64');
    expect(parseServiceAccount(encoded)?.client_email).toBe(FAKE_ACCOUNT.client_email);
  });

  it('unescapes newlines in a private key that survived a JSON environment value', async () => {
    const { parseServiceAccount } = await load();
    const escaped = JSON.stringify({
      ...FAKE_ACCOUNT,
      private_key: privateKey.replace(/\n/g, '\\n'),
    });
    expect(parseServiceAccount(escaped)?.private_key.split('\n').length).toBeGreaterThan(3);
  });

  it('returns null rather than throwing on an unset, empty or malformed value', async () => {
    const { parseServiceAccount } = await load();
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount('   ')).toBeNull();
    expect(parseServiceAccount('{not json')).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ project_id: 'x' }))).toBeNull();
  });

  it('signs an RS256 assertion with the scopes FCM needs', async () => {
    const { buildAssertion } = await load();
    const assertion = buildAssertion(FAKE_ACCOUNT, Date.parse('2026-11-17T10:00:00Z'));
    const parts = assertion.split('.');
    expect(parts).toHaveLength(3);

    const header = decodeSegment(parts[0]);
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });

    const claims = decodeSegment(parts[1]);
    expect(claims.iss).toBe(FAKE_ACCOUNT.client_email);
    expect(claims.scope).toBe('https://www.googleapis.com/auth/firebase.messaging');
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
    expect(claims.exp as number).toBeGreaterThan(claims.iat as number);
  });
});

describe('dead-token classification', () => {
  it('treats an uninstalled app as a dead token', async () => {
    const { isDeadTokenError } = await load();
    expect(isDeadTokenError('UNREGISTERED', undefined)).toBe(true);
    expect(isDeadTokenError('NOT_FOUND', undefined)).toBe(true);
    expect(isDeadTokenError(undefined, 'Requested entity was not found.')).toBe(true);
  });

  it('treats an invalid registration token as dead, and a quota error as not', async () => {
    const { isDeadTokenError } = await load();
    expect(isDeadTokenError('INVALID_ARGUMENT', 'The registration token is not a valid FCM registration token')).toBe(true);
    expect(isDeadTokenError('QUOTA_EXCEEDED', 'Message rate exceeded')).toBe(false);
    expect(isDeadTokenError('UNAVAILABLE', 'The service is currently unavailable')).toBe(false);
  });
});

describe('sendPushToUser', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
    prismaMock.deviceToken.deleteMany.mockResolvedValue({ count: 0 } as never);
  });

  afterEach(async () => {
    const { resetPushTokenCache } = await load();
    resetPushTokenCache();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it('is inert — not an error — when no service account is configured', async () => {
    const { sendPushToUser } = await load();
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;

    const result = await sendPushToUser(
      { userId: 'user-1', kind: 'homework_assigned' },
      prismaMock as never,
    );

    expect(result).toEqual({ configured: false, sent: 0, failed: 0, pruned: 0 });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('sends the generic care-team line and never the row text', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(FAKE_ACCOUNT);
    prismaMock.user.findUnique.mockResolvedValue({
      push_notifications_enabled: true,
      device_tokens: [{ token: 'tok-1' }],
    } as never);

    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: { body?: string }) => {
      calls.push({ url: String(url), body: init?.body });
      if (String(url).includes('oauth2')) {
        return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ name: 'projects/okuvu/messages/1' }), { status: 200 });
    });

    const { sendPushToUser } = await load();
    const result = await sendPushToUser(
      {
        userId: 'user-1',
        kind: 'homework_assigned',
        homeworkId: 'hw-9',
      },
      prismaMock as never,
    );

    expect(result.sent).toBe(1);
    const sendCall = calls.find((call) => call.url.includes('messages:send'));
    expect(sendCall).toBeDefined();
    const payload = JSON.parse(sendCall!.body!) as {
      message: {
        token: string;
        notification: { title: string; body: string };
        data: Record<string, string>;
        android: { priority: string; notification: { channel_id: string } };
      };
    };
    expect(payload.message.token).toBe('tok-1');
    expect(payload.message.notification.title).toBe('Something new from your care team');
    expect(payload.message.notification.body).toBe('Open OKUVU to see it.');
    expect(payload.message.android.notification.channel_id).toBe('okuvu_care_team');
    expect(payload.message.android.priority).toBe('HIGH');
    // The data payload carries ids, never prose.
    expect(payload.message.data).toEqual({ kind: 'homework_assigned', homeworkId: 'hw-9' });
  });

  it('names the session time for an appointment and nothing else', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(FAKE_ACCOUNT);
    prismaMock.user.findUnique.mockResolvedValue({
      push_notifications_enabled: true,
      device_tokens: [{ token: 'tok-1' }],
    } as never);

    let body: string | undefined;
    vi.stubGlobal('fetch', async (url: string, init?: { body?: string }) => {
      if (String(url).includes('oauth2')) {
        return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), {
          status: 200,
        });
      }
      body = init?.body;
      return new Response('{}', { status: 200 });
    });

    const { sendPushToUser } = await load();
    await sendPushToUser(
      {
        userId: 'user-1',
        kind: 'appointment_booked',
        appointmentAt: new Date('2026-11-20T11:00:00Z'),
        appointmentId: 'apt-1',
      },
      prismaMock as never,
    );

    const payload = JSON.parse(body!) as { message: { notification: { title: string; body: string } } };
    expect(payload.message.notification.title).toBe('Your session');
    // 11:00Z is 4:30pm IST — the fixed offset, not UTC.
    expect(payload.message.notification.body).toBe('Your session is on Fri 20 Nov, 4:30 pm.');
  });

  it('respects the client switch and sends nothing', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(FAKE_ACCOUNT);
    prismaMock.user.findUnique.mockResolvedValue({
      push_notifications_enabled: false,
      device_tokens: [{ token: 'tok-1' }],
    } as never);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { sendPushToUser } = await load();
    const result = await sendPushToUser(
      { userId: 'user-1', kind: 'homework_assigned' },
      prismaMock as never,
    );

    expect(result.sent).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('deletes a token FCM says is gone, and does not fail the send', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(FAKE_ACCOUNT);
    prismaMock.user.findUnique.mockResolvedValue({
      push_notifications_enabled: true,
      device_tokens: [{ token: 'tok-dead' }, { token: 'tok-live' }],
    } as never);

    vi.stubGlobal('fetch', async (url: string, init?: { body?: string }) => {
      if (String(url).includes('oauth2')) {
        return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), {
          status: 200,
        });
      }
      const token = (JSON.parse(init!.body!) as { message: { token: string } }).message.token;
      if (token === 'tok-dead') {
        return new Response(
          JSON.stringify({
            error: {
              status: 'NOT_FOUND',
              message: 'Requested entity was not found.',
              details: [{ errorCode: 'UNREGISTERED' }],
            },
          }),
          { status: 404 },
        );
      }
      return new Response('{}', { status: 200 });
    });

    const { sendPushToUser } = await load();
    const result = await sendPushToUser(
      { userId: 'user-1', kind: 'reminder_set' },
      prismaMock as never,
    );

    expect(result.sent).toBe(1);
    expect(result.pruned).toBe(1);
    expect(prismaMock.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['tok-dead'] } },
    });
  });

  it('sends nothing when the client has no registered handset', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(FAKE_ACCOUNT);
    prismaMock.user.findUnique.mockResolvedValue({
      push_notifications_enabled: true,
      device_tokens: [],
    } as never);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { sendPushToUser } = await load();
    const result = await sendPushToUser(
      { userId: 'user-1', kind: 'homework_assigned' },
      prismaMock as never,
    );

    expect(result).toEqual({ configured: true, sent: 0, failed: 0, pruned: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
