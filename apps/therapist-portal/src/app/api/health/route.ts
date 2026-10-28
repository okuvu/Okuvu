/**
 * Liveness endpoint for the AWS ALB target group (infrastructure/aws/evia-beta
 * alb.tf polls /api/health with matcher 200). Deliberately does no work: it
 * must not touch Postgres or Cognito, so a slow database cannot cause the ALB
 * to pull a healthy task out of service. The API's own /health does the same.
 *
 * Unauthenticated by design, and therefore exempted in proxy.ts — without that
 * exemption the health check would get a 307 to /auth and the task would never
 * become healthy.
 */
export async function GET() {
  return Response.json({ status: 'ok', service: 'therapist-portal' });
}
