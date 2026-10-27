# OKUVU Test Harness

Internal web application for pipeline testing, deterministic verification, and SME access.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **API Layer:** tRPC v11 + TanStack Query
- **Auth:** NextAuth v4 + Amazon Cognito (therapist pool)
- **Styling:** Tailwind CSS v4
- **Database:** Prisma (same Neon branch as staging)

## Getting Started

1. Copy `.env.example` to `.env` and fill in your values
2. Install dependencies: `pnpm install`
3. Run the dev server: `pnpm dev`
4. Open [http://localhost:3002](http://localhost:3002)

## Architecture

This app mirrors the therapist-portal architecture:
- tRPC routers in `src/server/routers/`
- Auth via NextAuth v4 in `src/lib/auth.ts`
- Prisma client in `src/lib/prisma.ts`

## Test Harness Guides

Role-specific guides live in `docs/test-harness/`:

- [PI Guide](../../docs/test-harness/pi-guide.md) — signing in, environment selection, the
  Dashboard, the Model Config Registry, blinded-results review and κ agreement, unblinding, the
  CI dashboard, the corpus consent panel, and stochastic sampling budget caps.
- [Rater Guide](../../docs/test-harness/rater-guide.md) — signing in (pre-provisioned accounts
  only), the blinded review flow, the scoring rubric, and submitting ratings.
- [Engineer Runbook](../../docs/test-harness/engineer-runbook.md) — the env var table, the
  router/procedure map, adding a new agent to `singleAgent`, running determinism checks and
  stochastic sampling runs, and deploy notes.
- [Running Locally](../../docs/test-harness/running-locally.md) — the verified, step-by-step
  guide to actually starting this app against a real database: schema setup, the RLS app role,
  `.env` config, starting the dev server, and **why it runs on `--webpack` instead of Turbopack**
  (a confirmed upstream Turbopack limitation this app works around — read this before touching
  `next.config.ts`'s webpack config or removing the `--webpack` flag).
- [Ethics Review Prep](../../docs/test-harness/ethics-review-prep.md) — beta-environment
  isolation (Postgres RLS) and data retention policy, for the ethics committee (TH-S31).

See also `docs/adr/010`–`014` for the architectural decisions behind agent isolation, session
state injection, config-drift monitoring, beta retention, and the hosting domain.

## Screens

There is currently no in-app navigation menu — screens are reached by direct URL. The full route
list, grouped roughly by role:

| Route | Screen |
|---|---|
| `/auth` | Sign in |
| `/dashboard` | Env status, recent runs, gate summary, config-drift banner, gate sign-off (PI) |
| `/config` | Model Config Registry — pin model version/temperature, prompt hashes (PI writes) |
| `/agents` | Single-agent invocation (A1/A2/A8/A9-pre/A9-post/A13/A15) against mock context |
| `/faults` | Fault injection console (timeout/api_error at a pipeline boundary) |
| `/determinism` | A8 router state-space matrix, N-times repeat runs, cross-restart runs |
| `/sampling` | Stochastic sampling runs (N≥200), Wilson CI, cost estimate, budget check |
| `/pipeline` | Full-pipeline runs against the real orchestrator, signal override/capture |
| `/conversations` | Multi-turn persona-script conversation driver |
| `/review` | Blinded rater queue and rubric scoring |
| `/review/results` | Cohen's κ inter-rater agreement and unblinding (PI-only) |
| `/corpus` | Corpus case manager, versioning, consent panel |
| `/results` | Trace & Results Viewer — list/detail/compare runs, audit artifact export |
| `/ci` | CI regression dashboard (GitHub Actions gate status, trigger, halt failures) |
| `/beta` | Beta environment S3/S4 capture-verification proxy and retention window display |

## Deploy

Per [ADR-014](../../docs/adr/014-test-harness-hosting-domain.md) this app is served at
`test-harness.evia.ai`. **The hosting target has since changed to Vercel** — the ADR's
Firebase Hosting / Cloud Functions plan was retired with the rest of the Google Cloud
stack in the AWS cutover, and `firebase.json` / `.firebaserc` are gone. Configuration
now lives in `vercel.json` at this app's root; the deploy is Vercel's own build of the
Next.js App Router app (which needs a server runtime for the tRPC and NextAuth route
handlers — a static export is not an option here).

Environment variables for the deployed app (Cognito pool/client, `DATABASE_URL`,
`NEXTAUTH_SECRET`, `AWS_REGION`, `BEDROCK_*`, `SQS_SUMMARY_QUEUE_URL`) are set in the
Vercel project settings. The harness runs outside the beta VPC, so it reaches AWS through
an identity with Bedrock invoke rights and an SQS queue URL it can publish to; the worker
it calls for A13/A15 is only reachable from inside the VPC, so that stage degrades
gracefully when deployed here.

Building and deploying is a manual step today (Vercel builds on push to the connected
branch); there is no CI job for this app beyond the PR checks in
`.github/workflows/ci.yml`.

## Scripts

Run these with `npx tsx <path>` from `apps/test-harness/` — none are currently wired into
`package.json`'s `scripts` block.

| Script | Purpose |
|---|---|
| `src/scripts/seed-harness-access.ts` | Provision a `TestHarnessAccess` row: `npx tsx src/scripts/seed-harness-access.ts <email> <PI\|RATER\|ENGINEER> <environments-csv>`. Required before a new PI/rater/engineer can sign in. |
| `src/scripts/seed-corpus.ts` | Seed 20+ synthetic placeholder `CorpusCase` rows (5+ per required type — safety, fidelity, adversarial, persona) for local/sandbox testing. |
| `src/scripts/run-regression-checks.ts` | Standalone, DB-free A8 router state-space regression check. Exits non-zero on failure — used by `.github/workflows/regression.yml` and drives the `/ci` dashboard. See the [Engineer Runbook](../../docs/test-harness/engineer-runbook.md#5-running-a-determinism-check) for scope limits. |

## Secrets

Secrets (`COGNITO_THERAPIST_CLIENT_SECRET`, `DATABASE_URL`, `NEXTAUTH_SECRET`, and any GitHub
token if ever needed for CI or API access) are set as Vercel project environment variables
(encrypted at rest) for deployed instances, and must never be committed or loaded from a
committed file. `.env` (and `.env.local`) are for local development only, are gitignored, and
must never contain production credentials. AWS access uses an IAM identity/role with
`bedrock:InvokeModel` — never a key pair pasted into this app's config.
