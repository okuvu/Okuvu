import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { buildApp } from '../app.js';
import { __resetRs256JwksCacheForTests } from '../lib/rs256-jwks.js';
import { verifySessionToken } from '../lib/session-token.js';

/**
 * `POST /auth/signup` — self-serve account creation.
 *
 * The Google ID token is real (signed here, JWKS stubbed) so the whole path a
 * client takes is covered: Google token in, `User` + `EngagementProfile` out.
 * Prisma is the only mock, and `$transaction` is wired to call the callback
 * with the same mock so the transaction body actually runs.
 */

const CLIENT_ID = 'okuvu-web-client-id.apps.googleusercontent.com';
const KID = 'google-signup-test-key';
const SESSION_SECRET = 'signup-test-session-secret-0123456789';
const GOOGLE_SUB = 'google-sub-signup-1';
const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => {
  const client: Record<string, unknown> = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    engagementProfile: {
      create: vi.fn(),
      upsert: vi.fn(),
    },
  };
  client.$transaction = vi.fn(async (fn: (tx: typeof client) => unknown) => fn(client));
  return { prisma: client };
});

let privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function makeGoogleToken(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid: KID };
  const payload = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: GOOGLE_SUB,
    email: 'newclient@example.com',
    email_verified: true,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  return `${signingInput}.${base64url(cryptoSign('RSA-SHA256', Buffer.from(signingInput), privateKey))}`;
}

async function prismaMock() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma as unknown as {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    engagementProfile: {
      create: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
}

const VALID_BODY = {
  adult: true,
  consents: {
    safety_monitoring: true,
    mood_inference: false,
    assessment: false,
    emergency_contact: false,
  },
};

describe('POST /auth/signup', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env.GOOGLE_MOBILE_CLIENT_ID = CLIENT_ID;
    process.env.OKUVU_SESSION_SECRET = SESSION_SECRET;
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
    __resetRs256JwksCacheForTests();

    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = pair.privateKey;
    const publicJwk = {
      ...(pair.publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
      kid: KID,
      alg: 'RS256',
      use: 'sig',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ [KID]: publicJwk }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const db = await prismaMock();
    db.user.findUnique.mockReset();
    db.user.findFirst.mockReset();
    db.user.create.mockReset();
    db.user.update.mockReset();
    db.engagementProfile.create.mockReset();
    db.engagementProfile.upsert.mockReset();

    db.user.create.mockResolvedValue({ id: 'user-new' });
    db.user.update.mockResolvedValue({});
    db.engagementProfile.create.mockResolvedValue({});
    db.engagementProfile.upsert.mockResolvedValue({});

    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
    __resetRs256JwksCacheForTests();
  });

  it('creates an account for someone with no invitation, with no therapist and no care plan', async () => {
    const db = await prismaMock();
    db.user.findUnique.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { ...VALID_BODY, id_token: makeGoogleToken() },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      has_account: true,
      user_id: 'user-new',
      email: 'newclient@example.com',
      already_registered: false,
      linked: false,
    });

    // The row exists only because the client answered the age question: the
    // attestation is written in the same insert, not asked for afterwards.
    const createArgs = db.user.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data).toMatchObject({
      auth_subject: GOOGLE_SUB,
      email: 'newclient@example.com',
    });
    expect(createArgs.data.age_confirmed_at).toBeInstanceOf(Date);
    // Deliberately absent: an account created here is unassigned and has no
    // care plan until the console assigns a therapist.
    expect(createArgs.data).not.toHaveProperty('clinical_config');
    expect(createArgs.data).not.toHaveProperty('client_code');

    expect(db.engagementProfile.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-new',
        consent_1: true,
        consent_2: false,
        consent_3: false,
        consent_4: false,
      },
    });

    await expect(verifySessionToken(body.token as string)).resolves.toEqual({ uid: GOOGLE_SUB });
  });

  it('stores the optional chat-share answer on the two consent columns it covers', async () => {
    const db = await prismaMock();
    db.user.findUnique.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue(null);

    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        id_token: makeGoogleToken(),
        adult: true,
        consents: { safety_monitoring: true, mood_inference: true, assessment: true },
      },
    });

    expect(db.engagementProfile.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-new',
        consent_1: true,
        consent_2: true,
        consent_3: true,
        consent_4: false,
      },
    });
  });

  it('binds an invited row the portal already created, and keeps its therapist link', async () => {
    const db = await prismaMock();
    db.user.findUnique.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue({ id: 'user-invited', auth_subject: null });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { ...VALID_BODY, id_token: makeGoogleToken() },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      has_account: true,
      user_id: 'user-invited',
      linked: true,
    });
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-invited' },
      data: {
        auth_subject: GOOGLE_SUB,
        email: 'newclient@example.com',
        age_confirmed_at: expect.any(Date),
        age_declined_at: null,
      },
    });
  });

  it('refuses to create anything for someone who says they are under 18', async () => {
    const db = await prismaMock();
    db.user.findUnique.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { ...VALID_BODY, adult: false, id_token: makeGoogleToken() },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('UNDER_18');
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.engagementProfile.create).not.toHaveBeenCalled();
  });

  it('records the refusal on an invited row so the console can say why', async () => {
    const db = await prismaMock();
    db.user.findUnique.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue({ id: 'user-invited', auth_subject: null });

    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { ...VALID_BODY, adult: false, id_token: makeGoogleToken() },
    });

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-invited' },
      data: { age_declined_at: expect.any(Date), age_confirmed_at: null },
    });
    // Still not a sign-in: the subject is never bound by a refusal.
    const updateArgs = db.user.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateArgs.data).not.toHaveProperty('auth_subject');
  });

  it('is idempotent: an already-registered subject gets the row back and no write', async () => {
    const db = await prismaMock();
    db.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'newclient@example.com',
      deleted_at: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { ...VALID_BODY, id_token: makeGoogleToken() },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      has_account: true,
      user_id: 'user-1',
      already_registered: true,
    });
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('refuses an email already bound to a different subject', async () => {
    const db = await prismaMock();
    db.user.findUnique.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue({ id: 'user-other', auth_subject: 'someone-else' });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { ...VALID_BODY, id_token: makeGoogleToken() },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('EMAIL_IN_USE');
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('never resurrects a closed account', async () => {
    const db = await prismaMock();
    db.user.findUnique.mockResolvedValue({
      id: 'user-gone',
      email: 'newclient@example.com',
      deleted_at: new Date(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { ...VALID_BODY, id_token: makeGoogleToken() },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('ACCOUNT_DELETED');
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('rejects a payload without the age answer', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { id_token: makeGoogleToken(), consents: { safety_monitoring: true } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_BODY');
  });

  it('rejects a payload that does not accept safety monitoring', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        id_token: makeGoogleToken(),
        adult: true,
        consents: { safety_monitoring: false },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('CONSENT_REQUIRED');
  });

  it('rejects a token minted for another OAuth client', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { ...VALID_BODY, id_token: makeGoogleToken({ aud: 'another-client-id' }) },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_GOOGLE_TOKEN');
  });

  it('rejects a missing id_token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: VALID_BODY,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_BODY');
  });
});
