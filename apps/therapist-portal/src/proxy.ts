import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Routes that exist only for signed-out visitors: reaching one while signed in
 * bounces you into the app (`/`), because there is nothing to do there.
 */
const PUBLIC_ROUTES = new Set(['/auth']);

/**
 * E19-S2 — pages that must be readable by anyone, signed in or not, and that
 * must NOT bounce a signed-in user anywhere.
 *
 * `/privacy` belongs here rather than in PUBLIC_ROUTES because it is the same
 * document for a therapist, a client's relative, a Google Play reviewer and a
 * Data Protection Board complaint: a signed-in visitor redirected away from it
 * would be a bug, not a convenience.
 *
 * This set is the *whole* reason `/privacy` renders unauthenticated. Routes not
 * listed here (or covered by the prefixes below) still require a session — do
 * not widen this into a prefix match or a bypass.
 */
const PUBLIC_PATHS = new Set(['/privacy']);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/auth')) {
    return undefined;
  }

  // ALB liveness probe (alb.tf polls this path with matcher 200). It carries no
  // session, so it must short-circuit before the session lookup.
  if (pathname === '/api/health') {
    return undefined;
  }

  if (process.env.LOCAL_DEV_BYPASS_AUTH === 'true') {
    return undefined;
  }

  // Public pages short-circuit *before* getServerSession: a policy page must
  // not depend on auth infrastructure being reachable, and must still render if
  // the session cookie is stale or the provider is misconfigured.
  if (PUBLIC_PATHS.has(pathname)) {
    return undefined;
  }

  const session = await getServerSession(authConfig);
  const isPublic =
    PUBLIC_ROUTES.has(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/brand/') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.svg';

  if (!session?.user && !isPublic) {
    const url = new URL('/auth', request.url);
    return NextResponse.redirect(url);
  }

  if (session?.user && PUBLIC_ROUTES.has(pathname)) {
    const url = new URL('/', request.url);
    return NextResponse.redirect(url);
  }

  return undefined;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
