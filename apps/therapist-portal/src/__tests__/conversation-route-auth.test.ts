import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * E16-S9 — `/clients/[id]/conversation` renders raw conversation content, so
 * it must never be reachable without a session. The page itself also runs the
 * tRPC access check server-side, but that check is only as good as the one
 * thing in front of it: this route was added after the proxy's allowlist was
 * written, and nothing in the page code would notice if the proxy started
 * letting it through anonymously.
 *
 * Mirrors the /privacy suite's shape (same mock of next-auth) so the two
 * exemptions can't drift apart unnoticed.
 */

const getServerSession = vi.fn();

vi.mock('next-auth/next', () => ({ getServerSession: () => getServerSession() }));
vi.mock('@/lib/auth', () => ({ authConfig: {} }));

const { proxy } = await import('../proxy');

function req(path: string): NextRequest {
  return new NextRequest(new URL(path, 'https://okuvu.in'), { method: 'GET' });
}

describe('proxy — the conversation view requires a session (E16-S9)', () => {
  beforeEach(() => {
    getServerSession.mockReset();
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
  });

  it('redirects an unauthenticated read of a client conversation to /auth', async () => {
    getServerSession.mockResolvedValue(null);

    const res = await proxy(req('/clients/abc-123/conversation'));

    expect(res).toBeDefined();
    expect(res!.status).toBe(307);
    expect(new URL(res!.headers.get('location')!).pathname).toBe('/auth');
  });

  it('redirects an unauthenticated second page of a conversation too', async () => {
    getServerSession.mockResolvedValue(null);

    const res = await proxy(req('/clients/abc-123/conversation?cursor=2026-10-01T10%3A02%3A00.000Z%7Cturn_002'));

    expect(res).toBeDefined();
    expect(res!.status).toBe(307);
  });

  it('lets a signed-in therapist through to the page', async () => {
    getServerSession.mockResolvedValue({ user: { name: 'Therapist' } });

    expect(await proxy(req('/clients/abc-123/conversation'))).toBeUndefined();
  });
});
