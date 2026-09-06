import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import BadgeChip from '@/app/components/BadgeChip';
import { prisma } from '@/lib/prisma';
import { getEnv } from '@/lib/env';

/**
 * TH-S31 — Beta environment page: S3/S4 capture verification + retention
 * status.
 *
 * "Capture verification" here is a rough visibility proxy, not a rigorous
 * statistical audit (the story explicitly doesn't require the latter): the
 * count of `SafetyState` rows currently sitting at S3/S4 (the crisis-adjacent
 * end of the safety-state scale) against the total `SafetyState` row count,
 * alongside raw `Turn` and `GovernanceLog` counts for scale/context. These
 * are queried from the *main* `@evia/prisma` schema (User/SafetyState/Turn/
 * GovernanceLog — not the test-harness models), read-only, via the plain
 * `prisma` singleton — no writes happen on this page.
 *
 * Note: none of SafetyState/Turn/GovernanceLog carry a `TestEnvironment`
 * column (they're the main app's production tables, not test-harness
 * tables), so these counts are unscoped totals across the whole database,
 * not filtered to "beta test-harness activity" specifically. That's
 * consistent with the story's framing of this page as a rough proxy/
 * visibility tool, not an RLS-scoped query — RLS in this story applies to
 * the test-harness tables (TestRun, ModelConfigPin, PromptRegistryEntry,
 * GateSignOff, TestBudget), not to the main schema's clinical tables.
 */

export const dynamic = 'force-dynamic';

async function loadCaptureStats() {
  if (!prisma) {
    return null;
  }

  const [totalSafetyStates, s3s4Count, turnCount, governanceLogCount] = await Promise.all([
    prisma.safetyState.count(),
    prisma.safetyState.count({
      where: { safety_state_current: { in: ['S3', 'S4'] } },
    }),
    prisma.turn.count(),
    prisma.governanceLog.count(),
  ]);

  const captureRate = totalSafetyStates > 0 ? s3s4Count / totalSafetyStates : null;

  return { totalSafetyStates, s3s4Count, turnCount, governanceLogCount, captureRate };
}

export default async function BetaPage() {
  const stats = await loadCaptureStats();
  const env = getEnv();
  const retentionDays = env.BETA_RETENTION_DAYS;

  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-3xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Beta environment
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            S3/S4 capture verification and retention status for beta-environment,
            real-user-derived test-harness data.
          </p>
        </div>

        <section className="flex flex-col gap-[var(--spacing-sm)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-md)]">
          <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
            Retention policy
          </h2>
          <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Beta-scoped test-harness data (TestRun, CorpusCase) is eligible for
            deletion/depersonalization after{' '}
            <BadgeChip>{retentionDays} days</BadgeChip> (configurable via{' '}
            <code>BETA_RETENTION_DAYS</code>, per ADR-013). The cleanup job lives
            at <code>apps/worker/src/routes/beta-retention.ts</code> and defaults
            to a dry run — see <code>docs/test-harness/ethics-review-prep.md</code>{' '}
            for the full policy.
          </p>
        </section>

        <section className="flex flex-col gap-[var(--spacing-sm)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-md)]">
          <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
            S3/S4 capture verification (rough proxy)
          </h2>
          {!stats ? (
            <p className="text-[var(--text-body-main)] text-[var(--color-error)]">
              Database not configured (no DATABASE_URL) — capture stats unavailable.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-[var(--spacing-md)] gap-y-2 text-[var(--text-body-main)]">
              <dt className="text-[var(--color-on-surface-variant)]">SafetyState rows (total)</dt>
              <dd className="text-[var(--color-on-surface)]">{stats.totalSafetyStates}</dd>

              <dt className="text-[var(--color-on-surface-variant)]">S3/S4 SafetyState rows</dt>
              <dd className="text-[var(--color-on-surface)]">{stats.s3s4Count}</dd>

              <dt className="text-[var(--color-on-surface-variant)]">S3/S4 capture rate</dt>
              <dd className="text-[var(--color-on-surface)]">
                {stats.captureRate === null ? 'n/a (no SafetyState rows)' : `${(stats.captureRate * 100).toFixed(1)}%`}
              </dd>

              <dt className="text-[var(--color-on-surface-variant)]">Turn rows (total)</dt>
              <dd className="text-[var(--color-on-surface)]">{stats.turnCount}</dd>

              <dt className="text-[var(--color-on-surface-variant)]">GovernanceLog rows (total)</dt>
              <dd className="text-[var(--color-on-surface)]">{stats.governanceLogCount}</dd>
            </dl>
          )}
          <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            These are unscoped totals across the main clinical schema (not
            filtered to test-harness beta activity specifically) — a rough
            visibility proxy, not a rigorous statistical verification.
          </p>
        </section>
      </main>
    </AuthenticatedShell>
  );
}
