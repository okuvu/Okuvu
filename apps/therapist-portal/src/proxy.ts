import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_ROUTES = new Set(['/auth']);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/auth')) {
    return undefined;
  }

  const session = await getServerSession(authConfig);
  const isPublic =
    PUBLIC_ROUTES.has(pathname) ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico';

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
