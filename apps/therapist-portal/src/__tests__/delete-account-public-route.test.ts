import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Google Play requires the account-deletion URL to be reachable by anyone,
 * with no session and no app installed, so `/delete-account` joins `/privacy`
 * in PUBLIC_PATHS. These tests pin that exemption down to one exact path:
 * a sibling route must still bounce to /auth, and a signed-in visitor must not
 * be redirected off the page either (they may be checking what deletion does
 * before asking us to do it).
 */

const getServerSession = vi.fn();

vi.mock('next-auth/next', () => ({ getServerSession: () => getServerSession() }));
vi.mock('@/lib/auth', () => ({ authConfig: {} }));

const { proxy } = await import('../proxy');

function req(path: string): NextRequest {
  return new NextRequest(new URL(path, 'https://okuvu.in'), { method: 'GET' });
}

describe('proxy — the public account-deletion page', () => {
  beforeEach(() => {
    getServerSession.mockReset();
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
    delete process.env.ADMIN_EMAILS;
  });

  it('lets an unauthenticated visitor reach /delete-account without touching the session', async () => {
    const res = await proxy(req('/delete-account'));

    expect(res).toBeUndefined();
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it('does not bounce a signed-in user away from /delete-account', async () => {
    getServerSession.mockResolvedValue({ user: { name: 'Client' } });

    expect(await proxy(req('/delete-account'))).toBeUndefined();
  });

  it('exempts /delete-account exactly, not as a prefix', async () => {
    getServerSession.mockResolvedValue(null);

    for (const path of ['/delete-accountx', '/delete-account/extra', '/delete-accounts']) {
      const res = await proxy(req(path));
      expect(res, path).toBeDefined();
      expect(res!.status, path).toBe(307);
      expect(new URL(res!.headers.get('location')!).pathname, path).toBe('/auth');
    }
  });

  it('keeps the pages that surround it protected', async () => {
    getServerSession.mockResolvedValue(null);

    for (const path of ['/dashboard', '/account/password']) {
      const res = await proxy(req(path));
      expect(res!.status, path).toBe(307);
      expect(new URL(res!.headers.get('location')!).pathname, path).toBe('/auth');
    }
  });
});
