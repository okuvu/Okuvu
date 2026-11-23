import { describe, expect, it, vi } from 'vitest';

/**
 * The worker's DB writes are keyed on `User.id`; the runner carries the auth
 * subject. Confusing the two 500s the session close on
 * `SessionSummary_user_id_fkey` and makes every campaign conversation
 * INCOMPLETE — which is exactly what testing.okuvu.in did before this.
 */

const findUnique = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

const { resolveDbUserId } = await import('@/lib/worker-user-id');

describe('resolveDbUserId', () => {
  it('maps an auth subject to the User.id the worker needs', async () => {
    findUnique.mockResolvedValueOnce({ id: '0f0e9c3a-1111-4c2c-9d1a-2b3c4d5e6f70' });
    await expect(resolveDbUserId('test-user-runner-123-abc')).resolves.toBe(
      '0f0e9c3a-1111-4c2c-9d1a-2b3c4d5e6f70',
    );
    expect(findUnique).toHaveBeenCalledWith({
      where: { auth_subject: 'test-user-runner-123-abc' },
      select: { id: true },
    });
  });

  it('passes a value through unchanged when no user row matches', async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(resolveDbUserId('already-a-uuid')).resolves.toBe('already-a-uuid');
  });
});
