import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  signInternalAuthToken,
  verifyInternalAuthToken,
  verifyInternalToken,
} from '../middleware/internal-auth.js';

const SECRET = 'worker-internal-auth-test-secret';

// The behavioural intent carried over from the deleted platform-ID-token
// verifier tests: an unsigned or forged request is rejected with 401, and a
// request that satisfies the internal-auth contract is accepted. Only the
// transport changed — an HMAC over a timestamped canonical string verified with
// node:crypto, instead of a platform-issued JWT verified by an external
// library.

const ENV_KEYS = [
  'WORKER_INTERNAL_AUTH_SECRET',
  'WORKER_INTERNAL_AUTH_MAX_SKEW_SECONDS',
  'LOCAL_DEV_BYPASS_AUTH',
] as const;

function mockRequest(authHeader?: string) {
  return {
    headers: { authorization: authHeader },
    log: { warn: vi.fn(), error: vi.fn() },
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

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe('verifyInternalToken — internal ALB / shared-secret auth', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env.WORKER_INTERNAL_AUTH_SECRET = SECRET;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('accepts a request signed with the configured secret', async () => {
    const request = mockRequest(`Bearer ${signInternalAuthToken(SECRET)}`);
    const reply = mockReply();

    await verifyInternalToken(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.body).toBeUndefined();
  });

  it('accepts a bare token without the Bearer prefix (unchanged header tolerance)', async () => {
    const request = mockRequest(signInternalAuthToken(SECRET));
    const reply = mockReply();

    await verifyInternalToken(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('accepts a token inside the replay window', async () => {
    const request = mockRequest(`Bearer ${signInternalAuthToken(SECRET, nowSeconds() - 60)}`);
    const reply = mockReply();

    await verifyInternalToken(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('rejects a request with no Authorization header', async () => {
    const request = mockRequest(undefined);
    const reply = mockReply();

    await verifyInternalToken(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Missing Authorization header' },
    });
    expect(request.log.warn).not.toHaveBeenCalled();
  });

  it('rejects a token signed with a different secret (forged)', async () => {
    const request = mockRequest(`Bearer ${signInternalAuthToken('some-other-secret')}`);
    const reply = mockReply();

    await verifyInternalToken(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired internal auth token' },
    });
    expect(request.log.warn).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed token', async () => {
    const request = mockRequest('Bearer not-a-token');
    const reply = mockReply();

    await verifyInternalToken(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('rejects a truncated signature', async () => {
    const token = signInternalAuthToken(SECRET);
    const request = mockRequest(`Bearer ${token.slice(0, token.length - 2)}`);
    const reply = mockReply();

    await verifyInternalToken(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('rejects a stale token outside the replay window', async () => {
    const request = mockRequest(`Bearer ${signInternalAuthToken(SECRET, nowSeconds() - 3_600)}`);
    const reply = mockReply();

    await verifyInternalToken(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('rejects a future-dated token outside the replay window', async () => {
    const request = mockRequest(`Bearer ${signInternalAuthToken(SECRET, nowSeconds() + 3_600)}`);
    const reply = mockReply();

    await verifyInternalToken(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('honours a configured replay window', async () => {
    process.env.WORKER_INTERNAL_AUTH_MAX_SKEW_SECONDS = '30';
    const request = mockRequest(`Bearer ${signInternalAuthToken(SECRET, nowSeconds() - 60)}`);
    const reply = mockReply();

    await verifyInternalToken(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('fails closed when the shared secret is not configured', async () => {
    delete process.env.WORKER_INTERNAL_AUTH_SECRET;
    const request = mockRequest(`Bearer ${signInternalAuthToken(SECRET)}`);
    const reply = mockReply();

    await verifyInternalToken(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(request.log.error).toHaveBeenCalledTimes(1);
  });

  it('treats an empty secret as unconfigured', async () => {
    process.env.WORKER_INTERNAL_AUTH_SECRET = '   ';
    const request = mockRequest(`Bearer ${signInternalAuthToken('   ')}`);
    const reply = mockReply();

    await verifyInternalToken(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('bypasses verification entirely when LOCAL_DEV_BYPASS_AUTH is true', async () => {
    process.env.LOCAL_DEV_BYPASS_AUTH = 'true';
    const request = mockRequest(undefined);
    const reply = mockReply();

    await verifyInternalToken(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });
});

describe('verifyInternalAuthToken', () => {
  it('round-trips a freshly signed token', () => {
    const at = nowSeconds();
    expect(verifyInternalAuthToken(signInternalAuthToken(SECRET, at), SECRET, at)).toBe(true);
  });

  it('returns false instead of throwing on garbage input', () => {
    expect(verifyInternalAuthToken('', SECRET)).toBe(false);
    expect(verifyInternalAuthToken('v1.abc.def', SECRET)).toBe(false);
    expect(verifyInternalAuthToken('v1.999999999999.zzzz', SECRET)).toBe(false);
    expect(verifyInternalAuthToken(`${'v1'}.${'1'.repeat(20)}.${'a'.repeat(64)}`, SECRET)).toBe(
      false,
    );
  });

  it('rejects a signature of the right shape but the wrong key', () => {
    const at = nowSeconds();
    const token = signInternalAuthToken('other-secret', at);
    expect(verifyInternalAuthToken(token, SECRET, at)).toBe(false);
  });
});
