# Running the Test Harness Locally

This doc is the practical, verified "how do I actually run this thing"
guide. Every step here was run for real against a live Neon Postgres
database on 2026-08-20, not just written from reading the code — see
`docs/test-harness/acceptance-verification.md` for the fuller audit this
came out of.

## 1. Prerequisites

- Node 22, pnpm 11.8.0 (`corepack enable && corepack prepare pnpm@11.8.0 --activate` if you don't have it).
- A Postgres `DATABASE_URL`. For local dev this is a personal Neon branch — see `docs/neon-setup.md` for how to get one. **Never point this at a production database.**
- From the repo root: `pnpm install`.

## 2. Apply the schema to your database

```bash
cd packages/prisma
DATABASE_URL="<your-connection-string>" pnpm prisma db push
```

`db push` (not `migrate dev`) is the right command here: this repo's
`packages/prisma/migrations/` history predates a database ever being
available for the test-harness models, so the migration-tracking table on
a fresh branch won't line up with it. `db push` syncs the schema directly
without touching migration history.

If you see `type "vector" does not exist`, your branch needs the pgvector
extension enabled first (a pre-existing requirement, unrelated to the test
harness — it's used by `SessionLog.summary_embedding`):

```bash
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

If `db push` warns about a `Turn(session_id,turn_number,role)` unique
constraint possibly losing data, that's a pre-existing constraint
unrelated to the test-harness models — safe to accept
(`--accept-data-loss`) on a fresh/empty branch; check first if you're not
sure (`SELECT COUNT(*) FROM "Turn"`).

Then generate the Prisma client:

```bash
pnpm prisma generate
```

## 3. (Recommended) Set up a non-bypassing database role

By default your Neon connection string's role (commonly `<db>_owner`) has
the `BYPASSRLS` attribute, which means the Row-Level Security policies
this app installs (`packages/prisma/manual-migrations/001_test_harness_beta_rls.sql`)
provide **no actual protection** if the app connects as that role — see
`docs/test-harness/acceptance-verification.md` and
`docs/test-harness/ethics-review-prep.md` for the full story. For anything
beyond quick local poking-around, create a dedicated role instead:

```sql
CREATE ROLE test_harness_app WITH LOGIN PASSWORD '<pick one>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO test_harness_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO test_harness_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO test_harness_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO test_harness_app;
```

Then apply the RLS migration once (as the admin/owner role, not the new
one — it needs `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY`):

```bash
psql "$DATABASE_URL" -f packages/prisma/manual-migrations/001_test_harness_beta_rls.sql
```

Use `test_harness_app`'s connection string (same host/db, different
user/password) as `DATABASE_URL` in step 4 below.

## 4. Configure `apps/test-harness/.env`

Copy `apps/test-harness/.env.example` to `apps/test-harness/.env` and fill in:

```bash
TEST_HARNESS_ENV="sandbox"
DATABASE_URL="postgresql://test_harness_app:<password>@<host>/<db>?sslmode=require"
GOOGLE_CLIENT_ID="<your GCP OAuth client ID>"
GOOGLE_CLIENT_SECRET="<your GCP OAuth client secret>"
NEXTAUTH_SECRET="<any random string — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">"
NEXTAUTH_URL="http://localhost:3002"
```

There is no local-dev auth bypass — sign-in always goes through real Google
OAuth, checked against the `TestHarnessAccess` table, the same as
production. If you don't have Google OAuth credentials for local dev, ask
whoever manages `evia-dev`'s GCP project for a client ID/secret scoped to
`http://localhost:3002/api/auth/callback/google`. Your email also needs a
row in `TestHarnessAccess` (see step 7) or sign-in will succeed with
Google but then get rejected as unauthorized.

**Never commit this file.** It's gitignored (`apps/test-harness/.env` and
`.env.*` patterns), and the security CI job scans for accidentally
committed secrets.

## 5. Start the dev server

```bash
cd apps/test-harness
pnpm dev
```

Serves at `http://localhost:3002`. **Important:** this project's `dev`/
`build` scripts use `next dev --webpack` / `next build --webpack`, not
Turbopack (Next 16's default). This is deliberate, not a mistake if you
see it in `package.json` — see **Why webpack, not Turbopack** below.

If port 3002 is already in use from a previous run that didn't shut down
cleanly:

```bash
# find and kill whatever's holding the port (Windows)
netstat -ano | grep ":3002" | grep LISTENING
taskkill //F //PID <pid>
```

## 6. Verify it's actually working

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/auth   # expect 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/dashboard  # expect 307 -> /auth (no session yet — correct)
```

Then in a real browser: visit `http://localhost:3002`, sign in with
Google, and you should land on `/dashboard`. From there every screen
listed in `docs/test-harness/engineer-runbook.md`'s route table should be
reachable (no in-app nav menu yet — direct URL only, e.g.
`http://localhost:3002/pipeline`).

## 7. Seed some initial data (optional but recommended)

```bash
cd apps/test-harness
DATABASE_URL="..." npx tsx src/scripts/seed-harness-access.ts your-email@evia.dev PI sandbox,staging,beta
DATABASE_URL="..." npx tsx src/scripts/seed-corpus.ts
```

The first seeds your own email as a PI so real (non-bypass) sign-in
works; the second populates ~24 synthetic corpus cases so `/corpus` and
`/review` aren't empty.

## Why webpack, not Turbopack

`apps/test-harness`'s routers direct-import several `apps/api` modules
(agents, the orchestrator, fallbacks — see TH-S09/S10/S18's design) using
`apps/api`'s own `.js`-suffixed ESM import convention (correct for its
`tsc`-compiled production build). Turbopack — Next 16's default dev/build
bundler — **cannot resolve a `.js` specifier to a sibling `.ts` file**;
this is a confirmed, currently-open upstream limitation
([vercel/next.js#82945](https://github.com/vercel/next.js/issues/82945)),
not a bug in this app. `tsc --noEmit` and `vitest` both resolve this fine
(different resolution machinery), which is why the 127-test suite always
passed even while the app itself couldn't actually start under `next dev`
— nobody had run it for real until this was found.

Classic webpack supports exactly this case via `resolve.extensionAlias`,
which `next.config.ts` configures. If a future Next.js/Turbopack release
fixes #82945, `--webpack` can likely be dropped — try it and see if
`next dev` (Turbopack) still throws `Module not found` errors reaching
into `apps/api`.

Two more one-time fixes live in the same area, both documented inline in
`next.config.ts` and `pnpm-workspace.yaml`:
- `pnpm-workspace.yaml`'s `packageExtensions` teaches pnpm that
  `@google-cloud/aiplatform` needs `protobufjs` (a phantom dependency in
  that package that breaks under pnpm's strict isolation).
- `next.config.ts`'s webpack `externals` config keeps
  `@google-cloud/tasks`/`@google-cloud/aiplatform`/`google-gax` out of the
  bundle server-side (their dynamic JSON config loading doesn't survive
  static bundling — a known category of issue with GCP's Node client
  libraries).

## What won't work without additional setup

- **Real Gemini/Vertex AI calls** (A1/A2/A9/A9-post agent invocation
  producing real, non-canned model output) need
  `VERTEX_AI_PROJECT_ID`/`VERTEX_AI_LOCATION`/`GEMINI_PRO_MODEL`/a real
  service-account key. Without them, `generateContent` fails and every
  agent gracefully degrades to its documented fallback (S2 safety state,
  `A2_DEGRADED_RESPONSE`, etc.) — the turn still completes, it's just not
  a real model response. Set `USE_CANNED_LLM_RESPONSE="true"` in your
  `.env` to make this the *intended* behavior (free, deterministic,
  sandbox-appropriate) instead of an unintended failure.
- **A13/A15 (summary/memory)** need `WORKER_URL` pointing at a running
  `apps/worker` instance, and that endpoint is OIDC-protected — expect
  this to fail gracefully (logged, not thrown) in local dev unless you
  have `apps/worker` running with matching credentials.
- **The `ci` router** (`/ci` page) needs a real `GITHUB_TOKEN`/`GITHUB_REPO`
  — without them it correctly returns a `PRECONDITION_FAILED` error
  rather than crashing.
- **Firebase deploy** (`apps/test-harness/firebase.json`) has never
  actually been deployed anywhere — this doc is about running locally,
  not staging/production.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Every page 500s with a `Module not found` error mentioning `apps/api/src/...` | You're running Turbopack instead of webpack — confirm `package.json`'s `dev` script still has `--webpack`. |
| `EADDRINUSE: address already in use :::3002` on startup | A previous dev server didn't shut down. Find and kill it (see step 5). |
| `P1000: Authentication failed` from Prisma | Stale/rotated `DATABASE_URL` — get a fresh one (see `docs/neon-setup.md`). |
| `Cannot find module '...cloud_tasks_client_config.json'` or similar for a GCP package | You added a new `@google-cloud/*` import somewhere — it likely needs the same `externals` treatment in `next.config.ts` as `@google-cloud/tasks`/`aiplatform`. |
| Signed in but every screen redirects to `/auth` | Your email isn't seeded in `TestHarnessAccess` (step 7) — add it there. |
