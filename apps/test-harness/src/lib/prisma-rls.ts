import type { Prisma, PrismaClient } from '@evia/prisma';
import { prisma } from './prisma';

/**
 * TH-S31 — Beta environment Row-Level Security helper.
 *
 * Additive on purpose: `apps/test-harness/src/lib/prisma.ts` keeps exporting
 * its lazily-constructed `prisma: PrismaClient | null` singleton unchanged,
 * so every existing router that already imports `prisma` directly keeps
 * working exactly as before. This file exports a new, opt-in helper that
 * routers can adopt when they need DB-enforced environment isolation (most
 * importantly: anything that can touch beta-scoped rows that may contain
 * real, live-user-derived S3/S4 crisis-state content). Migrating existing
 * routers onto this helper is out of scope for this story.
 *
 * How it works: Postgres Row-Level Security policies (see
 * packages/prisma/migrations/manual/001_test_harness_beta_rls.sql) restrict
 * every row in the RLS-enabled test-harness tables to
 * `environment::text = current_setting('app.current_environment', true)`.
 * That session setting is not implicitly known to Postgres — something has
 * to set it per-connection. `SET LOCAL` scopes the setting to the current
 * transaction only (it's reset at COMMIT/ROLLBACK), which is exactly what
 * we want: a `$transaction` callback that sets it first, then runs the
 * caller's queries, guarantees no cross-request bleed of the setting on a
 * pooled connection.
 *
 * IMPORTANT: `SET LOCAL app.current_environment = $1` cannot use Prisma's
 * normal parameterized query placeholders the way a `SELECT` can — `SET`
 * doesn't accept bind parameters in Postgres at all (`SET LOCAL foo = $1`
 * is a syntax error). We build the literal in application code instead of
 * accepting a raw string from any caller: `environment` is typed as
 * `TestEnvironment`, a closed enum, so there is no injection surface (the
 * value can only ever be one of 'sandbox' | 'staging' | 'beta' — there is no
 * code path that lets an arbitrary string reach this function as
 * `environment`). We still escape single quotes defensively in case that
 * invariant is ever weakened by a future refactor.
 */

export type TestEnvironment = 'sandbox' | 'staging' | 'beta';

function toSqlStringLiteral(value: TestEnvironment): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Runs `fn` inside a Postgres transaction that has `app.current_environment`
 * set (via `SET LOCAL`, so it never leaks past this transaction) to
 * `environment`. Every query `fn` issues through the transaction client it's
 * given is therefore scoped by the RLS policies in
 * `001_test_harness_beta_rls.sql` to rows whose `environment` column matches.
 *
 * Throws if the Prisma client isn't configured (no `DATABASE_URL`) — same
 * "Database not configured" contract every other router already uses via
 * `ctx.prisma`.
 */
export async function withEnvironment<T>(
  environment: TestEnvironment,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!prisma) {
    throw new Error('Database not configured (no DATABASE_URL).');
  }

  return prisma.$transaction(async (tx) => {
    // SET LOCAL cannot be parameterized; see the module doc comment above
    // for why the closed TestEnvironment type makes this safe.
    await tx.$executeRawUnsafe(
      `SET LOCAL app.current_environment = ${toSqlStringLiteral(environment)}`,
    );
    return fn(tx);
  });
}

const ALL_ENVIRONMENTS: TestEnvironment[] = ['sandbox', 'staging', 'beta'];

/**
 * For procedures that only have a row id as input — not its environment —
 * so `withEnvironment` can't be called directly (RLS requires the
 * environment to be set *before* the row becomes visible, but the row's
 * environment isn't known until it's read). Tries each of the 3
 * environments in turn (cheap: `TestEnvironment` is a closed 3-value enum)
 * and returns the first one `fn` resolves truthy for, plus which
 * environment that was (so a caller that needs to write back, e.g.
 * `archiveRun`, can reuse it in a second `withEnvironment` call rather than
 * guessing).
 */
export async function withAnyEnvironment<T>(
  fn: (tx: Prisma.TransactionClient, environment: TestEnvironment) => Promise<T | null | undefined>,
): Promise<{ result: T; environment: TestEnvironment } | null> {
  for (const environment of ALL_ENVIRONMENTS) {
    const result = await withEnvironment(environment, (tx) => fn(tx, environment));
    if (result) {
      return { result, environment };
    }
  }
  return null;
}

/**
 * For list/read procedures with an OPTIONAL environment filter (e.g.
 * `results.listRuns`) — when no single environment is specified, runs `fn`
 * once per environment (each properly RLS-scoped) and concatenates.
 */
export async function withAllEnvironments<T>(
  fn: (tx: Prisma.TransactionClient, environment: TestEnvironment) => Promise<T[]>,
): Promise<T[]> {
  const perEnvironment = await Promise.all(
    ALL_ENVIRONMENTS.map((environment) => withEnvironment(environment, (tx) => fn(tx, environment))),
  );
  return perEnvironment.flat();
}

/**
 * Convenience re-export so callers don't need to separately import the
 * lazily-constructed singleton just to pass it around; `withEnvironment`
 * above is the primary export of this module.
 */
export type { PrismaClient };
