-- ============================================================================
-- TH-S31: Beta Environment Config + Ethics Prep — Postgres Row-Level Security
-- ============================================================================
--
-- MANUAL MIGRATION — NOT applied via `prisma migrate`.
--
-- `packages/prisma/migrations/` has no Prisma migration history yet (no
-- migration has ever been run against a live database for this project, per
-- a sibling story). This file is therefore a hand-written, clearly-labeled
-- raw SQL migration living outside Prisma's own migration folder convention
-- (`manual/`), so it is never picked up or replayed by `prisma migrate`.
--
-- WHO RUNS THIS AND HOW:
--   A person with DB admin access must run this manually against each
--   environment's database (Neon locally, Cloud SQL Postgres in
--   staging/prod) *after* `prisma generate`/`prisma db push` (or an eventual
--   real Prisma migration) has created the tables below, and again after any
--   future migration that recreates one of these tables (RLS state and
--   policies are not preserved by `prisma db push`/`migrate` on a table
--   rebuild):
--
--     psql "$DATABASE_URL" -f packages/prisma/migrations/manual/001_test_harness_beta_rls.sql
--
-- WHY RLS INSTEAD OF PRISMA'S multiSchema:
--   Prisma's `multiSchema` preview feature would require retroactively
--   annotating every one of the ~20 existing models in schema.prisma with
--   `@@schema(...)`, not just the test-harness tables — a large, unrelated,
--   unverifiable (no live DB in this environment) blast-radius change. RLS
--   is standard Postgres, requires no Prisma schema restructuring, and is
--   enforced at the database layer regardless of which client/service
--   connects.
--
-- MECHANISM:
--   Each table below gets RLS enabled and a policy that only allows a row
--   through when its `environment` column matches the Postgres session
--   variable `app.current_environment`, set per-transaction via
--   `SET LOCAL app.current_environment = '<env>'` (see
--   apps/test-harness/src/lib/prisma-rls.ts — `withEnvironment()`). A
--   session that never sets `app.current_environment` sees `current_setting(
--   'app.current_environment', true)` return NULL, and the `environment::text
--   = NULL` comparison is never true (SQL NULL semantics) — so **the
--   fail-safe default is zero rows visible**, not an accidental full-table
--   leak, for any connection that forgets to scope itself.
--
-- SCOPE (tables with an `environment TestEnvironment` column, per
-- packages/prisma/schema.prisma as of this story):
--   - TestRun              (frozen_triple/results Json may contain
--                            beta-sourced S3/S4 crisis-state content)
--   - ModelConfigPin
--   - PromptRegistryEntry
--   - GateSignOff           (evidence field may reference beta run content)
--   - TestBudget
--
--   NOTE ON CorpusCase: as of this story, CorpusCase has NO `environment`
--   column (confirmed by reading schema.prisma — it only has `data_origin`,
--   added by TH-S26). Per this story's brief, that means CorpusCase is
--   OUT OF SCOPE for RLS here rather than a schema change forced through to
--   fit it in. Real-user-derived corpus content is still identifiable via
--   the existing `data_origin = 'real'` flag, which TH-S26's
--   `assertDataOriginAllowed()` already restricts to the beta environment
--   at the application layer — this is an application-level control, NOT a
--   DB-level RLS guarantee, and is called out as a gap in the ethics-prep
--   doc (docs/test-harness/ethics-review-prep.md) and in this story's final
--   report. A follow-up story should add `CorpusCase.environment` and a
--   sixth policy here if/when DB-level isolation of corpus content becomes
--   required.
--
-- Prisma enum mapping: `TestEnvironment` (sandbox | staging | beta) has no
-- `@map`/`@@map` in schema.prisma, so Prisma's postgresql provider creates a
-- native Postgres enum type named "TestEnvironment" and the `environment`
-- column is typed as that enum, not text. `current_setting(...)` always
-- returns `text`, so the comparison casts the enum column to text
-- (`environment::text`) rather than casting the setting to the enum type —
-- this avoids an error if the setting is ever unset/empty (empty string is
-- not a valid enum value but casts fine to text).
-- ============================================================================

BEGIN;

-- ── TestRun ──────────────────────────────────────────────────────────────
ALTER TABLE "TestRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TestRun" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_harness_environment_isolation_test_run ON "TestRun";
CREATE POLICY test_harness_environment_isolation_test_run ON "TestRun"
  USING (environment::text = current_setting('app.current_environment', true));

-- ── ModelConfigPin ───────────────────────────────────────────────────────
ALTER TABLE "ModelConfigPin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModelConfigPin" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_harness_environment_isolation_model_config_pin ON "ModelConfigPin";
CREATE POLICY test_harness_environment_isolation_model_config_pin ON "ModelConfigPin"
  USING (environment::text = current_setting('app.current_environment', true));

-- ── PromptRegistryEntry ──────────────────────────────────────────────────
ALTER TABLE "PromptRegistryEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromptRegistryEntry" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_harness_environment_isolation_prompt_registry_entry ON "PromptRegistryEntry";
CREATE POLICY test_harness_environment_isolation_prompt_registry_entry ON "PromptRegistryEntry"
  USING (environment::text = current_setting('app.current_environment', true));

-- ── GateSignOff ───────────────────────────────────────────────────────────
ALTER TABLE "GateSignOff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GateSignOff" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_harness_environment_isolation_gate_sign_off ON "GateSignOff";
CREATE POLICY test_harness_environment_isolation_gate_sign_off ON "GateSignOff"
  USING (environment::text = current_setting('app.current_environment', true));

-- ── TestBudget ────────────────────────────────────────────────────────────
ALTER TABLE "TestBudget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TestBudget" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_harness_environment_isolation_test_budget ON "TestBudget";
CREATE POLICY test_harness_environment_isolation_test_budget ON "TestBudget"
  USING (environment::text = current_setting('app.current_environment', true));

COMMIT;

-- ============================================================================
-- OPERATIONAL NOTES
-- ============================================================================
--
-- 1. `FORCE ROW LEVEL SECURITY` is included (not just `ENABLE`) so that the
--    policies also apply to the table owner role. Without FORCE, a
--    connection using the table-owning role (often the case for a simple
--    single-role app connection string, e.g. the Neon/Cloud SQL default
--    user) would bypass RLS entirely, defeating the purpose. If the
--    deployment uses a *non-owner* application role (recommended for
--    defense in depth), FORCE is redundant but harmless.
--
-- 2. These are USING-only policies (no WITH CHECK), so by default they also
--    govern INSERT/UPDATE/DELETE row visibility for matching rows. If a
--    future story needs INSERTs to be blocked outright when
--    app.current_environment doesn't match the row being inserted (rather
--    than merely being invisible after insert), add an explicit
--    `WITH CHECK (environment::text = current_setting('app.current_environment', true))`
--    clause per table.
--
-- 3. This file is idempotent (DROP POLICY IF EXISTS before CREATE POLICY,
--    ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY is idempotent by
--    nature) so it is safe to re-run.
--
-- 4. UNVERIFIED IN THIS ENVIRONMENT: no DATABASE_URL/live Postgres instance
--    is available here, so this SQL has been reviewed for correctness
--    against Postgres RLS syntax and Prisma's enum-column mapping, but has
--    NOT been executed against a real database. A person with DB admin
--    access must run it and confirm (a) it applies cleanly, and (b) a
--    beta-scoped session genuinely cannot read/write sandbox/staging rows
--    and vice versa, before beta data collection begins.
-- ============================================================================
