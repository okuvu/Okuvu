# Test Harness — Ethics Review Prep (TH-S31)

**Status:** Draft for ethics committee review
**Date:** 2026-08-19
**Related:** ADR-013 (beta retention), TH-S26 (synthetic-first corpus), TH-S31 (this story)

This one-pager summarizes the technical and process controls in place before
beta-environment test-harness data collection begins, for the ethics
committee's review. Beta-environment data may contain real, live-user-derived
S3/S4 crisis-state content, so these controls exist specifically to bound
that risk.

## 1. Isolation mechanism (what actually shipped)

Beta-environment test-harness data is isolated from sandbox/staging data via
**Postgres Row-Level Security (RLS)** — not an environment-column-only
application-level filter, and not Prisma's `multiSchema` feature (rejected:
it would require restructuring all ~20 existing Prisma models, unrelated to
this story's scope).

- Migration: `packages/prisma/manual-migrations/001_test_harness_beta_rls.sql`
  (manual — no Prisma migration history exists yet for this project; must be
  run by a DB admin via `psql "$DATABASE_URL" -f ...`).
- Enables RLS + a `USING (environment::text = current_setting('app.current_environment', true))`
  policy on every test-harness table that carries an `environment` column:
  `TestRun`, `ModelConfigPin`, `PromptRegistryEntry`, `GateSignOff`,
  `TestBudget`.
- Application wiring: `apps/test-harness/src/lib/prisma-rls.ts` exports
  `withEnvironment(environment, fn)`, which opens a transaction, issues
  `SET LOCAL app.current_environment = '<env>'`, and runs the caller's
  queries inside it — so RLS policies scope every query in that transaction
  to the given environment.
- **Fail-safe default:** a connection that never sets
  `app.current_environment` sees `current_setting(...)` return NULL, and the
  equality check is never true for NULL — so the default is zero rows
  visible, not an accidental leak.
- **Known gap:** `CorpusCase` (the model holding the actual test-case text,
  including any real-user-derived content) has no `environment` column as of
  this story, so it is *not* RLS-scoped at the DB level. Real-derived corpus
  content is identified via the existing `data_origin = 'real'` flag, which
  application code (`corpusRouter.assertDataOriginAllowed()`) already
  restricts to being set only when `environment === 'beta'` — but that is an
  application-level invariant, not a database-enforced one. A follow-up
  story should add `CorpusCase.environment` and a sixth RLS policy to close
  this gap.
- **UPDATE 2026-08-19 — live-tested end-to-end, isolation confirmed
  working.** The migration was run against a live Neon Postgres branch;
  the RLS policies installed correctly (`relrowsecurity`/
  `relforcerowsecurity` both `true`). A first live test connected as
  `neondb_owner` and found isolation did NOT hold — that role has the
  `BYPASSRLS` attribute, which makes Postgres skip row-level security for
  it unconditionally (`FORCE ROW LEVEL SECURITY` only binds the table
  *owner*, and does not override `BYPASSRLS`). A dedicated role,
  `test_harness_app` (non-superuser, `NOBYPASSRLS`, standard CRUD grants),
  was then created. Re-running the identical cross-environment test as
  `test_harness_app` confirmed correct behavior: sandbox-scoped queries
  see only sandbox rows, beta-scoped see only beta rows, and queries with
  no environment scope set see **zero rows**. **Remaining step before beta
  data collection begins:** the app's actual deployed `DATABASE_URL` must
  be set to `test_harness_app`, not `neondb_owner` — the role exists and
  is verified correct, but no deployment has occurred yet to actually use
  it (see the deployment gap noted elsewhere in this doc).

## 2. Retention policy

- **90-day default**, configurable via `BETA_RETENTION_DAYS` (per ADR-013,
  `docs/adr/013-test-harness-beta-retention.md`).
- Enforced by `apps/worker/src/routes/beta-retention.ts` —
  `POST /cleanup/beta-retention`, OIDC-protected, mirroring the existing
  `cleanup.ts` route structure.
- Deletes beta-scoped `TestRun` rows (`environment = 'beta'`) and
  real-derived `CorpusCase` rows (`data_origin = 'real'`, per the gap noted
  above) older than the retention window.
- **Defaults to `dry_run=true`.** Only an explicit `dry_run=false` query
  param performs real deletes — a destructive default on a
  production-adjacent job was judged unacceptable. This lets the ethics
  committee review exactly what would be deleted before deletion is ever
  enabled.
- Visible at a glance on `apps/test-harness/src/app/beta/page.tsx`, which
  also surfaces the configured `BETA_RETENTION_DAYS` value and a rough
  S3/S4 capture-rate proxy (SafetyState rows currently at S3/S4 vs. total).
- **UPDATE 2026-09-06 — this capture-rate proxy structurally undercounts S4,
  and no S4 crisis turn is captured at all today.** While building the test
  harness's crisis-record-completeness check (see
  `docs/test-harness/mvp-v2-engineering-spec.md`'s reconciliation notes and
  Phase C writeup), tracing `apps/api/src/pipeline/orchestrator.ts`'s crisis
  branch found that when a turn routes to crisis (S4, or governance-Blocked
  forcing S4), `processTurn` returns **before** the code that writes the
  `Turn` row, upserts `SafetyState`, or sets `SessionLog.crisis_flag_detected`
  ever runs. The one production consumer, `apps/api/src/routes/websocket.ts`,
  only sends a `CRISIS_SIGNAL` frame to the client and logs one line — it
  persists nothing either. So the S3/S4 proxy above (`SafetyState` rows at
  S3/S4) can reflect S3 turns (which do complete the normal write path), but
  **a genuine S4 crisis turn leaves no `SafetyState` row, no `Turn` row, and
  no `crisis_flag_detected` flag** — there is currently no database record of
  a real crisis event at all, beta or otherwise. This is a production gap in
  `apps/api`, not something in this harness's own control; per an explicit
  decision when this was found, only the *check* that detects it was built
  this session — fixing the underlying persistence is separate, deliberate,
  safety-critical work that still needs to be scheduled and reviewed on its
  own before this committee should rely on any S3/S4 capture-rate number.

## 3. Consent capture flow

- `BetaConsent` model (`packages/prisma/schema.prisma`) records
  `{ id, corpus_case_id?, user_ref, scope, consent_granted_at, expires_at? }`.
- `apps/test-harness/src/server/routers/consent.ts` — `captureConsent`
  records a grant; `getConsentStatus` reports whether an active
  (non-expired) grant exists for a given `userRef` and/or `corpusCaseId`.
- `apps/test-harness/src/app/corpus/_components/ConsentPanel.tsx` — UI
  showing consent status per corpus case, with a capture action. The
  `consent` router is registered in the top-level `appRouter`; the UI
  still calls it via a local server-action caller (a leftover from before
  central wiring landed, harmless, a fine follow-up to simplify).
- Consent is scoped per corpus case / participant reference, with an
  optional expiry, so a lapsed consent can be distinguished from an active
  one without deleting the audit record itself.

## 4. DPDP (India's Digital Personal Data Protection Act, 2023) posture

- **Consent-based processing:** the consent capture flow above records an
  explicit grant (`consent_granted_at`) and scope (`scope` — a free-text
  description of what the participant consented to) before real-user-derived
  data is used in beta testing. `expires_at` allows time-bounded consent.
- **Right to erasure:** the retention job (§2) provides an automated,
  auditable deletion path for beta data past its retention window — the
  same mechanism that satisfies DPDP's data-minimization principle also
  satisfies erasure requirements. `dry_run=false` runs are logged
  (`beta_retention_deleted` structured log event) for an audit trail of what
  was deleted and when.
- **Data minimization:** TH-S26 established synthetic-first testing —
  `data_origin` defaults to `synthetic`, and `real` data_origin is
  application-restricted to the beta environment only. Real, live-user
  content is therefore the exception, not the default, across the corpus.
- **Purpose limitation — verified working, see §1 update:** the isolation
  mechanism means beta data (which may carry real-user content) cannot be
  queried by sandbox/staging-scoped connections through
  `withEnvironment()`. This is now confirmed by a live test (§1) using the
  correct, non-`BYPASSRLS` database role — keeping real-user data out of
  routine sandbox/staging test workflows by database-level construction,
  not just application convention. Holds only once the deployed app
  actually connects as that role, per §1's remaining operational step.

## 5. Open items for the ethics committee

1. The RLS migration (§1) has been run against a real database and
   verified working — a dedicated, non-`BYPASSRLS` Postgres role
   (`test_harness_app`) has been created and live-tested to confirm
   correct cross-environment isolation. The one remaining step is
   operational, not technical: the deployed app must actually be
   configured to use that role's connection string instead of
   `neondb_owner`.
2. Decide whether the `CorpusCase.environment` gap (§1) needs to be closed
   before beta corpus content is collected, or whether the existing
   application-level `data_origin` restriction is an acceptable interim
   control.
3. Review and approve the `BETA_RETENTION_DAYS` default (90) and the exact
   `scope` values consent capture should offer participants.
4. **New, 2026-09-06 — no real crisis (S4) turn is captured in the database
   at all today** (see the update in §2 above). This is more consequential
   than the retention/consent items above: it's not that beta S3/S4 data is
   retained too long or without consent, it's that it currently isn't
   captured *at all*, which affects clinical review, incident forensics, and
   the "S3/S4 100% capture" expectation this doc previously implied was
   already met by the capture-rate proxy. Recommend treating a fix to
   `apps/api`'s crisis-turn persistence as a prerequisite to beta data
   collection beginning, not a follow-up after.
