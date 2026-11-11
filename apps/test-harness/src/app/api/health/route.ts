import { NextResponse } from 'next/server';

/**
 * Unauthenticated health check for the load balancer.
 *
 * `/` redirects to `/auth` for an anonymous caller, so the ALB target group
 * could never mark a task healthy by polling it. This route answers without a
 * session and without touching the database — a health check that fails when
 * Postgres is slow turns a slow query into a rolling restart.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'okuvu-test-harness',
    commit: process.env.DEPLOYED_COMMIT ?? null,
    at: new Date().toISOString(),
  });
}
