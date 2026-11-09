import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Google Play requires the Terms of Service URL to be reachable by anyone, on
 * a plain HTML page with no login — so `/terms` joins `/privacy` and
 * `/delete-account` in PUBLIC_PATHS. These tests pin that exemption to one
 * exact path: a sibling route must still bounce to /auth, and a signed-in
 * visitor must not be redirected off the page either (a therapist may be
 * re-reading terms they accepted).
 */

const getServerSession = vi.fn();

vi.mock('next-auth/next', () => ({ getServerSession: () => getServerSession() }));
vi.mock('@/lib/auth', () => ({ authConfig: {} }));

const { proxy } = await import('../proxy');

function req(path: string): NextRequest {
  return new NextRequest(new URL(path, 'https://okuvu.in'), { method: 'GET' });
}

describe('proxy — the public terms of service page', () => {
  beforeEach(() => {
    getServerSession.mockReset();
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
    delete process.env.ADMIN_EMAILS;
  });

  it('lets an unauthenticated visitor reach /terms without touching the session', async () => {
    const res = await proxy(req('/terms'));

    expect(res).toBeUndefined();
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it('does not bounce a signed-in user away from /terms', async () => {
    getServerSession.mockResolvedValue({ user: { name: 'Therapist' } });

    expect(await proxy(req('/terms'))).toBeUndefined();
  });

  it('exempts /terms exactly, not as a prefix', async () => {
    getServerSession.mockResolvedValue(null);

    for (const path of ['/termsx', '/terms/extra', '/terms-of-service', '/termsandconditions']) {
      const res = await proxy(req(path));
      expect(res, path).toBeDefined();
      expect(res!.status, path).toBe(307);
      expect(new URL(res!.headers.get('location')!).pathname, path).toBe('/auth');
    }
  });

  it('keeps the pages that sit beside it protected', async () => {
    getServerSession.mockResolvedValue(null);

    for (const path of ['/dashboard', '/admin', '/account/password']) {
      const res = await proxy(req(path));
      expect(res!.status, path).toBe(307);
      expect(new URL(res!.headers.get('location')!).pathname, path).toBe('/auth');
    }
  });

  it('still lets the other Play-facing legal pages through', async () => {
    for (const path of ['/privacy', '/delete-account']) {
      expect(await proxy(req(path)), path).toBeUndefined();
    }
    expect(getServerSession).not.toHaveBeenCalled();
  });
});
