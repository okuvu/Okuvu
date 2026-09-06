# Test Harness — Engineer Runbook

**Audience:** engineers extending or maintaining `apps/test-harness`.

This runbook covers env vars, the router/procedure map, how to add a new agent to
`singleAgent`, how to run a determinism check, how to run a stochastic sampling run, and where
the deploy notes live. For local dev setup basics (install, `pnpm dev`, `.env` setup), see the
[README](../../apps/test-harness/README.md) — this doc doesn't repeat that, only what's specific
to extending the harness.

---

## 1. Local dev setup

See the [README's "Getting Started" section](../../apps/test-harness/README.md)
for the standard `pnpm install` / `.env` / `pnpm dev` flow. There is no local-dev auth bypass —
sign-in always goes through real Google OAuth checked against `TestHarnessAccess`, the same as
production (see `apps/test-harness/src/lib/auth.ts`).

## 2. Environment variables

This table is copied **verbatim** (variable names) from `apps/test-harness/.env.example` — treat
that file, not this table, as the source of truth if they ever diverge, and update both together.

| Variable | Purpose |
|---|---|
| `TEST_HARNESS_ENV` | Test harness environment (`sandbox`, `staging`, or `beta`). |
| `DATABASE_URL` | Postgres connection string — same Neon branch as therapist-portal. |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID, required for NextAuth. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret, required for NextAuth. |
| `NEXTAUTH_SECRET` | NextAuth session secret. |
| `NEXTAUTH_URL` | NextAuth base URL (`http://localhost:3002` locally). |
| `TEST_HARNESS_API_SANDBOX` | Target backend API endpoint for the sandbox environment. |
| `TEST_HARNESS_API_STAGING` | Target backend API endpoint for the staging environment. |
| `TEST_HARNESS_API_BETA` | Target backend API endpoint for the beta environment. |
| `WORKER_URL` | `apps/worker` base URL — used by the `singleAgent` router to invoke the combined A13 (summary) + A15 (memory) task via `POST /tasks/summary`. That route is OIDC-protected; without valid credentials the call fails gracefully and the harness surfaces an error result instead of crashing. |
| `VERTEX_AI_PRICE_API_URL` | Optional live Vertex AI pricing endpoint (TH-S17). If unset, the harness falls back to the static placeholder price table in `src/lib/pricing.ts`. No real Vertex AI pricing API contract is documented yet, so this is a best-effort integration point. |
| `BETA_RETENTION_DAYS` | Beta environment data retention window in days (TH-S31). Read by the `/beta` capture-verification page and by `apps/worker`'s `POST /cleanup/beta-retention` job. Default `"90"`, per ADR-013. |
| `GITHUB_TOKEN` | GitHub Actions REST API credentials for the `ci` router (`getGateStatus`/`triggerRegression`/`getHaltFailures`) and the `/ci` page (TH-S27). Needs `actions:read`/`actions:write`. **Never commit a real token.** |
| `GITHUB_REPO` | `"owner/repo"` form, e.g. `"evia-org/evia"`, paired with `GITHUB_TOKEN`. |

All 15 variables above are validated (with the same names) by the zod schema in
`apps/test-harness/src/lib/env.ts`'s `envSchema` — most are `.optional()` there (the harness is
designed to degrade gracefully, surfacing a catchable error rather than crashing, when a given
integration's env vars are unset), except `TEST_HARNESS_ENV` (defaults `'sandbox'`)
and `BETA_RETENTION_DAYS` (defaults `'90'`).

Secrets (`GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `NEXTAUTH_SECRET`, `GITHUB_TOKEN`) must be
provisioned through GCP Secret Manager in real deployments — see the README's "Secrets" section.

## 3. Router / procedure map

All routers are registered in `apps/test-harness/src/server/routers/_app.ts`. One line per
router:

| Router | Purpose | Key procedures |
|---|---|---|
| `example` | Scaffolding/health-check router from TH-S02. | `health`, `hello`, `getMe`, `echo` |
| `dashboard` | TH-01 Dashboard: env status, recent runs, gate summary, config-drift banner, gate sign-off. | `getOverview`, `signOffGate` (PI-only) |
| `testConfig` | Model Config Registry: pinning model version/temperature, prompt hashes, frozen-triple metadata. | `pinModelVersion` (PI-only), `getLatestPin`, `getPromptRegistry`, `setTemperature` (PI-only), `getFrozenTripleMetadata` |
| `singleAgent` | Invoke one pipeline agent (A1/A2/A8/A9-pre/A9-post/A13/A15) in isolation against a mocked session context. | `invokeAgent`, `mockSessionContext`, `getAgentSchema` |
| `faultInjection` | Inject timeouts/api_errors at a pipeline boundary and verify fail-safe behavior. | `injectModelFailure`, `injectSignalFailure`, `verifyFailSafe` |
| `determinism` | A8 router state-space enumeration, N-times repeat runs, cross-restart runs. | `enumerateA8StateSpace`, `runNtimes`, `runAcrossRestarts` |
| `stochastic` | Statistical sampling: Wilson CI, cost estimation, budget checks, N≥200 sampling runs. | `computeWilsonCI`, `estimateCost`, `checkBudget`, `runSampling` |
| `pipeline` | Full-pipeline runs against the real orchestrator, signal overrides/capture, silence-path validation. | `runFullPipeline`, `overrideSignal`, `captureSignalBus`, `validateSilencePath` |
| `review` | Blinded rater queue, rating submission, κ agreement, PI unblinding. | `getBlindedItems`, `submitRating`, `computeKappa`, `unblindResults` (PI-only) |
| `corpus` | Corpus case CRUD/versioning, paired-comparison export. `real` data-origin is server-enforced to beta only. | `listCases`, `createCase`, `versionCase`, `exportPairedComparison` |
| `results` | Trace & Results Viewer: list/get/compare runs, archive (the only allowed `TestRun` mutation), audit artifact export. | `listRuns`, `archiveRun`, `getRun`, `compareRuns`, `getAuditArtifact` |
| `consent` | Beta consent capture/status (TH-S31), backing the corpus consent panel. | `captureConsent`, `getConsentStatus` |
| `conversation` | TH-08 Conversation Driver: N-turn persona scripts against one persistent synthetic session, per-turn trace, trace export. | `runPersonaScript`, `getPerTurnTrace`, `exportTrace` |
| `ci` | GitHub Actions regression workflow status/trigger (TH-S27), backing `/ci`. | `getGateStatus`, `triggerRegression` (PI/ENGINEER-only), `getHaltFailures` |

**Note on `consent`:** the router's own header comment (and `ConsentPanel.tsx`'s comment)
describe it as "not yet registered in `_app.ts`," with the corpus/consent UI calling it through a
local server-action caller (`initTRPC.context<Context>().create()` + `createCallerFactory`,
in `app/corpus/actions.ts`-style files) instead of the normal tRPC HTTP/react-query client. As of
this writing, `_app.ts` **does** list `consent: consentRouter` — so those comments appear to be
stale relative to the current `_app.ts`. If you touch this router, verify which is actually true
at runtime before trusting either the comment or this note; it's a real discrepancy in the
codebase worth resolving (removing the stale comment or removing the workaround caller, whichever
matches reality).

Most PI-gated procedures throw `TRPCError({ code: 'FORBIDDEN' })` via an in-file guard (e.g.
`requirePI` in `testConfig.ts`, an inline `ctx.user.role !== 'PI'` check in `dashboard.ts` and
`review.ts`) rather than a shared middleware — follow that per-file pattern when adding a new
role-gated procedure unless you're also introducing a shared helper.

## 4. Adding a new agent to `singleAgent`

Single-agent invocation lives in `apps/test-harness/src/lib/agent-adapter.ts`, called by the
`singleAgent`, `determinism`, and `conversation` routers. To add a new agent:

1. Add the new agent's id to `TestAgentId` (in `@evia/shared-types`) and to the `testAgentIdSchema`
   zod enum duplicated in `singleAgent.ts` and `determinism.ts` (it's re-declared per-router
   rather than re-exported, so update both).
2. In `agent-adapter.ts`:
   - If the agent lives in `apps/api/src/agents/`, add a relative import
     (`../../../api/src/agents/<agent>/agent.js`) following the existing pattern for A1/A2/A8/A9.
     This works because `apps/api` is **not** a workspace dependency of `@evia/test-harness` —
     these are plain relative filesystem imports, and pnpm resolves the imported files' own
     dependencies (e.g. `@google-cloud/aiplatform`) from `apps/api/node_modules` independently.
   - If the agent lives in `apps/worker` instead (like A13/A15, which are combined into one
     `POST /tasks/summary` call — there is no standalone A15 endpoint), add an HTTP call to the
     worker following `invokeWorkerSummaryTask`'s pattern: read the base URL from `getEnv()`,
     fail gracefully (return an error field, don't throw) if the URL is unset or the call fails
     — worker routes tend to be OIDC-protected and will legitimately fail outside a fully
     credentialed deployment.
   - Add a `to<Agent>Input(ctx, overrides)` mapping function that merges the mock session context
     (`MockSessionContext` from `mock-context.ts`) with caller-supplied overrides, then add a
     `case` to `invokeAgentInner`'s switch statement calling the new function and returning
     `{ output, latencyMs, mockMode: true }`.
3. If the new agent needs new mock-context fields, extend `MockSessionContext` in `mock-context.ts`
   and `buildMockSessionContext`'s defaults.
4. Add the new agent's per-agent schema to `agent-schemas.ts` if the `getAgentSchema` procedure
   needs to describe its input shape to the UI (`/agents` screen).
5. Note: `A10A` is explicitly out of scope for single-agent invocation — `invokeAgentInner` throws
   for it deliberately. Don't wire it up without confirming that's changed.

Agent isolation (why this seam exists as an opt-in `testHooks`/`testMode` parameter on
`processTurn` rather than a duplicate orchestrator or direct-import-only approach) is documented
in `docs/adr/010-test-harness-agent-isolation.md`. Session state injection (why synthetic
`test-user-*` Prisma rows + in-memory context, no Redis) is documented in
`docs/adr/011-test-harness-session-injection.md`.

## 5. Running a determinism check

Two ways to run the A8 router state-space regression check (5 safety states × 3 governance
states = 15 fixed cells, comparing the real production `routeTurn` against an expected decision
table):

- **`/determinism` UI** — `enumerateA8StateSpace` (read-only query) renders the full 15-cell
  matrix (`A8StateMatrix.tsx`). The same screen also has `runNtimes` (repeat a single-agent
  invocation N times to check output stability) and `runAcrossRestarts` (compare an invocation's
  output across simulated restarts) — both driven by `determinism.ts`'s other procedures.
- **Standalone CI script** — `apps/test-harness/src/scripts/run-regression-checks.ts`, run via
  `npx tsx src/scripts/run-regression-checks.ts` from `apps/test-harness/`, or as the "Run
  regression checks" step in `.github/workflows/regression.yml`. It calls the same
  `enumerateA8Cells()` helper directly, with no Next.js/tRPC/HTTP server involved, and exits
  non-zero on any of: not exactly 15 cells, or any cell failing. This is what the `/ci` dashboard
  is watching (see §7 of the PI Guide).

**Scope limit (as of TH-S27, v1):** this script intentionally does **not** run
`validateSilencePath`'s regression check — that needs a live Prisma-backed synthetic session (a
real `DATABASE_URL` and DB state), which hasn't been verified as reliable in CI yet. A fuller
regression suite (silence-path, canned-mode sampling) is a natural follow-up once the current
DB-free check has proven stable.

## 6. Running a stochastic sampling run

`stochastic.ts` backs the `/sampling` screen:

1. `computeWilsonCI` / `estimateCost` — pure calculators, no DB, useful standalone if you're
   scripting something.
2. `checkBudget` — hits the DB (`ctx.prisma`) to compare an estimated cost against the
   environment's remaining `TestBudget`. This is a hard gate: `runSampling` should not be
   triggered from the UI without a passing budget check first.
3. `runSampling` — the actual sampling mutation. Input requires `n >= 200` (server-enforced, for
   a statistically meaningful Wilson CI), a `targetMetric` (dot-path into the agent output,
   evaluated via `classifySample` — deliberately simple boolean truthiness on the resolved path,
   not numeric-threshold or deep-equality classification; that's an intentional TH-S15 scope
   limit, not a bug), a `threshold`, and the target `environment`.

Running this outside the UI (e.g. from a script) means calling `runSampling` through the tRPC
caller the same way `consent`'s workaround caller does (see §3's note) or through the normal
react-query client if you're inside the app.

## 7. Deploy notes

Deploy specifics (Firebase Hosting web-frameworks approach, the `evia-test-harness` project,
`test-harness.evia.ai` custom domain per ADR-014, and the known gap that no other Next.js app in
this monorepo has an established SSR hosting pipeline to copy from) are documented in the
[README's "Deploy" section](../../apps/test-harness/README.md#deploy) — refer to it rather than
duplicating it here. In short: `firebase experiments:enable webframeworks` must be run once
against the project before the first deploy, and actual deployment requires GCP/Firebase
credentials not available in this environment — it's a manual PI step.

## Scripts reference

| Script | Purpose |
|---|---|
| `src/scripts/seed-harness-access.ts` | Provision a `TestHarnessAccess` row: `npx tsx src/scripts/seed-harness-access.ts <email> <PI\|RATER\|ENGINEER> <environments-csv>`. |
| `src/scripts/seed-corpus.ts` | Seed 20+ synthetic placeholder `CorpusCase` rows (5+ per required type: safety, fidelity, adversarial, persona) for local/sandbox testing. |
| `src/scripts/run-regression-checks.ts` | Standalone, DB-free A8 router regression check — see §5 above. Exit code 0/1 for CI. |

All three are run with `npx tsx <path>` from `apps/test-harness/` — none are wired into
`package.json`'s `scripts` block as of this writing.
