import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * E19-S2 — `/privacy` must be reachable with no session, and everything else
 * must keep behaving as before. The point of these tests is that the exemption
 * is narrow: it is an exact path, not a prefix, and it does not change the
 * signed-in redirect for `/auth` or the redirect for protected pages.
 */

const getServerSession = vi.fn();

vi.mock('next-auth/next', () => ({ getServerSession: () => getServerSession() }));
vi.mock('@/lib/auth', () => ({ authConfig: {} }));

const { proxy } = await import('../proxy');

function req(path: string): NextRequest {
  return new NextRequest(new URL(path, 'https://okuvu.in'), { method: 'GET' });
}

describe('proxy — /privacy is public (E19-S2)', () => {
  beforeEach(() => {
    getServerSession.mockReset();
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
  });

  it('lets an unauthenticated request to /privacy through without touching the session', async () => {
    const res = await proxy(req('/privacy'));

    expect(res).toBeUndefined();
    // Short-circuits before getServerSession: the policy page must not depend
    // on the auth infrastructure being reachable.
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it('does not bounce a signed-in user away from /privacy', async () => {
    getServerSession.mockResolvedValue({ user: { name: 'Therapist' } });

    const res = await proxy(req('/privacy'));

    expect(res).toBeUndefined();
  });

  it('still redirects unauthenticated traffic to /auth for a protected page', async () => {
    getServerSession.mockResolvedValue(null);

    const res = await proxy(req('/dashboard'));

    expect(res).toBeDefined();
    expect(res!.status).toBe(307);
    expect(new URL(res!.headers.get('location')!).pathname).toBe('/auth');
  });

  it('still redirects the portal root and a nested protected route', async () => {
    getServerSession.mockResolvedValue(null);

    for (const path of ['/', '/clients/abc', '/api/trpc/clients.list']) {
      const res = await proxy(req(path));
      expect(res!.status, path).toBe(307);
      expect(new URL(res!.headers.get('location')!).pathname, path).toBe('/auth');
    }
  });

  it('exempts /privacy exactly, not as a prefix', async () => {
    getServerSession.mockResolvedValue(null);

    for (const path of ['/privacyx', '/privacy/extra', '/privacy-dashboard']) {
      const res = await proxy(req(path));
      expect(res, path).toBeDefined();
      expect(res!.status, path).toBe(307);
      expect(new URL(res!.headers.get('location')!).pathname, path).toBe('/auth');
    }
  });

  it('keeps sending a signed-in user from /auth into the app', async () => {
    getServerSession.mockResolvedValue({ user: { name: 'Therapist' } });

    const res = await proxy(req('/auth'));

    expect(res).toBeDefined();
    expect(res!.status).toBe(307);
    expect(new URL(res!.headers.get('location')!).pathname).toBe('/');
  });

  it('keeps /api/health and /api/auth unauthenticated for the ALB and next-auth', async () => {
    for (const path of ['/api/health', '/api/auth/session']) {
      expect(await proxy(req(path)), path).toBeUndefined();
    }
    expect(getServerSession).not.toHaveBeenCalled();
  });
});
