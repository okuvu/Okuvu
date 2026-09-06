import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TH-S31 — Beta environment RLS isolation test.
 *
 * IMPORTANT — SCOPE OF WHAT THIS TEST CAN AND CANNOT PROVE:
 * This environment has no DATABASE_URL / live Postgres instance, so this is
 * a *structural* test against a mocked Prisma client. It asserts that
 * `withEnvironment()` issues `SET LOCAL app.current_environment = '<env>'`
 * as the first raw statement inside a transaction, before the caller's own
 * queries run — i.e. that the application-side wiring for RLS is correct.
 *
 * It does NOT and CANNOT prove that the Postgres RLS policies in
 * packages/prisma/migrations/manual/001_test_harness_beta_rls.sql actually
 * enforce isolation (that a beta-scoped query genuinely cannot see sandbox
 * rows and vice versa) — that requires a real database with the policies
 * applied. A live-DB integration test asserting exactly that is a REQUIRED
 * follow-up before beta data collection begins; it is explicitly not
 * something this test fakes a pass for.
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import('@/lib/prisma');
const { withEnvironment } = await import('@/lib/prisma-rls');

describe('withEnvironment (structural, mocked Prisma)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues SET LOCAL app.current_environment before running the caller-supplied queries, inside one transaction', async () => {
    const callOrder: string[] = [];

    const tx = {
      $executeRawUnsafe: vi.fn().mockImplementation(async () => {
        callOrder.push('set_local');
        return 0;
      }),
      someModel: {
        findMany: vi.fn().mockImplementation(async () => {
          callOrder.push('query');
          return [];
        }),
      },
    };

    vi.mocked(prisma!.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const result = await withEnvironment('beta', async (txClient) => {
      return (txClient as unknown as typeof tx).someModel.findMany();
    });

    expect(result).toEqual([]);
    expect(prisma!.$transaction).toHaveBeenCalledTimes(1);

    // The SET LOCAL statement must run, and it must run before the caller's
    // query — order matters because SET LOCAL only affects statements
    // issued afterward in the same transaction.
    expect(callOrder).toEqual(['set_local', 'query']);

    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql] = tx.$executeRawUnsafe.mock.calls[0];
    expect(sql).toBe(`SET LOCAL app.current_environment = 'beta'`);
  });

  it('scopes to sandbox when called with "sandbox"', async () => {
    const tx = { $executeRawUnsafe: vi.fn().mockResolvedValue(0) };
    vi.mocked(prisma!.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await withEnvironment('sandbox', async () => 'noop');

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SET LOCAL app.current_environment = 'sandbox'`,
    );
  });

  it('scopes to staging when called with "staging"', async () => {
    const tx = { $executeRawUnsafe: vi.fn().mockResolvedValue(0) };
    vi.mocked(prisma!.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await withEnvironment('staging', async () => 'noop');

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SET LOCAL app.current_environment = 'staging'`,
    );
  });

  it('propagates the wrapped function return value unchanged', async () => {
    const tx = { $executeRawUnsafe: vi.fn().mockResolvedValue(0) };
    vi.mocked(prisma!.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const result = await withEnvironment('beta', async () => ({ rows: 42 }));

    expect(result).toEqual({ rows: 42 });
  });
});

/**
 * REQUIRED FOLLOW-UP (cannot be done here — no live DB):
 *
 *   describe('RLS live-DB integration (TODO once a real database exists)', () => {
 *     it('a beta-scoped withEnvironment() call cannot see sandbox-created TestRun rows', ...);
 *     it('a sandbox-scoped withEnvironment() call cannot see beta-created TestRun rows', ...);
 *     it('a connection that never calls withEnvironment() sees zero rows (fail-safe default)', ...);
 *   });
 *
 * These require applying packages/prisma/migrations/manual/001_test_harness_beta_rls.sql
 * to a real Postgres instance (Neon locally / Cloud SQL in staging) and
 * running actual cross-environment queries against it.
 */
