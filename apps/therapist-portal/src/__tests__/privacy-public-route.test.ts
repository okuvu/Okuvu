import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * E19-S2 / landing page — public routes must be reachable with no session,
 * and everything else must keep behaving as before. The point of these tests
 * is that each exemption is narrow: exact paths, not prefixes, and none of
 * them change the signed-in redirect or the redirect for protected pages.
 *
 * Changed deliberately when the landing page replaced the root redirect:
 * `/` is now public (it is the marketing page, not a bounce into the app) and
 * a signed-in visitor leaving `/auth` goes to `/dashboard` or `/admin`
 * instead of `/`. Both are asserted here so the change is visible rather
 * than accidental.
 */

const getServerSession = vi.fn();

vi.mock('next-auth/next', () => ({ getServerSession: () => getServerSession() }));
vi.mock('@/lib/auth', () => ({ authConfig: {} }));

const { proxy } = await import('../proxy');

function req(path: string): NextRequest {
  return new NextRequest(new URL(path, 'https://okuvu.in'), { method: 'GET' });
}

describe('proxy — public routes', () => {
  beforeEach(() => {
    getServerSession.mockReset();
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
    delete process.env.ADMIN_EMAILS;
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

  it('serves the landing page at / to a visitor with no session', async () => {
    getServerSession.mockResolvedValue(null);

    const res = await proxy(req('/'));

    expect(res).toBeUndefined();
    // Same reasoning as /privacy: a page whose whole job is explaining the
    // product must render even if the identity provider is misconfigured.
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it('serves / to a signed-in user too, without redirecting them anywhere', async () => {
    getServerSession.mockResolvedValue({ user: { name: 'Therapist' } });

    expect(await proxy(req('/'))).toBeUndefined();
  });

  it('exempts the waitlist endpoint exactly, not as a prefix', async () => {
    expect(await proxy(req('/api/waitlist'))).toBeUndefined();
    expect(getServerSession).not.toHaveBeenCalled();

    getServerSession.mockResolvedValue(null);
    const other = await proxy(req('/api/waitlist-admin'));
    expect(other!.status).toBe(307);
    expect(new URL(other!.headers.get('location')!).pathname).toBe('/auth');
  });

  it('still redirects unauthenticated traffic to /auth for a protected page', async () => {
    getServerSession.mockResolvedValue(null);

    const res = await proxy(req('/dashboard'));

    expect(res).toBeDefined();
    expect(res!.status).toBe(307);
    expect(new URL(res!.headers.get('location')!).pathname).toBe('/auth');
  });

  it('still redirects nested protected routes and the tRPC endpoint', async () => {
    getServerSession.mockResolvedValue(null);

    for (const path of ['/clients/abc', '/api/trpc/clients.list']) {
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
    getServerSession.mockResolvedValue({ user: { name: 'Therapist', email: 'therapist@okuvu.dev' } });

    const res = await proxy(req('/auth'));

    expect(res).toBeDefined();
    expect(res!.status).toBe(307);
    expect(new URL(res!.headers.get('location')!).pathname).toBe('/dashboard');
  });

  it('sends the operator account to /admin, not to an empty caseload', async () => {
    process.env.ADMIN_EMAILS = 'admin@okuvu.in';
    getServerSession.mockResolvedValue({ user: { name: 'Okuvu', email: 'admin@okuvu.in' } });

    const res = await proxy(req('/auth'));

    expect(res!.status).toBe(307);
    expect(new URL(res!.headers.get('location')!).pathname).toBe('/admin');
  });

  it('keeps /api/health and /api/auth unauthenticated for the ALB and next-auth', async () => {
    for (const path of ['/api/health', '/api/auth/session']) {
      expect(await proxy(req(path)), path).toBeUndefined();
    }
    expect(getServerSession).not.toHaveBeenCalled();
  });
});
