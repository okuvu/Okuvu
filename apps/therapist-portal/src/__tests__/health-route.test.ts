import { describe, expect, it, vi } from 'vitest';

// The ALB target group in infrastructure/aws/evia-beta/alb.tf polls this path
// with matcher "200". Two things must hold or every ECS task is drained as
// unhealthy: the handler answers 200, and the auth proxy does not redirect it.
describe('ALB health endpoint', () => {
  it('answers 200 with a status payload and no auth', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      service: 'therapist-portal',
    });
  });

  it('is exempted from the auth proxy', async () => {
    vi.resetModules();
    const { proxy } = await import('@/proxy');
    const request = {
      nextUrl: { pathname: '/api/health' },
    } as Parameters<typeof proxy>[0];

    // No session is mocked at all: if the exemption were missing, this would
    // either throw (session lookup) or return a redirect to /auth.
    await expect(proxy(request)).resolves.toBeUndefined();
  });
});
