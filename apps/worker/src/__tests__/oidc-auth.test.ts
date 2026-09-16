import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };
const mockVerifyIdToken = vi.fn();

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

function mockRequest(authHeader?: string) {
  return {
    headers: { authorization: authHeader },
    log: { warn: vi.fn() },
  } as any;
}

function mockReply() {
  const reply: any = {
    statusCode: undefined,
    body: undefined,
  };
  reply.status = vi.fn((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send = vi.fn((body: unknown) => {
    reply.body = body;
    return reply;
  });
  return reply;
}

// Security-audit round, 16 Sep 2026 — verifyIdToken was previously called
// with no `audience` option. google-auth-library only validates the `aud`
// claim when audience is explicitly passed, so this skipped the one check
// that stops a valid OIDC token minted by the same service account for a
// *different* Cloud Run service's audience from being replayed here — the
// email match alone doesn't catch that, since the SA email is the same
// regardless of which audience the token was minted for.
describe('verifyOidcToken — audience verification', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      CLOUD_TASKS_WORKER_URL: 'https://evia-worker-xxxx-uc.a.run.app',
      WORKER_SERVICE_ACCOUNT_EMAIL: 'evia-app@evia-500215.iam.gserviceaccount.com',
    };
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
    mockVerifyIdToken.mockReset();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('passes CLOUD_TASKS_WORKER_URL as the expected audience', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'evia-app@evia-500215.iam.gserviceaccount.com' }),
    });

    const { verifyOidcToken } = await import('../middleware/oidc-auth.js');
    const request = mockRequest('Bearer valid-token');
    const reply = mockReply();

    await verifyOidcToken(request, reply);

    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: 'valid-token',
      audience: 'https://evia-worker-xxxx-uc.a.run.app',
    });
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('rejects a token whose audience does not match (surfaced as verifyIdToken throwing)', async () => {
    // google-auth-library itself throws when the aud claim doesn't match
    // the audience option — simulated here since the real check happens
    // inside the mocked library, not in our own code.
    mockVerifyIdToken.mockRejectedValue(new Error('Wrong recipient, payload audience != requiredAudience'));

    const { verifyOidcToken } = await import('../middleware/oidc-auth.js');
    const request = mockRequest('Bearer wrong-audience-token');
    const reply = mockReply();

    await verifyOidcToken(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired OIDC token' },
    });
  });

  it('omits the audience option when CLOUD_TASKS_WORKER_URL is unset (unchanged prior behavior)', async () => {
    delete process.env.CLOUD_TASKS_WORKER_URL;
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'evia-app@evia-500215.iam.gserviceaccount.com' }),
    });

    const { verifyOidcToken } = await import('../middleware/oidc-auth.js');
    const request = mockRequest('Bearer valid-token');
    const reply = mockReply();

    await verifyOidcToken(request, reply);

    expect(mockVerifyIdToken).toHaveBeenCalledWith({ idToken: 'valid-token' });
  });

  it('still rejects on a service-account email mismatch', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'someone-else@other-project.iam.gserviceaccount.com' }),
    });

    const { verifyOidcToken } = await import('../middleware/oidc-auth.js');
    const request = mockRequest('Bearer valid-token-wrong-sa');
    const reply = mockReply();

    await verifyOidcToken(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when no Authorization header is present', async () => {
    const { verifyOidcToken } = await import('../middleware/oidc-auth.js');
    const request = mockRequest(undefined);
    const reply = mockReply();

    await verifyOidcToken(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('bypasses verification entirely when LOCAL_DEV_BYPASS_AUTH is true', async () => {
    process.env.LOCAL_DEV_BYPASS_AUTH = 'true';

    const { verifyOidcToken } = await import('../middleware/oidc-auth.js');
    const request = mockRequest(undefined);
    const reply = mockReply();

    await verifyOidcToken(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });
});
