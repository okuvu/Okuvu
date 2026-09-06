# Test Harness UI — Implementation Stories

**Source plan:** `docs/TEST_HARNESS_Implementation_Plan.md` (v2026-08-16)
**For:** Evia Engineering Team — AI-assisted execution
**Goal:** 100% completion of the Test Harness Implementation Plan, story by story
**Date:** 2026-08-17

---

## How to Use This Document

Each story below is a **self-contained unit of work** written for AI-assisted execution. Complete stories in dependency order (see the summary table at the end). After each story:

1. Run the verification commands in **Acceptance Criteria**.
2. Commit with a message prefixed with the story ID, e.g. `feat(test-harness): TH-S02 scaffold apps/test-harness`.
3. Do not start a story whose dependencies are not committed.

**Estimate format:** hours of AI-assisted work (AI generating code + human reviewing). A human reviewer should budget ~30% of the estimate on top for review/QA.

---

## 0. Codebase Reality Check (Read Before Any Story)

The implementation plan was written against assumptions. Here is what **actually exists** in the repo today (verified 2026-08-17). AI agents must not invent files that already exist.

| Plan assumption | Reality in repo |
|---|---|
| Next.js 15 | `apps/therapist-portal` uses **Next 16** (`next@^16.2.10`). Use Next 16 for the new app. |
| "Manrope + IBM Plex Mono" typography | Portal actually uses **Inter** + Material Symbols, defined in `apps/therapist-portal/src/app/globals.css` `@theme`. Match the portal's real tokens (Inter); use IBM Plex Mono only inside the Trace Viewer if desired. |
| "NextAuth + Google OAuth (therapist accounts)" | `apps/therapist-portal/src/lib/auth.ts` — NextAuth v4 + GoogleProvider, `signIn` callback checks `prisma.therapist.findUnique({ where: { email } })`. `LOCAL_DEV_BYPASS_AUTH=true` skips. Copy this pattern. |
| tRPC routers live in `apps/therapist-portal/src/server/routers/` | Exists: `_app.ts` aggregates `clients`, `example`, `notes`. `trpc.ts` defines `createTRPCContext`, `publicProcedure`, `protectedProcedure`. tRPC v11. |
| tRPC route wiring | `apps/therapist-portal/src/app/api/trpc/[trpc]/route.ts` + `src/trpc/provider.tsx` (TanStack Query + `httpBatchLink`). Copy pattern. |
| "Import agents directly from apps/api/src/agents" | Agents exist: `a1/agent.ts` (`classifySafety`), `a9/agent.ts` (`classifyGovernance`), `a8-router.ts` (`routeTurn`), `a2/agent.ts` (`handleTurn`, `scoreOnboardingTurn`), `a9-post/agent.ts` (`a9PostReview`), `a12/agent.ts` (`renderText`). **A13 and A15 do NOT exist in apps/api.** |
| "A13 (Summary), A15 (Memory)" | These live in **apps/worker**: `lib/summary.ts` (`generateSessionSummary`) and `lib/memory-extraction.ts` (`updateUserMemory`). A10A = the summary job (per commit E14-S13). The harness must call these over HTTP (`POST /tasks/summary`) or via a shared lib — see TH-S09. |
| Pipeline entry point | `apps/api/src/pipeline/orchestrator.ts` — `processTurn(uid, sessionId, message, perceivedIntensity?)` returns `PipelineResult` with `timing: StageTiming[]`. A1/A9/RAG run in `Promise.allSettled`, then A8 (`routeTurn`), A2 (`handleTurn`), A9-post. **No test hooks exist yet.** |
| Canned LLM mode | `apps/api/src/lib/vertex-ai.ts` `generateContent()` already returns `CANNED_LLM_RESPONSE`/`SAFE_FALLBACK` when `USE_CANNED_LLM_RESPONSE=true`. Reuse — do not reimplement. |
| Data models | `packages/shared-types/index.ts` has `SafetyState`, `GovernanceState`, `RouterDecision`, frames, etc. **No test-harness types yet.** |
| Prisma models | `packages/prisma/schema.prisma`: User, Therapist, ClinicalConfig, SafetyState, SessionLog, Turn, SessionSummary, EngagementProfile, UserMemory, TherapistNote, TherapistClient, SessionLimit, EmergencyContact, MoodLog, GovernanceLog, JournalEntry. **No TestRun/CorpusCase/etc. yet.** |
| Session limits bypass precedent | `apps/api/src/lib/session-handler.ts` has a `uid.startsWith('load-test-vu-')` bypass. Reuse this idea for synthetic test users (`test-user-*`). |
| CI | `.github/workflows/ci.yml` — backend (tsc + vitest), flutter, security gate. **No regression/HALT gate job yet.** |
| Design docs | `docs/design/EVIA_Therapist_Portal_Design.md` (portal) and `docs/design/EVIA_Mobile_Design.md` (mobile, contains the SRS modal for session-close simulation). |
| Story format reference | `docs/planning/evia-to-okuvu-migration-clickup-stories.md` — the format used here. |

**Naming conventions used throughout these stories:**

- Package name: `@evia/test-harness` (keep current `@evia` scope — the `@okuvu` rebrand is a separate in-flight effort, see M6).
- Agents in the pipeline: `A1` (safety), `A9-pre` (governance), `A8` (router), `A2` (therapy), `A9-post` (review), `A13`/`A10A` (summary, worker), `A15` (memory, worker).
- Pipeline order (from `orchestrator.ts`): `A1 → A9-pre → A8 → A2 → A9-post → A13 → A15`.
- Env prefix: `TEST_HARNESS_*` for harness-specific vars.

**Plan inconsistencies resolved in these stories (do not "fix" them back to the plan's prose):**

| Plan says | Resolved to (stories use this) |
|---|---|
| Next.js 15 (§1) | Next 16 — portal reality (`next@^16.2.10`) |
| Manrope + IBM Plex Mono (§5) | Inter + Material Symbols — portal reality; IBM Plex Mono only inside `TraceViewer` |
| §7 Phase 4 "green=running, blue=completed" | blue=RUNNING, green=PASS — plan §5 badge scheme wins |
| §11 "run records capture all 7 metadata fields" | **8 fields** — plan §6 `FrozenTripleMetadata` defines 8 (modelVersion, promptHash, temperature, safetySettings, suiteVersion, inputId, timestamp, rawOutput); every story uses 8 |
| §7 Phase 1 "Configure Firebase Auth" | NextAuth v4 + Google OAuth — plan §1 table + portal reality; no Firebase Auth SDK |
| §1 "Database: same Neon branch, read-only for traces/results" | Single Prisma client on the staging DB for MVP; per-environment client/schema split lands with TH-S31 isolation |

---

## Phase 0 — Decisions & Baseline

### Story TH-S01 — Resolve Open Questions & Record ADRs

| Field | Value |
|---|---|
| **Story ID** | TH-S01 |
| **Estimate** | 2h |
| **Depends on** | None |
| **Blocks** | TH-S09, TH-S10, TH-S19, TH-S31 |

**Description**

Resolve the five open questions in plan §12 and record decisions as ADRs so all later stories implement the same choices. All five decisions below are **final** unless the PI overrides:

1. **Agent isolation seam** → add an optional `testHooks` parameter to `processTurn` in `apps/api/src/pipeline/orchestrator.ts` (`opts?: { testMode?: { injectA1?: SafetyState; injectA9?: GovernanceState; injectRouter?: RouterDecision; injectRetrievedContext?: string } }`). No separate `testOrchestrator` — one code path, existing tests unaffected.
2. **Session state injection** → in-memory context bundle + synthetic Prisma users (`firebase_uid` prefix `test-user-*`, mirroring the `load-test-vu-` bypass in `session-handler.ts`). No Redis namespace.
3. **Staging ↔ prod parity alerts** → defer alerting infra. TH-01 shows a read-only "config drift" warning banner only.
4. **Beta S3/S4 retention** → 90 days default, configurable via `BETA_RETENTION_DAYS` env; document for ethics committee (TH-S31).
5. **Hosting domain** → `test-harness.evia.ai`.

**Tasks / Checklist**

- [ ] Write `docs/adr/010-test-harness-agent-isolation.md` (decision 1)
- [ ] Write `docs/adr/011-test-harness-session-injection.md` (decision 2)
- [ ] Write `docs/adr/012-test-harness-config-drift.md` (decision 3)
- [ ] Write `docs/adr/013-test-harness-beta-retention.md` (decision 4)
- [ ] Write `docs/adr/014-test-harness-hosting-domain.md` (decision 5)
- [ ] Update plan §12 with a "Resolved" column pointing at each ADR

**Acceptance Criteria**

- [ ] All 5 ADRs exist under `docs/adr/` and state the decision + rationale + impact
- [ ] No code changes in this story (docs only)

**AI Coding Notes**

> Follow the format of existing ADRs in `docs/adr/` (e.g. `002-websocket-auth.md`). Read one before writing.

---

## Phase 1 — Foundation

### Story TH-S02 — Scaffold `apps/test-harness`

| Field | Value |
|---|---|
| **Story ID** | TH-S02 |
| **Estimate** | 4h |
| **Depends on** | TH-S01 |
| **Blocks** | TH-S03, TH-S04, TH-S05, TH-S06, TH-S08, TH-S09 |

**Description**

Create the new Next.js App Router app at `apps/test-harness/`, wired into the pnpm workspace, copying the therapist-portal architecture exactly: Next 16, tRPC v11, TanStack Query, Tailwind v4, NextAuth v4, Zod. The app must typecheck standalone and render a placeholder page.

**Files to create**

- `apps/test-harness/package.json` (`@evia/test-harness`, deps mirror `apps/therapist-portal/package.json`)
- `apps/test-harness/tsconfig.json` (mirror portal)
- `apps/test-harness/next.config.ts` (include `transpilePackages: ['@evia/prisma', '@evia/shared-types']`)
- `apps/test-harness/postcss.config.mjs`, `apps/test-harness/tailwind.config.ts` (copy portal)
- `apps/test-harness/src/app/globals.css` (copy portal `@theme` tokens verbatim)
- `apps/test-harness/src/app/layout.tsx` (TRPCProvider + AuthProvider, Inter font link)
- `apps/test-harness/src/app/page.tsx` (placeholder "Test Harness — coming soon")
- `apps/test-harness/src/server/trpc.ts`, `src/trpc/client.ts`, `src/trpc/provider.tsx`, `src/server/routers/_app.ts` (copy portal pattern, empty router initially)
- `apps/test-harness/src/app/api/trpc/[trpc]/route.ts`
- `apps/test-harness/src/lib/prisma.ts` (re-export `@evia/prisma` client — check how portal does it)
- `apps/test-harness/src/lib/env.ts` (zod-validated env: `TEST_HARNESS_ENV`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `LOCAL_DEV_BYPASS_AUTH`)
- `apps/test-harness/.env.example`
- `apps/test-harness/README.md`

**Files to modify**

- `pnpm-workspace.yaml` (add `apps/test-harness` — verify current glob already covers it; add if not)
- `apps/test-harness` must appear in `.github/workflows/ci.yml` typecheck step (add `cd apps/test-harness && pnpm tsc --noEmit`)

**Acceptance Criteria**

- [ ] `pnpm install` succeeds from root
- [ ] `cd apps/test-harness && pnpm tsc --noEmit` passes
- [ ] `pnpm dev` serves the placeholder page at `http://localhost:3001` (or portal's port — keep separate via `-p`)
- [ ] tRPC ping procedure (`example.hello`) works end-to-end with `LOCAL_DEV_BYPASS_AUTH=true`

**AI Coding Notes**

> **Common mistake:** Portal uses `next@^16`, not 15 — copy `^16.2.10`. Do not scaffold with `create-next-app` defaults; copy portal files.
>
> **Common mistake:** `next.config.ts` `transpilePackages` must include both `@evia/prisma` and `@evia/shared-types` or the build fails with module-not-found.
>
> **Common mistake:** Do not copy `apps/api`'s `.js` import suffixes — the Next app is compiled by tsc/swc; use portal-style imports.
>
> **Common mistake:** Check `pnpm-workspace.yaml` actually lists `apps/*` before assuming the new app is picked up.

---

### Story TH-S03 — Test Harness Data Models (shared-types + Prisma)

| Field | Value |
|---|---|
| **Story ID** | TH-S03 |
| **Estimate** | 3h |
| **Depends on** | TH-S02 |
| **Blocks** | TH-S04, TH-S06, TH-S08, TH-S09, TH-S13, TH-S15, TH-S18, TH-S21, TH-S23, TH-S25, TH-S26, TH-S27, TH-S31 |

**Description**

Add the plan §6 types to `packages/shared-types/index.ts` and the corresponding Prisma models to `packages/prisma/schema.prisma`. Keep type names exactly as specified in the plan so later stories and the plan stay in sync.

**Files to modify**

- `packages/shared-types/index.ts` — add: `TestEnvironment`, `FrozenTripleMetadata`, `TestResult`, `AgentDependency`, `TestRun`, `BlindedReviewItem`, `CorpusCase` (exact shapes from plan §6; `FrozenTripleMetadata` has **8** fields — see §0 resolution)
- `packages/shared-types/index.ts` — also add `TestRunStatus`, `CorpusCaseType`, `TestAgentId` (union type `'A1' | 'A2' | 'A8' | 'A9-pre' | 'A9-post' | 'A10A' | 'A13' | 'A15'`), `HarnessRole` (`'PI' | 'RATER' | 'ENGINEER'`), `PipelineSignal` (typed signal bus payload for TH-S18)
- `packages/prisma/schema.prisma` — add models:
  - `ModelConfigPin` (model_version, prompt_hash, temperature, safety_settings, suite_version, environment, pinned_by, created_at) — TH-02
  - `PromptRegistryEntry` (id, agent_id, version, content, content_hash, environment, supersedes_id?, created_at) — TH-02
  - `TestRun` (id, environment, altitude, agent?, status, frozen_triple Json, results Json, activated_agents String[], manually_selected_agents String[], dependency_graph Json, created_at, completed_at?) — immutable, append-only
  - `TestResultRow` (id, run_id, agent_id, input Json, output Json, latency_ms, signals Json, mock_mode, status) — per-agent results
  - `CorpusCase` (id, type, version, input, expected_output?, tags String[], created_at, updated_at, supersedes_id?) — TH-11
  - `BlindedReviewItem` (id, run_id, output, rubric_scores Json, rater_id?, unblinded_at?) — TH-09
  - `ReviewRating` (id, item_id, rater_id, scores Json, created_at, unique(item_id, rater_id)) — TH-09
  - `TestBudget` (id, environment, monthly_cap_inr, spent_inr, reset_month) — TH-05
  - `TestHarnessAccess` (id, email, role HarnessRole, environments String[], created_at) — TH-04 auth restriction
  - `GateSignOff` (id, gate, run_id?, environment, signed_by, decision ('APPROVED'|'REJECTED'), evidence?, signed_at) — **immutable** PI sign-off audit record for TH-01; sign-off inserts here, NEVER updates `TestRun`
  - `BetaConsent` (id, corpus_case_id?, user_ref, scope, consent_granted_at, expires_at?) — DPDP consent record for real-origin beta data (TH-S31)
- Run `pnpm prisma migrate dev --name test_harness_models` in `packages/prisma` (or follow the repo's existing migration workflow — check `docs/prisma-migration-drift.md`)

**Acceptance Criteria**

- [ ] `pnpm tsc --noEmit` passes in `packages/shared-types`
- [ ] Prisma migration applied; `pnpm prisma generate` succeeds
- [ ] `cd apps/api && pnpm tsc --noEmit` still passes (types are additive)

**AI Coding Notes**

> **Common mistake:** `schema.prisma` uses `Json` type for nested objects (FrozenTriple, dependency graph). Do not flatten into columns.
>
> **Common mistake:** Prisma enums must be added to the `enum` section (`SummaryStatus`, `Tier`, etc. are there — add `HarnessRole`, `TestRunStatus`, `CorpusCaseType` alongside).
>
> **Common mistake:** The plan's `TestRun.agent` union includes `A10A` and `A13` — both exist in naming (A10A = worker summary job). Keep both in the union.

---

### Story TH-S04 — TH-00 Auth (Google OAuth, restricted emails)

| Field | Value |
|---|---|
| **Story ID** | TH-S04 |
| **Estimate** | 3h |
| **Depends on** | TH-S02, TH-S03 |
| **Blocks** | TH-S05, TH-S06 |

**Description**

Implement secure login for PI/raters/engineers only. Copy the portal's NextAuth v4 + Google pattern but restrict access via the `TestHarnessAccess` table (email + role + allowed environments) instead of the `Therapist` table. Provide `src/lib/auth.ts`, an `/auth` sign-in page, and an `AuthenticatedShell` guard.

**Files to create**

- `apps/test-harness/src/lib/auth.ts` (NextAuth options; `signIn` callback checks `TestHarnessAccess` by email; attaches `role` + `environments` to session JWT)
- `apps/test-harness/src/lib/auth-provider.tsx` (SessionProvider — copy portal)
- `apps/test-harness/src/app/auth/page.tsx` (sign-in page with Google button, unauthorized/error states)
- `apps/test-harness/src/app/api/auth/[...nextauth]/route.ts`
- `apps/test-harness/src/app/components/AuthenticatedShell.tsx` (server-side redirect to `/auth` when no session; renders children + header slot)

**Files to modify**

- `apps/test-harness/src/app/layout.tsx` (wrap with AuthProvider)
- `.env.example` + `apps/test-harness/.env.example` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `LOCAL_DEV_BYPASS_AUTH`)
- `packages/prisma/schema.prisma` seed script or `apps/test-harness/src/scripts/seed-harness-access.ts` (seed PI + rater emails)

**Acceptance Criteria**

- [ ] Unauthenticated visit to any harness page redirects to `/auth`
- [ ] Non-listed email sees "Unauthorized" and is not given a session
- [ ] Listed email signs in and session carries `role` and `environments`
- [ ] `LOCAL_DEV_BYPASS_AUTH=true` logs in as a mock PI without Google (mirror portal's `bypass@evia.dev` pattern)
- [ ] Seed script inserts the PI email from `.env.example`

**AI Coding Notes**

> **Common mistake:** The portal's `auth()` reads `prisma.therapist` — the harness must read `TestHarnessAccess`. Copy the file but change the model.
>
> **Common mistake:** Keep `LOCAL_DEV_BYPASS_AUTH` gated exactly like the portal (`process.env.LOCAL_DEV_BYPASS_AUTH === 'true'`). CI's security job rejects hardcoded `= true` in source — never hardcode it.
>
> **Common mistake:** `session` callback must copy `role`/`environments` from the token, else the client can't render role-gated UI.

---

### Story TH-S05 — App Shell: Layout, Environment Selector, Design Tokens

| Field | Value |
|---|---|
| **Story ID** | TH-S05 |
| **Estimate** | 3h |
| **Depends on** | TH-S04 |
| **Blocks** | TH-S06, TH-S08, TH-S09, TH-S14, TH-S16, TH-S20, TH-S21, TH-S24, TH-S25, TH-S26, TH-S27 |

**Description**

Build the shared shell: top header with the **environment selector** (Sandbox/Staging/Beta, color-coded), run-status badge components, and a harness-wide React context that holds the selected environment. Reuse portal tokens exactly (copy `globals.css` `@theme`). Also add plan §5 harness-specific components.

**Files to create**

- `apps/test-harness/src/app/components/Header.tsx` (brand, env selector dropdown, user menu/sign out)
- `apps/test-harness/src/app/components/EnvironmentSelector.tsx` (dropdown; sandbox=green, staging=amber, beta=red accents; disabled per user's `environments` claim)
- `apps/test-harness/src/app/components/RunStatusBadge.tsx` (PASS=green, HALT=red, WARNING=amber, RUNNING=blue, ERROR=gray)
- `apps/test-harness/src/app/components/TraceViewer.tsx` (collapsible JSON, IBM Plex Mono, copy-to-clipboard) — used by TH-10/TH-20
- `apps/test-harness/src/app/components/CostEstimatorCard.tsx` (₹ estimate display) — used by TH-16
- `apps/test-harness/src/app/components/ClinicalNoticePanel.tsx` (copy portal's left-border notice panel if it exists; otherwise implement from design doc)
- `apps/test-harness/src/app/components/BadgeChip.tsx`, `DashboardRow.tsx`, `PreviewModal.tsx` (copy portal equivalents)
- `apps/test-harness/src/lib/environment-context.tsx` (React context: `{ environment, setEnvironment, apiEndpoint }`; persists to localStorage; derives per-env API endpoint from env vars)
- `apps/test-harness/src/lib/run-status.ts` (status → color/label mapping shared with badges)

**Files to modify**

- `apps/test-harness/src/app/layout.tsx` (add EnvironmentProvider + Header)
- `.env.example` (per-environment endpoint vars, e.g. `TEST_HARNESS_API_SANDBOX`, `_STAGING`, `_BETA`)

**Acceptance Criteria**

- [ ] Header shows environment selector; switching persists across navigation
- [ ] A user without access to Beta sees Beta disabled with tooltip
- [ ] Badges render all 5 statuses with correct colors
- [ ] `pnpm tsc --noEmit` passes

**AI Coding Notes**

> **Common mistake:** The plan says "Manrope + IBM Plex Mono", but the portal uses **Inter** (see `globals.css`). Follow the portal's real tokens — the design spec (`EVIA_Therapist_Portal_Design.md`) takes precedence over the plan's prose. Use IBM Plex Mono only for `TraceViewer` via a Google Fonts link.
>
> **Common mistake:** Environment context must default to `sandbox` and validate against the session's allowed environments (from TH-S04), else a Beta-blocked user could flip the selector.
>
> **Common mistake:** Don't hardcode environment colors in components — centralize in `run-status.ts`/token classes so the accessibility pass (TH-S28) can add colorblind labels in one place.

---

### Story TH-S06 — TH-01 Dashboard

| Field | Value |
|---|---|
| **Story ID** | TH-S06 |
| **Estimate** | 4h |
| **Depends on** | TH-S03, TH-S04, TH-S05 |
| **Blocks** | None |

**Description**

Build the dashboard at `/` (and `/dashboard`): environment status cards, recent runs list, gate summary, and PI gate sign-off. Reads from a new `dashboard` tRPC router (or reuse `results`/`ci` routers from later stories — implement a thin `dashboard.getOverview` procedure now returning env status + recent runs + gate summary, backed by Prisma `TestRun` and `TestHarnessAccess`).

**Files to create**

- `apps/test-harness/src/server/routers/dashboard.ts` (`getOverview`, `signOffGate` — PI only; inserts an immutable `GateSignOff` row (`gate`, `run_id?`, `environment`, `signed_by`, `decision`, `evidence?`, `signed_at`), NEVER updates `TestRun`)
- `apps/test-harness/src/app/dashboard/page.tsx` (grid: env status cards, recent runs, gate summary)
- `apps/test-harness/src/app/dashboard/_components/EnvStatusCard.tsx`
- `apps/test-harness/src/app/dashboard/_components/RecentRunsTable.tsx`
- `apps/test-harness/src/app/dashboard/_components/GateSummaryCard.tsx` (incl. "config drift" warning banner per TH-S01 decision 3)
- `apps/test-harness/src/app/dashboard/_components/GateSignOff.tsx` (PI-only button)

**Files to modify**

- `apps/test-harness/src/server/routers/_app.ts` (register `dashboard`)

**Acceptance Criteria**

- [ ] Dashboard renders for authenticated users; role-gated sign-off hidden for non-PI
- [ ] Recent runs pull from `TestRun` (empty state handled)
- [ ] Gate summary shows HALT/PASS counts per gate
- [ ] Config-drift banner appears when pinned model config differs from prod config (read-only comparison of latest `ModelConfigPin` vs current env `GEMINI_PRO_MODEL`/temperature)
- [ ] PI sign-off inserts a `GateSignOff` row; a unit test asserts no `TestRun` row is updated by the sign-off path (immutability)

**AI Coding Notes**

> **Common mistake:** Plan §9 says "All runs immutable; PI can sign off gates" — the sign-off must insert into the dedicated `GateSignOff` table (audit log), never update `TestRun` or `GateSignOff` (neither table has update/delete procedures).
>
> **Common mistake:** Reuse `RunStatusBadge` from TH-S05 rather than re-styling status colors.

---

### Story TH-S07 — Firebase Hosting Deploy (test-harness.evia.ai)

| Field | Value |
|---|---|
| **Story ID** | TH-S07 |
| **Estimate** | 2h |
| **Depends on** | TH-S06 |
| **Blocks** | None |

**Description**

Deploy the harness to Firebase Hosting in a dedicated project `evia-test-harness` (per plan §1). This story is mostly config + one-time setup; the actual deploy can be done by the PI when credentials exist.

**Files to create**

- `apps/test-harness/firebase.json` (hosting config, `public: out` or `.next` export — verify against portal's `apps/therapist-portal/firebase.json`)
- `apps/test-harness/.firebaserc` (project `evia-test-harness`)
- `apps/test-harness/README.md` deploy section + secrets provisioning section (Secret Manager for `GOOGLE_CLIENT_SECRET`/`DATABASE_URL`/`GITHUB_TOKEN` — never `.env` files in prod) (or update existing)

**Files to modify**

- `.github/workflows/ci.yml` — add `test-harness` to typecheck list (if not done in TH-S02)

**Acceptance Criteria**

- [ ] `firebase deploy --only hosting` (or documented equivalent) publishes to `test-harness.evia.ai` — verify by the PI once credentials are provided
- [ ] Env vars documented in README for sandbox/staging/beta endpoints
- [ ] Production deploy has `LOCAL_DEV_BYPASS_AUTH` unset (never `true`) and secrets provisioned via the platform's secret store, not `.env` files
- [ ] CORS/headers config allows tRPC batching (if deployed separately from API)

**AI Coding Notes**

> **Common mistake:** Firebase Hosting is static — a Next app needs SSR. Match whatever the portal actually does (check `apps/therapist-portal/firebase.json`; it may use Firebase + Cloud Run/Functions for the server). If the portal uses Cloud Run, note that the harness must too — do not invent a static export unless the portal already does one.
>
> **Common mistake:** Do not commit service-account credentials; CI security job blocks them (see `.github/workflows/ci.yml`).

---

## Phase 2 — Core Harness

### Story TH-S08 — TH-02 Model Config Registry (testConfig router)

| Field | Value |
|---|---|
| **Story ID** | TH-S08 |
| **Estimate** | 5h |
| **Depends on** | TH-S03, TH-S05 |
| **Blocks** | TH-S15, TH-S18 |

**Description**

Implement plan §4 `testConfig` router: `pinModelVersion`, `getPromptRegistry`, `setTemperature`, `getFrozenTripleMetadata`. Wraps `apps/api/src/lib/vertex-ai.ts` config (env `GEMINI_PRO_MODEL`, temperature) with DB-backed pinning/versioning. Hash prompt files under `apps/api/src/prompts/` (e.g. `a2-mvp-v1.0.txt`) with SHA-256 for the frozen-triple `promptHash`.

**Files to create**

- `apps/test-harness/src/server/routers/testConfig.ts` (procedures above, zod input validation, PI-gated writes)
- `apps/test-harness/src/lib/prompt-hash.ts` (SHA-256 of prompt file contents; `crypto` builtin)
- `apps/test-harness/src/lib/frozen-triple.ts` (build `FrozenTripleMetadata` from pin + current prompt hash + suite version)
- `apps/test-harness/src/app/config/page.tsx` + `_components/` (registry UI: current pin, prompt table with version + hash, pin dialog, temperature input)
- `apps/test-harness/src/app/api/config/route.ts` (if direct API calls needed by TraceViewer; optional)

**Files to modify**

- `apps/test-harness/src/server/routers/_app.ts` (register `testConfig`)

**Acceptance Criteria**

- [ ] Pinning a model version persists a `ModelConfigPin` row and appears in UI
- [ ] `getPromptRegistry` lists all prompts with version + SHA-256 hash; editing a prompt file bumps the hash (verified by test)
- [ ] `setTemperature` persists and is read back
- [ ] `getFrozenTripleMetadata` returns all 8 fields from plan §6 (modelVersion, promptHash, temperature, safetySettings, suiteVersion, inputId, timestamp, rawOutput)
- [ ] Unit tests cover hash stability and pin immutability (new pins supersede, old rows retained)

**AI Coding Notes**

> **Common mistake:** `ModelConfigPin` must be append-only (new pin supersedes old, old retained for audit) — this is what makes `TestRun.frozenTriple` reproducible later.
>
> **Common mistake:** Prompt files live in `apps/api/src/prompts/` (e.g. `a2-mvp-v1.0.txt`) and `apps/worker/src/prompts/` — hash both locations; the harness needs a manifest of known prompt paths.
>
> **Common mistake:** The temperature default in `vertex-ai.ts` is `0.7` hardcoded in `generationConfig` — the harness's `setTemperature` must flow through to actual calls (see TH-S10 test hooks), not just be stored.

---

### Story TH-S09 — TH-03 Single Agent Invocation (singleAgent router)

| Field | Value |
|---|---|
| **Story ID** | TH-S09 |
| **Estimate** | 6h |
| **Depends on** | TH-S01, TH-S03, TH-S05 |
| **Blocks** | TH-S11, TH-S13 |

**Description**

Implement plan §4 `singleAgent` router: `invokeAgent`, `mockSessionContext`, `getAgentSchema`. Call each agent (A1, A2, A8, A9-pre, A9-post) in isolation. **A10A/A13 (summary) and A15 (memory) run in apps/worker** — expose them over HTTP by calling `POST {workerUrl}/tasks/summary` (see `apps/worker/src/routes/summary.ts`) or by extracting the worker libs into a shared package. Decide with TH-S01 ADR 1.

**Files to create**

- `apps/test-harness/src/server/routers/singleAgent.ts` (`invokeAgent` with zod schema per agent; `mockSessionContext` builds an in-memory context bundle for synthetic user `test-user-*`; `getAgentSchema` returns the zod input schema for UI form generation)
- `apps/test-harness/src/lib/agent-adapter.ts` (maps agent ID → underlying call: `classifySafety`, `classifyGovernance`, `routeTurn`, `handleTurn`, `a9PostReview`, worker summary/memory HTTP calls)
- `apps/test-harness/src/lib/mock-context.ts` (default mock values for `safetyState`, `governanceState`, `routerDecision`, `retrievedContext`, `carePlan`, `sessionCount`, `turnNumber`)
- `apps/test-harness/src/app/agents/page.tsx` + `_components/` (agent picker, dynamic form from `getAgentSchema`, run button, result panel with latency + signals)
- `apps/test-harness/src/__tests__/singleAgent.test.ts`

**Files to modify**

- `apps/test-harness/src/server/routers/_app.ts` (register `singleAgent`)
- `apps/test-harness/next.config.ts` (if direct-importing `apps/api` agents: add `apps/api` to `transpilePackages` — see AI notes)

**Acceptance Criteria**

- [ ] A1, A2, A8, A9-pre, A9-post callable in isolation with mocked context; results returned with latency
- [ ] A13/A15 callable via worker HTTP path (or documented equivalent), returning summary/memory output
- [ ] `mockSessionContext` never touches Redis; creates/uses `test-user-*` rows only
- [ ] `getAgentSchema` drives a working dynamic form for at least A2
- [ ] Unit tests pass: `cd apps/test-harness && pnpm vitest run` (add vitest if not present)

**AI Coding Notes**

> **Common mistake:** Direct-importing `apps/api/src/agents/*` pulls in `@google-cloud/aiplatform` and Fastify-adjacent libs into the Next bundle. If tsc/build breaks, either (a) add `apps/api` to `transpilePackages`, or (b) fall back to HTTP calls against the running API. TH-S01 ADR 1 says "testHooks in processTurn + direct import" — try it, and document whichever path you land on.
>
> **Common mistake:** `handleTurn` (A2) needs `carePlan`, `sessionNumber`, `turnNumber`, `mode` — the mock context must provide all of them or the call throws. Read `apps/api/src/agents/a2/agent.ts` inputs first.
>
> **Common mistake:** A8 `routeTurn` is synchronous and pure — no LLM call. Do not wrap it in a timeout.

---

### Story TH-S10 — Test Hooks in `orchestrator.ts` (signal override, fault injection, mock mode)

| Field | Value |
|---|---|
| **Story ID** | TH-S10 |
| **Estimate** | 5h |
| **Depends on** | TH-S01 |
| **Blocks** | TH-S11, TH-S18, TH-S19, TH-S20 |

**Description**

Add test-only hooks to `apps/api/src/pipeline/orchestrator.ts` behind an explicit opt-in flag (per TH-S01 decision 1). Extend `processTurn(uid, sessionId, message, perceivedIntensity?, opts?)`:

- `opts.testMode.injectA1/injectA9/injectRouter/injectRetrievedContext` — skip upstream execution, feed canned values (plan §3.5 Mock Mode)
- `opts.testMode.signalOverride` — replace a signal payload at a named boundary (plan §4 `pipeline.overrideSignal`)
- `opts.testMode.captureSignalBus` — record every signal emitted between agents into a returned array (plan §4 `captureSignalBus`)
- `opts.testMode.faults` — inject timeout/error at model-call boundary (plan §4 `faultInjection`)

Keep prod behavior byte-for-byte identical when `opts` is undefined (all existing tests must pass untouched). Add `PipelineSignal` type to shared-types (done in TH-S03).

**Files to modify**

- `apps/api/src/pipeline/orchestrator.ts` (accept `opts`, branch on `testMode` at each boundary: after A1/A9/RAG allSettled, at A8 decision, before/after A2, before A9-post)
- `apps/api/src/pipeline/types.ts` (extend `PipelineResult` with optional `signals?`, `testMode?` metadata)
- `apps/api/src/lib/vertex-ai.ts` (optional: export a `withFaultInjection` wrapper OR rely on env — see AI notes)
- `apps/api/src/__tests__/orchestrator.testMode.test.ts` (new test file)

**Acceptance Criteria**

- [ ] `processTurn` without `opts` behaves identically — full existing suite passes: `cd apps/api && pnpm vitest run`
- [ ] With `injectA1='S4'`, A1 is skipped and A2 receives S4; timing shows A1 skipped
- [ ] `signalOverride` replaces a named signal; downstream agents consume the override
- [ ] `captureSignalBus` returns ordered signal list
- [ ] Fault injection at model-call boundary produces the documented fail-safe behavior (see TH-S11)

**AI Coding Notes**

> **Common mistake:** This is the highest-risk story for regressions. The default path must be unchanged — gate every hook behind `opts?.testMode` and add a test asserting the existing suite passes with `opts` undefined.
>
> **Common mistake:** `Promise.allSettled` already gives you rejection handling for A1/A9 — fault injection can reuse that path (rejected A1 → `S2` fallback currently). Don't duplicate fallback logic.
>
> **Common mistake:** Do not use env vars for faults (e.g. `FORCE_TIMEOUT`) — CI may run with them accidentally. Faults must come through `opts` only.

---

### Story TH-S11 — TH-06 Fault Injection Console

| Field | Value |
|---|---|
| **Story ID** | TH-S11 |
| **Estimate** | 4h |
| **Depends on** | TH-S09, TH-S10 |
| **Blocks** | None |

**Description**

Implement plan §4 `faultInjection` router + TH-06 UI. Procedures: `injectModelFailure`, `injectSignalFailure`, `verifyFailSafe`. The console lets a user pick a boundary (model call for A1/A2/A9/A9-post, or a signal between agents), pick fault type (timeout, 5xx, malformed JSON, signal drop), run a turn, and **verify fail-safe assertions**: (1) A1 failure → S2 fallback used; (2) A2 failure → `A2_DEGRADED_RESPONSE` returned; (3) A9-post failure at S2 → safe fallback + `governanceLog` BLOCKED record (see `orchestrator.ts` lines ~120-150).

**Files to create**

- `apps/test-harness/src/server/routers/faultInjection.ts` (`injectModelFailure`, `injectSignalFailure`, `verifyFailSafe` — wraps `processTurn` with `testMode.faults`; `verifyFailSafe` returns pass/fail per assertion)
- `apps/test-harness/src/app/faults/page.tsx` + `_components/` (boundary picker, fault type picker, run + assertion result panel)
- `apps/test-harness/src/__tests__/faultInjection.test.ts`

**Files to modify**

- `apps/test-harness/src/server/routers/_app.ts` (register `faultInjection`)

**Acceptance Criteria**

- [ ] All 3 fail-safe assertions from plan §11 verifiable in UI with PASS/FAIL
- [ ] Fault run creates a `TestRun` with status `warning`/`error` and the fault config in `dependencyGraph`/metadata
- [ ] Normal (non-fault) runs unaffected

**AI Coding Notes**

> **Common mistake:** Assertion 3 requires reading `GovernanceLog` after the run — the orchestrator already writes `prisma.governanceLog` with `gate: 'A9-POST'`. Query it in `verifyFailSafe` rather than re-implementing the check.
>
> **Common mistake:** `A2_DEGRADED_RESPONSE` lives in `apps/api/src/pipeline/fallbacks.ts` — import/duplicate its value in tests carefully (it is also exported via `getSafeFallback`).

---

### Story TH-S12 — Unit Tests for New tRPC Procedures

| Field | Value |
|---|---|
| **Story ID** | TH-S12 |
| **Estimate** | 2h |
| **Depends on** | TH-S08, TH-S09, TH-S11 |
| **Blocks** | None |

**Description**

Add vitest coverage for the tRPC routers created so far (`testConfig`, `singleAgent`, `faultInjection`), mocking Prisma and the agent adapters. Follow `apps/api/src/__tests__/*.test.ts` style (vi.mock patterns).

**Files to create**

- `apps/test-harness/src/__tests__/testConfig.test.ts`
- `apps/test-harness/src/__tests__/singleAgent.test.ts` (extend TH-S09's)
- `apps/test-harness/src/__tests__/faultInjection.test.ts` (extend TH-S11's)
- `apps/test-harness/vitest.config.ts` (if not added earlier)

**Files to modify**

- `apps/test-harness/package.json` (add `vitest` devDep + `test` script, if not already present)

**Acceptance Criteria**

- [ ] `cd apps/test-harness && pnpm vitest run` passes with ≥80% coverage on the three routers (run `pnpm vitest run --coverage` if configured)
- [ ] Tests mock `@evia/prisma` and never touch a real DB

**AI Coding Notes**

> **Common mistake:** tRPC procedures with `protectedProcedure` throw `UNAUTHORIZED` without a session — tests must inject a fake session (see `createTRPCContext` in the portal's `trpc.ts`).
>
> **Common mistake:** Check `apps/api/package.json` for the exact vitest config pattern and mirror it (`vitest@?`, `coverage` provider) instead of guessing.

---

## Phase 3 — Determinism & Sampling

### Story TH-S13 — Determinism Router (determinism)

| Field | Value |
|---|---|
| **Story ID** | TH-S13 |
| **Estimate** | 5h |
| **Depends on** | TH-S09, TH-S10 |
| **Blocks** | TH-S14 |

**Description**

Implement plan §4 `determinism` router: `runNtimes`, `runAcrossRestarts`, `enumerateA8StateSpace`.

- `runNtimes(agent, input, n)` — run agent N times, return per-run output + hash + diff summary (exact match count).
- `runAcrossRestarts` — simulate process restart by clearing in-memory caches (`retrieved-context-cache`, `tool-result-store`), re-running, and comparing. Verify restart-safe state lives in Prisma, not memory.
- `enumerateA8StateSpace` — the **15 A8 cells**: `safety_state` (S0–S4) × `governance_state` (Active/Restricted/Blocked) = 15 combinations; call `routeTurn` for each with fixed `session_count`/`turn_count`; return decision + mode per cell and assert the expected mapping (crisis for S4, grounding-only etc. — read `apps/api/src/agents/a8-router.ts` to derive expected values).

**Files to create**

- `apps/test-harness/src/server/routers/determinism.ts`
- `apps/test-harness/src/lib/a8-state-space.ts` (15-cell table generator + expected-output map)
- `apps/test-harness/src/__tests__/determinism.test.ts` (assert 15 cells, S4→crisis)

**Files to modify**

- `apps/test-harness/src/server/routers/_app.ts` (register `determinism`)

**Acceptance Criteria**

- [ ] `enumerateA8StateSpace` returns exactly 15 rows with a PASS/FAIL vs expected map; S4 always routes to crisis
- [ ] `runNtimes` with n=5 reports exact-match count and per-run hashes
- [ ] `runAcrossRestarts` clears caches between runs and reports whether output changed

**AI Coding Notes**

> **Common mistake:** 15 cells = 5 safety × 3 governance. Do not add session/turn dimensions — the plan defines 15.
>
> **Common mistake:** `routeTurn` may be deterministic by design (no LLM) — read `a8-router.ts` to get the real decision table before writing the expected map; don't invent the mapping.

---

### Story TH-S14 — TH-04 Determinism Harness UI

| Field | Value |
|---|---|
| **Story ID** | TH-S14 |
| **Estimate** | 4h |
| **Depends on** | TH-S05, TH-S13 |
| **Blocks** | None |

**Description**

Build TH-04 screen: N-run panel (agent, input, N, run button, results table with per-run hash + diff), restart panel (run → clear caches → run again, side-by-side diff), A8 state-space matrix view (15 cells, green/red per PASS/FAIL).

**Files to create**

- `apps/test-harness/src/app/determinism/page.tsx` + `_components/` (NRunPanel, RestartPanel, A8StateMatrix, RunDiffView)
- Reuse `TraceViewer` from TH-S05 for per-run JSON

**Acceptance Criteria**

- [ ] N-run executes `determinism.runNtimes` and renders per-run output/hash
- [ ] A8 matrix renders 15 cells with PASS/FAIL coloring from server response
- [ ] Restart panel demonstrates a run, cache clear, rerun, and diff

**AI Coding Notes**

> **Common mistake:** N-run of A2 hits the real LLM — use `USE_CANNED_LLM_RESPONSE=true` in sandbox by default (TH-S17 formalizes this) to keep runs free and fast.
>
> **Common mistake:** Keep run data server-side; the UI should only render the returned JSON — don't re-run agents client-side.

---

### Story TH-S15 — Stochastic Router + Wilson CI (stochastic)

| Field | Value |
|---|---|
| **Story ID** | TH-S15 |
| **Estimate** | 5h |
| **Depends on** | TH-S08, TH-S09, TH-S10 |
| **Blocks** | TH-S16 |

**Description**

Implement plan §4 `stochastic` router: `runSampling`, `computeWilsonCI`, `estimateCost`, `checkBudget`.

- `computeWilsonCI(successes, n, z=1.96)` — implement the Wilson score interval (lower/upper bound). Unit-test against known values (e.g. n=200, k=190 → known bounds).
- `runSampling(agent, input, n, targetMetric)` — run n≥200 samples (orchestrated via `processTurn`/agent adapter), classify each sample pass/fail against `targetMetric`, compute Wilson CI, gate on **lower bound ≥ threshold** (plan §11).
- `estimateCost` — token estimate per sample × Vertex pricing. **Static price table fallback** (`packages/.../pricing.ts`) with optional Vertex AI pricing API when configured.
- `checkBudget` — reads `TestBudget` (monthly cap in ₹), blocks when `spent + est > cap`.

**Files to create**

- `apps/test-harness/src/server/routers/stochastic.ts`
- `apps/test-harness/src/lib/wilson.ts` (pure function)
- `apps/test-harness/src/lib/pricing.ts` (static ₹/1K-token table for gemini models + optional live fetch)
- `apps/test-harness/src/__tests__/wilson.test.ts`, `apps/test-harness/src/__tests__/stochastic.test.ts`

**Files to modify**

- `apps/test-harness/src/server/routers/_app.ts` (register `stochastic`)

**Acceptance Criteria**

- [ ] Wilson CI unit tests pass against published reference values
- [ ] `runSampling` completes N=200 in <30 min when using canned responses (acceptance §11) and returns CI + gate decision
- [ ] `estimateCost` returns ₹ with static table; `checkBudget` blocks when over cap
- [ ] Sampling run persists as `TestRun` with `results` array (status per sample)

**AI Coding Notes**

> **Common mistake:** Wilson CI is a single formula — do not approximate with normal approximation. Reference: `(p̂ + z²/2n ± z·√(p̂(1−p̂)/n + z²/4n²)) / (1 + z²/n)`.
>
> **Common mistake:** N=200 real LLM calls cost money — always pair with `checkBudget` and default sandbox to canned mode (TH-S17).
>
> **Common mistake:** Sampling must use a **fresh synthetic user + session per sample** (or reset context) or samples are not independent — reuse `mockSessionContext` from TH-S09.

---

### Story TH-S16 — TH-05 Stochastic Sampling UI

| Field | Value |
|---|---|
| **Story ID** | TH-S16 |
| **Estimate** | 5h |
| **Depends on** | TH-S05, TH-S15 |
| **Blocks** | None |

**Description**

Build TH-05 screen: sampling config (agent, input, N≥200, target metric/threshold, budget cap), **Cost Estimator Card** (₹ before running — plan §5), progress bar with RUNNING badge, results panel with Wilson CI + gate verdict, budget usage indicator.

**Files to create**

- `apps/test-harness/src/app/sampling/page.tsx` + `_components/` (SamplingConfigForm, CostEstimatorCard wiring, SamplingProgress, ResultsPanel with CI display)
- `apps/test-harness/src/app/components/CostEstimatorCard.tsx` may already exist from TH-S05 — wire it here

**Acceptance Criteria**

- [ ] Cost estimator shows ₹ estimate before run (from `stochastic.estimateCost`) and is disabled when over budget
- [ ] N≥200 validation enforced client + server side
- [ ] Results show Wilson CI bounds, gate verdict, and link to the stored `TestRun`

**AI Coding Notes**

> **Common mistake:** Long-running tRPC calls can time out client-side — implement as a background job/polling pattern (start run → return `runId` → poll `results.getRun`), or use a streaming mechanism the portal already supports. Do not block the HTTP request for 30 min.
>
> **Common mistake:** Budget cap must be enforced server-side in `runSampling`, not just hidden in UI.

---

### Story TH-S17 — Canned Response Mode + Vertex Pricing Integration

| Field | Value |
|---|---|
| **Story ID** | TH-S17 |
| **Estimate** | 3h |
| **Depends on** | TH-S15 |
| **Blocks** | TH-S20, TH-S21 |

**Description**

Make free sandbox runs a first-class feature: when environment = sandbox, the harness sets `USE_CANNED_LLM_RESPONSE=true` (per-call override, not global env mutation) so determinism/sampling runs cost ₹0 (plan Phase 3 "canned response mode for free sandbox runs"). Wire pricing: static ₹ table is default; attempt Vertex AI pricing API when `VERTEX_AI_PRICE_API_URL`/creds configured, falling back gracefully.

**Files to create**

- `apps/test-harness/src/lib/canned-mode.ts` (per-request flag plumbing — how to pass "use canned" into `generateContent` without env mutation; see AI notes)
- `apps/test-harness/src/lib/pricing-live.ts` (optional Vertex pricing fetch with fallback to static table)
- `apps/test-harness/src/__tests__/canned-mode.test.ts`

**Files to modify**

- `apps/api/src/lib/vertex-ai.ts` (optional: accept `useCanned?: boolean` in `generateContent` params, defaulting to env — keeps prod unchanged)
- `apps/test-harness/.env.example` (`VERTEX_AI_PRICE_API_URL`, etc.)

**Acceptance Criteria**

- [ ] Sandbox runs complete with `fallbackUsed: true` and zero cost; no env mutation
- [ ] Pricing returns static ₹ values when live API unavailable
- [ ] Existing `vertex-ai.test.ts` still passes (`cd apps/api && pnpm vitest run`)

**AI Coding Notes**

> **Common mistake:** Mutating `process.env.USE_CANNED_LLM_RESPONSE` globally is racy in a server process — prefer a `useCanned` param threaded through `generateContent` (defaults to env value), or pass via `testMode` from TH-S10.
>
> **Common mistake:** `USE_CANNED_LLM_RESPONSE` currently returns `fallbackUsed: true` — the harness UI must label these runs "canned" so results aren't mistaken for real model behavior.

---

## Phase 4 — Pipeline & Conversations

### Story TH-S18 — Pipeline Router (pipeline)

| Field | Value |
|---|---|
| **Story ID** | TH-S18 |
| **Estimate** | 5h |
| **Depends on** | TH-S03, TH-S08, TH-S10 |
| **Blocks** | TH-S20 |

**Description**

Implement plan §4 `pipeline` router: `runFullPipeline`, `overrideSignal`, `captureSignalBus`, `validateSilencePath`.

- `runFullPipeline(message, config)` — runs the full chain A1→A9→A8→A2→A9-post→(A13 via worker)→(A15 via worker) via `processTurn` with `testMode.captureSignalBus`; returns per-agent input→output→latency→signals (feeds the TH-20 trace panel).
- `overrideSignal(boundary, payload)` — wraps `processTurn` with `testMode.signalOverride`.
- `captureSignalBus(runId)` — returns the recorded signal list from the stored `TestRun`.
- `validateSilencePath` — asserts that when the router decides `crisis`, no A2 output is emitted (silence path, see `orchestrator.ts` `if (decision.agent === 'crisis') return { type: 'crisis' }`). Return PASS/FAIL.

**Files to create**

- `apps/test-harness/src/server/routers/pipeline.ts`
- `apps/test-harness/src/lib/pipeline-runner.ts` (orchestrates the chain incl. worker HTTP calls for A13/A15)
- `apps/test-harness/src/__tests__/pipeline.test.ts` (incl. silence path test)

**Files to modify**

- `apps/test-harness/src/server/routers/_app.ts` (register `pipeline`)

**Acceptance Criteria**

- [ ] Full pipeline run persists a `TestRun` with `activatedAgents`, `manuallySelectedAgents`, `dependencyGraph` populated
- [ ] `captureSignalBus` returns ordered signals from the run
- [ ] `validateSilencePath` passes for crisis input, fails when A2 output exists
- [ ] A13/A15 steps run via worker HTTP (or documented adapter)

**AI Coding Notes**

> **Common mistake:** `processTurn` returns a `PipelineResult` — its `timing` array already contains per-stage latency (A1, A9_pre, A8_router, A2_response, A9_post). Map that to the trace panel; don't re-time agents.
>
> **Common mistake:** Silence path: a crisis decision returns `{ type: 'crisis' }` and **no turn rows are written**. Verify against that, not against empty text.

---

### Story TH-S19 — Dependency-Aware Agent Toggle Engine

| Field | Value |
|---|---|
| **Story ID** | TH-S19 |
| **Estimate** | 5h |
| **Depends on** | TH-S10 |
| **Blocks** | TH-S20 |

**Description**

Implement the plan §3.5 engine as a pure, testable module (UI in TH-S20). Hardcode the dependency graph (plan §3.5 table):

```
A9-pre → [A1]
A8     → [A1, A9-pre]
A2     → [A1, A9-pre, A8]
A9-post→ [A2]
A13    → [A2]
A15    → [A2, A13]
```

Functions:

- `computeActivation(toggled: AgentId) → { active: AgentId[]; autoActivated: Map<AgentId, AgentId[]>; explanation: string }` — transitive closure of upstream deps; explanation string like *"Activated A1, A9-pre, A8 — A2 requires safety classification (A1), governance check (A9-pre), and routing decision (A8)"*
- `tryDisable(agent, active) → { allowed: boolean; blockedBy?: string; explanation: string }` — block with *"Cannot disable A1 — A2 and A8 require safety classification"*
- `mockModeFor(agent) → { requiredInputs: ('safetyState'|'governanceState'|'routerDecision'|'retrievedContext')[] }` — which inputs to mock for a downstream-only run (plan §3.5 Mock Mode)

**Files to create**

- `apps/test-harness/src/lib/dependency-graph.ts` (graph + constants + explanation strings)
- `apps/test-harness/src/__tests__/dependency-graph.test.ts` (cover: toggle A2 → A1+A9-pre+A8 auto; disable A1 blocked while A2 active; disable A15 allowed; mock mode inputs)

**Acceptance Criteria**

- [ ] All toggle/disable/mock-mode flows from plan §13 pass unit tests (transitive closure, block, explanation text)
- [ ] Mock-mode input list per agent matches plan §3.5

**AI Coding Notes**

> **Common mistake:** Explanations must be generated from the graph, not hardcoded per-agent strings — the toast text in plan §13 is an example, not a literal for every path.
>
> **Common mistake:** `manuallySelectedAgents` vs `activatedAgents` (plan §6) — the engine must return both sets separately for `TestRun` persistence.

---

### Story TH-S20 — TH-07 Pipeline Runner UI (visual pipeline + toggles)

| Field | Value |
|---|---|
| **Story ID** | TH-S20 |
| **Estimate** | 6h |
| **Depends on** | TH-S05, TH-S17, TH-S18, TH-S19 |
| **Blocks** | None |

**Description**

Build TH-07: visual pipeline diagram (A1→A9-pre→A8→A2→A9-post→A13→A15) with **dependency-aware toggles** (plan §13 UX flows):

- Toggle ON → auto-activation toast/banner (from TH-S19 explanation) + diagram highlights teal
- Toggle OFF → block with lock icon + tooltip when another active agent depends on it
- Visual states per plan §3.5 table: Selected (solid teal), Auto (teal + link icon, label "Auto (required by A2)"), Blocked (lock icon), Downstream inactive (grayed, "Enable A1 first" hover)
- **Mock Mode toggle** → shows mock input panels (`safetyState`, `governanceState`, `routerDecision`, `retrievedContext`), banner "⚠️ Running in Mock Mode — upstream agents bypassed", diagram shows SKIPPED for bypassed agents
- Per-agent expandable trace panel: input → output → latency → signals (from `pipeline.runFullPipeline` / `captureSignalBus`)
- Run status colors: green=running? (plan says green=running, blue=completed, gray=skipped — reconcile with TH-S05 RunStatusBadge: use blue=RUNNING per plan §5, flag discrepancy in PR)

**Files to create**

- `apps/test-harness/src/app/pipeline/page.tsx`
- `apps/test-harness/src/app/pipeline/_components/PipelineDiagram.tsx` (nodes + edges, status coloring)
- `apps/test-harness/src/app/pipeline/_components/AgentToggle.tsx` (states + tooltips)
- `apps/test-harness/src/app/pipeline/_components/MockModePanel.tsx`
- `apps/test-harness/src/app/pipeline/_components/AgentTracePanel.tsx` (uses TraceViewer)

**Acceptance Criteria**

- [ ] Toggling A2 auto-enables A1/A9-pre/A8 with the plan §13 toast text
- [ ] Disabling A1 while A2 active is blocked with lock icon + tooltip
- [ ] Mock mode runs A2 with injected inputs; diagram shows A1/A9-pre/A8 SKIPPED
- [ ] Trace panel shows per-agent input/output/latency/signals for a real run
- [ ] Run persists `TestRun` with correct `activatedAgents`/`manuallySelectedAgents`/`dependencyGraph`

**AI Coding Notes**

> **Common mistake:** The plan is inconsistent on RUNNING color (plan §5 says blue=RUNNING; plan §7 Phase 4 says green=running). Use plan §5's official badge scheme (blue=RUNNING, green=PASS) in `RunStatusBadge` and note the §7 line as a typo in the PR.
>
> **Common mistake:** All toggle logic lives in TH-S19 (pure functions) — the UI must not re-implement dependency rules or the unit tests don't cover the real behavior.
>
> **Common mistake:** The pipeline diagram should derive layout from the shared `dependency-graph.ts` order constant, not a hand-drawn SVG.

---

### Story TH-S21 — TH-08 Conversation Driver (conversation router)

| Field | Value |
|---|---|
| **Story ID** | TH-S21 |
| **Estimate** | 5h |
| **Depends on** | TH-S03, TH-S05, TH-S10, TH-S17 |
| **Blocks** | None |

**Description**

Implement plan §4 `conversation` router + TH-08 screen: `runPersonaScript`, `getPerTurnTrace`, `exportTrace`. A persona script is an ordered list of user messages (e.g. anxious persona: 5 messages); each turn runs through `processTurn` with a single persistent synthetic session; per-turn trace (inputs, outputs, signals, timings) is stored; export produces the clinician-review JSON/CSV format.

**Files to create**

- `apps/test-harness/src/server/routers/conversation.ts`
- `apps/test-harness/src/lib/persona-scripts.ts` (built-in scripts defined inline: anxious, crisis-escalating, fidelity, adversarial — TH-S26 can later seed additional scripts from corpus `persona` cases)
- `apps/test-harness/src/lib/trace-export.ts` (per-turn trace → clinician review format JSON/CSV)
- `apps/test-harness/src/app/conversations/page.tsx` + `_components/` (script picker, turn-by-turn stepper, trace table, export button)
- `apps/test-harness/src/__tests__/trace-export.test.ts`

**Files to modify**

- `apps/test-harness/src/server/routers/_app.ts` (register `conversation`)

**Acceptance Criteria**

- [ ] Scripted multi-turn runs complete against one synthetic session; each turn's trace recorded
- [ ] Export matches clinician review format (per plan §11: "Per-turn trace export matches clinician review format") — decide + document the exact JSON schema in `trace-export.ts`
- [ ] Crisis-escalating script ends with crisis routing (silence path, no A2 output)

**AI Coding Notes**

> **Common mistake:** `processTurn` increments `turn_count` via `session.js` — a synthetic session must exist in Prisma (`SessionLog` + `Turn` rows) or `incrementTurnCount` fails. Use `mockSessionContext` (TH-S09) to set it up.
>
> **Common mistake:** Keep export as pure data transformation (no DB reads inside) so `trace-export.test.ts` is fast.

---

### Story TH-S22 — SRS Modal / Session-Close Simulation

| Field | Value |
|---|---|
| **Story ID** | TH-S22 |
| **Estimate** | 2h |
| **Depends on** | TH-S21 |
| **Blocks** | None |

**Description**

Reuse the mobile design's SRS (Suicide Risk Screening / session-close) modal for simulating session close from the harness (plan Phase 4: "SRS modal reuse from mobile design for session close simulation"). When a conversation finishes, offer "Simulate session close" → calls `apps/api/src/lib/session-close.ts` flow (`closeSessionAndEnqueueSummary`-equivalent) so A13/A15 run on the real session.

**Files to create**

- `apps/test-harness/src/app/components/SrsSessionCloseModal.tsx` (modeled on `apps/mobile/lib/...` SRS modal — locate it via `docs/design/EVIA_Mobile_Design.md`; adapt to web)
- `apps/test-harness/src/server/routers/conversation.ts` — add `simulateSessionClose` procedure (or extend `pipeline` router)

**Acceptance Criteria**

- [ ] Closing a scripted session triggers summary + memory extraction (A13/A15) against the synthetic session
- [ ] `SessionSummary` row appears for the synthetic session

**AI Coding Notes**

> **Common mistake:** Locate the SRS modal in the Flutter app first (`apps/mobile/lib/`) — reuse its copy/rubric, not the web plan's prose. If not found, implement per `docs/design/EVIA_Mobile_Design.md` and note the source.
>
> **Common mistake:** `session-close.ts` enqueues a Cloud Task to the worker; in local dev it calls the worker directly via `workerUrl` (see `summary-enqueue.ts`) — configure `WORKER_URL`/`workerUrl` env for local testing.

---

## Phase 5 — Review & Storage

### Story TH-S23 — Review Router (review) + Cohen's κ

| Field | Value |
|---|---|
| **Story ID** | TH-S23 |
| **Estimate** | 4h |
| **Depends on** | TH-S03 |
| **Blocks** | TH-S24 |

**Description**

Implement plan §4 `review` router: `getBlindedItems`, `submitRating`, `computeKappa`, `unblindResults`. Blinding is server-side (plan §8): `getBlindedItems` returns outputs with **all metadata stripped** (no runId/agentId/model info) — item IDs are opaque. `computeKappa` implements Cohen's κ for two raters on the same item set (rubric score → category agreement).

**Files to create**

- `apps/test-harness/src/server/routers/review.ts`
- `apps/test-harness/src/lib/kappa.ts` (Cohen's κ, pure function)
- `apps/test-harness/src/__tests__/kappa.test.ts` (verify κ=1.0 for identical raters, ~0 for random, and known reference values)
- `apps/test-harness/src/__tests__/review.test.ts` (blinding: response contains no runId/agent metadata)

**Files to modify**

- `apps/test-harness/src/server/routers/_app.ts` (register `review`)

**Acceptance Criteria**

- [ ] `getBlindedItems` response schema contains no identifiable metadata (assert in test)
- [ ] `computeKappa` passes reference-value tests; κ ≥ 0.8 achievable on a seeded agreeing pair (plan §11)
- [ ] `unblindResults` is PI-only and records an audit entry

**AI Coding Notes**

> **Common mistake:** Blinding must strip `runId` too — reviewers must not correlate items by ID order. Opaque random item IDs + server-side mapping table.
>
> **Common mistake:** Cohen's κ formula: `κ = (p_o − p_e)/(1 − p_e)` where p_e sums over categories of `(row_total/n)·(col_total/n)`. Watch the two-rater category-matrix edge cases (a category only one rater used).

---

### Story TH-S24 — TH-09 Blinded Review Tool UI

| Field | Value |
|---|---|
| **Story ID** | TH-S24 |
| **Estimate** | 5h |
| **Depends on** | TH-S05, TH-S23 |
| **Blocks** | None |

**Description**

Build TH-09: rater queue with randomised presentation (item order shuffled server-side per rater — plan §11), rubric scoring form, progress, and a PI-only results view with κ computed across raters.

**Files to create**

- `apps/test-harness/src/app/review/page.tsx` + `_components/` (ReviewQueue, RubricForm, RaterProgress, KappaResults)
- `apps/test-harness/src/app/review/results/page.tsx` (PI-only)

**Acceptance Criteria**

- [ ] Each rater sees items in a different (server-randomised) order
- [ ] Ratings persist per rater (`ReviewRating`, unique item+rater)
- [ ] κ result view renders once ≥2 raters have rated the same items

**AI Coding Notes**

> **Common mistake:** Randomisation must come from the server response, not client-side shuffle (client shuffle leaks item identity across refresh).
>
> **Common mistake:** Rater identity comes from the session (TH-S04 role `RATER`) — do not ask for a name in the UI.

---

### Story TH-S25 — TH-10 Trace & Results Viewer (results router)

| Field | Value |
|---|---|
| **Story ID** | TH-S25 |
| **Estimate** | 6h |
| **Depends on** | TH-S03, TH-S05, TH-S18 |
| **Blocks** | None |

**Description**

Implement plan §4 `results` router: `archiveRun`, `getRun`, `compareRuns`, `getAuditArtifact`. All `TestRun` rows are immutable (append-only; `archiveRun` marks archived, never deletes). `compareRuns` diffs two runs' frozen triples + per-agent outputs (side-by-side or unified diff). `getAuditArtifact` produces the frozen-triple metadata + dependency graph + signals JSON for a run.

**Files to create**

- `apps/test-harness/src/server/routers/results.ts`
- `apps/test-harness/src/lib/run-diff.ts` (pure diff of two runs — text diff for outputs, structured diff for signals)
- `apps/test-harness/src/app/results/page.tsx` + `_components/` (run list with frozen-triple metadata, run detail with per-turn observability, compare picker + diff view)
- `apps/test-harness/src/__tests__/run-diff.test.ts`

**Files to modify**

- `apps/test-harness/src/server/routers/_app.ts` (register `results`)

**Acceptance Criteria**

- [ ] Run detail reconstructs per-turn trace from stored data (plan §11 observability)
- [ ] `compareRuns` shows frozen-triple diff + output diff
- [ ] Audit artifact JSON contains all 8 frozen-triple fields + signals + dependencyGraph
- [ ] No procedure can mutate an existing `TestRun` (verify by attempting an update in a test)

**AI Coding Notes**

> **Common mistake:** "Append-only immutable store" means no `prisma.testRun.update` anywhere — enforce via schema convention and a test that calls the router's update path (should not exist).
>
> **Common mistake:** Diff of JSON signals should recurse — implement `run-diff.ts` as a small structured diff (or reuse a lib already in the repo; check `apps/therapist-portal` deps before adding one).

---

### Story TH-S26 — TH-11 Corpus Manager (corpus router)

| Field | Value |
|---|---|
| **Story ID** | TH-S26 |
| **Estimate** | 5h |
| **Depends on** | TH-S03, TH-S05 |
| **Blocks** | None |

**Description**

Implement plan §4 `corpus` router: `listCases`, `createCase`, `versionCase`, `exportPairedComparison`. Git-style versioning: editing a case creates a new version row (`supersedes_id`), old versions retained + diffable. `exportPairedComparison` exports case pairs (old vs new version outputs) for McNemar testing (plan §11). Enforce "sandbox/staging = synthetic only" (plan §9): mark cases with a `data_origin` (`synthetic`/`paraphrased`/`real`) and block real-origin cases outside beta.

**Files to create**

- `apps/test-harness/src/server/routers/corpus.ts`
- `apps/test-harness/src/lib/corpus-versioning.ts` (version/diff helpers)
- `apps/test-harness/src/lib/paired-export.ts` (McNemar pair CSV/JSON)
- `apps/test-harness/src/app/corpus/page.tsx` + `_components/` (case list, editor with version history + diff, tag filter, paired export)
- `apps/test-harness/src/__tests__/corpus-versioning.test.ts`

**Files to modify**

- `apps/test-harness/src/server/routers/_app.ts` (register `corpus`)
- `packages/prisma/schema.prisma` — add `data_origin` enum + `supersedes_id` if not in TH-S03

**Acceptance Criteria**

- [ ] Editing a case creates a new version; history + diff viewable
- [ ] `exportPairedComparison` produces McNemar-ready pairs
- [ ] Creating a `real`-origin case in sandbox/staging is rejected server-side
- [ ] Seed with ≥5 safety, ≥5 fidelity, ≥5 adversarial, ≥5 persona cases (synthetic)

**AI Coding Notes**

> **Common mistake:** `versionCase` must copy input+expectedOutput into the new row (not reference the old) so diffs are self-contained.
>
> **Common mistake:** The plan §6 `CorpusCase` type has no `data_origin` — extend the type (backward-compatible optional) rather than changing the plan's field names.
>
> **Common mistake:** DPDP consent (plan §9) — add a `consent` field/reference to real-origin cases in beta; the ethics prep story (TH-S31) formalizes the UI.

---

### Story TH-S27 — TH-12 CI Regression Status + Regression Job

| Field | Value |
|---|---|
| **Story ID** | TH-S27 |
| **Estimate** | 4h |
| **Depends on** | TH-S03, TH-S05, TH-S25 |
| **Blocks** | None |

**Description**

Implement plan §4 `ci` router: `getGateStatus`, `triggerRegression`, `getHaltFailures`, reading GitHub Actions via the REST API (plan §8 decision: API, not webhook). Also add the regression workflow: a new `.github/workflows/regression.yml` that (a) runs harness regression tests (the deterministic A8 15-cell + silence-path checks), (b) **blocks PRs on HALT**, (c) triggers on prompt/config changes (paths: `apps/api/src/prompts/**`, `apps/api/src/pipeline/**`, `packages/**`).

**Files to create**

- `apps/test-harness/src/server/routers/ci.ts` (wraps Octokit/`fetch` to GitHub API; env `GITHUB_TOKEN`, `GITHUB_REPO`)
- `apps/test-harness/src/lib/github-actions.ts` (client wrapper with token)
- `apps/test-harness/src/app/ci/page.tsx` + `_components/` (gate status table, HALT failures list, release-block indicator, trigger button)
- `.github/workflows/regression.yml`
- `apps/test-harness/src/__tests__/ci.test.ts` (mock GitHub API responses)

**Files to modify**

- `apps/test-harness/src/server/routers/_app.ts` (register `ci`)

**Acceptance Criteria**

- [ ] Gate status page shows latest workflow run statuses (PASS/HALT/RUNNING) from GitHub API
- [ ] `triggerRegression` dispatches the workflow (workflow_dispatch); HALT run surfaces as release-blocked
- [ ] `regression.yml` blocks PR merge on HALT; runs on prompt/pipeline/config path changes
- [ ] CI story unit tests pass with mocked API

**AI Coding Notes**

> **Common mistake:** `GITHUB_TOKEN` must be a fine-grained PAT or a GitHub App token with `actions:read`/`workflow_dispatch` — document in `.env.example`; never commit the token.
>
> **Common mistake:** The existing `.github/workflows/ci.yml` has a `security` job — keep the new regression job consistent with its style (checkout, pnpm, typecheck, vitest) and don't duplicate the backend job.

---

## Phase 6 — Polish & Handoff

### Story TH-S28 — Accessibility Audit (WCAG AA)

| Field | Value |
|---|---|
| **Story ID** | TH-S28 |
| **Estimate** | 3h |
| **Depends on** | TH-S08, TH-S09, TH-S11, TH-S14, TH-S16, TH-S20, TH-S21, TH-S22, TH-S24, TH-S25, TH-S26, TH-S27 |
| **Blocks** | None |

**Description**

Accessibility pass: run axe or Lighthouse on all screens; fix contrast (portal tokens are Material 3 — verify against WCAG AA), keyboard navigation for toggles/diagrams, focus management for modals, and **colorblind labels** on all status/state indicators (plan §6: "colorblind labels on panels" — add icon + text labels to RunStatusBadge, pipeline node states, env selector).

**Files to modify**

- `apps/test-harness/src/app/components/RunStatusBadge.tsx` (icon + text label, not color alone)
- `apps/test-harness/src/app/pipeline/_components/PipelineDiagram.tsx` + `AgentToggle.tsx` (aria roles, keyboard support, non-color state cues)
- Any component failing the audit

**Acceptance Criteria**

- [ ] axe scan on `/`, `/dashboard`, `/config`, `/agents`, `/faults`, `/determinism`, `/sampling`, `/pipeline`, `/conversations`, `/review`, `/results`, `/corpus`, `/ci` finds zero critical/serious violations
- [ ] All status states convey meaning without color (icon/label present)
- [ ] Toggles operable by keyboard only

**AI Coding Notes**

> **Common mistake:** Color contrast must be computed against the actual token values in `globals.css` (e.g. `--color-on-primary: #ffffff` on `--color-primary: #005243` — verify each badge combo).
>
> **Common mistake:** Don't add new color tokens — reuse existing ones and add icon/label cues.

---

### Story TH-S29 — Performance Optimization

| Field | Value |
|---|---|
| **Story ID** | TH-S29 |
| **Estimate** | 3h |
| **Depends on** | TH-S06, TH-S25, TH-S26 |
| **Blocks** | None |

**Description**

Per plan §7 Phase 6: lazy-load trace JSON in `TraceViewer` (load on expand), virtualize run/case lists (check if portal has a virtualizer dependency; otherwise add `@tanstack/react-virtual` — verify it's already used before adding), prefetch dashboard data, and avoid client re-renders of large `TestRun.results` arrays.

**Files to modify**

- `apps/test-harness/src/app/components/TraceViewer.tsx`
- `apps/test-harness/src/app/results/page.tsx`, `apps/test-harness/src/app/corpus/page.tsx`
- `apps/test-harness/src/app/dashboard/page.tsx`

**Acceptance Criteria**

- [ ] Trace JSON loads only when expanded (verify via network tab)
- [ ] Runs/cases lists virtualize above 200 rows
- [ ] Lighthouse performance ≥ 90 on dashboard with seeded data

**AI Coding Notes**

> **Common mistake:** Verify `@tanstack/react-virtual` (or an equivalent) is already in the workspace before adding it — the instruction is to reuse existing deps; portal currently doesn't use one, so adding it is justified here. Note the addition in the PR.
>
> **Common mistake:** `TestRun.results` can be huge (N=200 samples) — paginate or stream via the `results.getRun` procedure rather than shipping the whole array.

---

### Story TH-S30 — Documentation (PI Guide, Rater Guide, Engineer Runbook)

| Field | Value |
|---|---|
| **Story ID** | TH-S30 |
| **Estimate** | 3h |
| **Depends on** | TH-S06, TH-S20, TH-S24 |
| **Blocks** | TH-S32 |

**Description**

Write the three docs from plan §7 Phase 6: PI user guide (env selector, gates, sign-off, config drift), rater guide (blinded review flow), engineer runbook (local dev, env vars, adding an agent, running determinism/sampling, deploying).

**Files to create**

- `docs/test-harness/pi-guide.md`
- `docs/test-harness/rater-guide.md`
- `docs/test-harness/engineer-runbook.md`
- `apps/test-harness/README.md` (expand to cover setup + scripts)

**Acceptance Criteria**

- [ ] Each doc covers its audience's full flow with screenshots placeholders
- [ ] Runbook env var table matches `.env.example` exactly

**AI Coding Notes**

> **Common mistake:** Keep env var names in docs identical to `.env.example` — mismatches cause support loops.
>
> **Common mistake:** Reference `docs/design/EVIA_Therapist_Portal_Design.md` for UI copy/voice consistency.

---

### Story TH-S31 — Beta Environment Config + Ethics Prep (S3/S4, Consent, Retention)

| Field | Value |
|---|---|
| **Story ID** | TH-S31 |
| **Estimate** | 4h |
| **Depends on** | TH-S03, TH-S26, TH-S01 |
| **Blocks** | TH-S32 |

**Description**

Beta environment readiness (plan §2, §7 Phase 6, §9). **S3/S4 beta isolation uses the plan's default — a separate Postgres schema or RLS policies, not just an `environment` column.** Concretely: a dedicated beta Prisma client bound to a separate schema/role (via `@@schema` in Prisma or a connection `search_path`), so beta rows are physically isolated from sandbox/staging. Plus: S3/S4 100% capture verification report (data already flows through `processTurn` → `safetyState` + `Turn` rows), consent capture UI in the corpus manager for real-origin beta data (DPDP), retention policy (`BETA_RETENTION_DAYS` default 90 — cleanup job in `apps/worker/src/routes/cleanup.ts` style), and a one-page ethics review prep doc.

**Deviation gate (do not bypass):** if schema/RLS isolation is infeasible in this repo, the fallback is an `environment`-column filter on `TestRun`/`CorpusCase` — but ONLY with explicit PI approval. The approval must be recorded in `docs/adr/015-test-harness-beta-isolation.md` stating (a) why schema/RLS separation is infeasible, (b) the security implications (isolation is app-layer only; one query bug can cross environments), and (c) compensating controls (per-environment Prisma client + the isolation test below). Without a PI-approved ADR, the default implementation ships.

**Files to create**

- `apps/test-harness/src/server/routers/consent.ts` (or extend `corpus`): `captureConsent`, `getConsentStatus`
- `apps/test-harness/src/app/corpus/_components/ConsentPanel.tsx`
- `apps/test-harness/src/app/beta/page.tsx` (S3/S4 capture verification + retention status) — or fold into dashboard
- `docs/test-harness/ethics-review-prep.md` (must document the isolation mechanism actually shipped)
- `docs/adr/015-test-harness-beta-isolation.md` (ONLY if the `environment`-column deviation is PI-approved — records approval + security implications)
- `apps/worker/src/routes/beta-retention.ts` (cleanup job honoring `BETA_RETENTION_DAYS`)

**Acceptance Criteria**

- [ ] Beta runs record S3/S4 events at 100% (verification report queries `safetyState` + `Turn` + `GovernanceLog`)
- [ ] **Isolation verified by test:** beta-scoped queries cannot return sandbox/staging rows and vice versa (RLS/policy test for the default path, or the documented app-layer isolation test for an approved deviation)
- [ ] If the deviation is used: `docs/adr/015-test-harness-beta-isolation.md` exists with PI approval + security implications; otherwise the default schema/RLS isolation ships
- [ ] Real-origin beta cases require a consent record before use; consent status visible
- [ ] Retention job deletes/depersonalizes beta data older than `BETA_RETENTION_DAYS` (dry-run flag first)
- [ ] Ethics prep doc summarizes retention, access, consent, and DPDP posture

**AI Coding Notes**

> **Common mistake:** Do not silently downgrade to an `environment`-column filter — plan §2/§9 requires schema/RLS isolation. Prisma RLS needs raw SQL migrations (`CREATE POLICY` + `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) or a separate `@@schema`; check `docs/neon-setup.md` for what the DB supports first. If you must deviate, follow the Deviation gate in the Description (PI-approved ADR + compensating controls + isolation test) — a silent deviation fails acceptance.
>
> **Common mistake:** Retention jobs must be idempotent and runnable with `DRY_RUN=true` — mirror `apps/worker/src/routes/cleanup.ts` (`summary-reprocess`) structure.
>
> **Common mistake:** This story touches production-adjacent data (beta) — the worker retention job must be reviewed by the PI before enabling.

---

### Story TH-S32 — Staging Deployment, PI Walkthrough & Final Acceptance Verification

| Field | Value |
|---|---|
| **Story ID** | TH-S32 |
| **Estimate** | 3h |
| **Depends on** | TH-S07, TH-S28, TH-S29, TH-S30, TH-S31 |
| **Blocks** | None |

**Description**

Final story: deploy to staging, run the full plan §11 acceptance-criteria checklist against the live app, fix anything failing, and hand off. Produce a verification report mapping each acceptance row to evidence.

**Files to create**

- `docs/test-harness/acceptance-verification.md` (plan §11 checklist → evidence table)

**Files to modify**

- Anything the verification run surfaces

**Acceptance Criteria (the plan §11 table, run live)**

- [ ] Three isolated environments — env selector switches endpoint; no cross-traffic (verify per-env `TestRun` isolation)
- [ ] Model-config pinning + prompt registry — UI shows version/hash; run records capture all 8 frozen-triple fields
- [ ] PI gate sign-off — `GateSignOff` rows are immutable audit records; no procedure mutates `TestRun` (verified by test)
- [ ] Single-agent invocation — all agents callable with mocked context
- [ ] Determinism harness — A8 15-cell enumeration passes; restart test passes
- [ ] Stochastic N-sampling — N=200 < 30 min (canned); Wilson CI lower bound gates
- [ ] Fault injection — all 3 fail-safe assertions verifiable in UI
- [ ] Pipeline harness — signal override + silence-path validation demonstrated
- [ ] Conversation driver — per-turn trace export in clinician format
- [ ] Blinded review — κ ≥ 0.8 achievable; metadata stripped server-side
- [ ] Versioned corpus + results store — git-style diff works; paired-comparison export for McNemar
- [ ] Observability — per-turn trace reconstructable from stored data
- [ ] CI regression job — blocks on HALT; triggers on prompt/config change
- [ ] Beta data pipeline — S3/S4 100% capture; consent/retention/access documented

**AI Coding Notes**

> **Common mistake:** Walk through the plan §11 table row by row and record evidence (screenshot URL or test output) for each — an empty checklist is not completion.
>
> **Common mistake:** If any acceptance row fails, fix it in a small follow-up commit and re-verify, do not weaken the criterion.

---

## Coverage Matrix (Plan → Stories)

| Plan section | Covered by |
|---|---|
| §1 Architecture & stack | TH-S02, TH-S05 |
| §2 Environment topology | TH-S05, TH-S07, TH-S31 |
| §3 Screens TH-00…TH-12 | TH-S04 (00), TH-S06 (01), TH-S08 (02), TH-S09 (03), TH-S14 (04), TH-S16 (05), TH-S11 (06), TH-S20 (07), TH-S21 (08), TH-S24 (09), TH-S25 (10), TH-S26 (11), TH-S27 (12) |
| §3.5 Dependency graph & auto-activation | TH-S19, TH-S20 |
| §4 tRPC routers (11 routers) | testConfig TH-S08, singleAgent TH-S09, determinism TH-S13, stochastic TH-S15, faultInjection TH-S11, pipeline TH-S18, conversation TH-S21, review TH-S23, corpus TH-S26, results TH-S25, ci TH-S27 |
| §5 Design system | TH-S05, TH-S28 |
| §6 Data models | TH-S03 |
| §7 Phases 1–6 | TH-S02…TH-S32 |
| §8 Technical decisions | TH-S01 (ADRs) |
| §9 Security & compliance | TH-S04, TH-S26, TH-S31 |
| §9 PI gate sign-off (immutable audit) | TH-S03 (`GateSignOff` model), TH-S06 (router + UI) |
| §10 Estimated effort | Summary below |
| §11 Acceptance criteria | TH-S32 |
| §12 Open questions | TH-S01 |
| §13 UX flows | TH-S19, TH-S20 |

---

## Summary & Timeline

| Phase | Stories | AI-hours |
|---|---|---|
| 0 — Decisions & baseline | TH-S01 | 2h |
| 1 — Foundation | TH-S02…TH-S07 | 19h |
| 2 — Core harness | TH-S08…TH-S12 | 22h |
| 3 — Determinism & sampling | TH-S13…TH-S17 | 22h |
| 4 — Pipeline & conversations | TH-S18…TH-S22 | 23h |
| 5 — Review & storage | TH-S23…TH-S27 | 24h |
| 6 — Polish & handoff | TH-S28…TH-S32 | 16h |
| **Total** | **32 stories** | **≈ 128h** |

**Sequential timeline:** 128h ÷ 8h/day ≈ **16 working days** of AI-assisted execution (~3–4 calendar weeks including review).

**Parallelization (plan §10):**

- Phase 2 ∥ Phase 3: TH-S13 and TH-S15 (need TH-S09/TH-S10) can start as soon as TH-S10 lands; TH-S16 after TH-S15
- Phase 3 ∥ Phase 4: TH-S18 (needs TH-S03/TH-S08/TH-S10) runs parallel to TH-S15/TH-S17
- Phase 4 ∥ Phase 5: TH-S23/TH-S24/TH-S25 (need only TH-S03/TH-S05/TH-S18) overlap TH-S20/TH-S21
- Fastest path: 5 parallel lanes → ~42h wall-clock (see "Fastest Parallel Execution Schedule" below); the only serial chain is the critical path line below

**Critical path:** TH-S01 → TH-S02 → TH-S03 → TH-S04 → TH-S05 → TH-S09 → TH-S15 → TH-S17 → TH-S21 → TH-S22 → TH-S28 → TH-S32 (~42h, ~5 dev-days).

**Human review budget:** add ~30% (≈ 40h) for review/QA on top of the 128h.

---

## Fastest Parallel Execution Schedule (5 Lanes / 42h)

Derived from the dependency graph above. **Only TH-S01 has zero dependencies** — everything else waits on the S01 → S02 → S03 foundation. Peak parallelism is **5 stories at once**, and **5 parallel agents finish all 32 stories in ~42h wall-clock** (~5 dev-days) vs 128h sequential (~16 dev-days). The 42h floor is the critical path; more than 5 agents gains nothing.

**Lane 1 — Critical chain (never idle, 42h):**

`TH-S01 (0–2) → TH-S02 (2–6) → TH-S03 (6–9) → TH-S04 (9–12) → TH-S05 (12–15) → TH-S09 (15–21) → TH-S15 (21–26) → TH-S17 (26–29) → TH-S21 (29–34) → TH-S22 (34–36) → TH-S28 (36–39) → TH-S32 (39–42)`

**Lanes 2–5 (parallel fan-out; hours = elapsed since start):**

| Elapsed | Lane 2 | Lane 3 | Lane 4 | Lane 5 |
|---|---|---|---|---|
| 2–7 | TH-S10 | — | — | — |
| 7–12 | TH-S19 | — | — | — |
| 12–16 | TH-S23 | — | — | — |
| 15–20 | TH-S24 | TH-S08 | TH-S06 | — |
| 19–21 | — | — | TH-S07 | — |
| 20–25 | TH-S11 | TH-S18 | — | — |
| 21–26 | — | — | TH-S26 | — |
| 25–27 | TH-S12 | — | — | — |
| 25–31 | — | TH-S25 | — | — |
| 26–31 | — | — | TH-S13 | — |
| 27–32 | TH-S16 | — | — | — |
| 29–35 | — | — | — | TH-S20 |
| 31–35 | — | TH-S27 | TH-S14 | — |
| 32–35 | TH-S29 | — | — | — |
| 35–38 | — | TH-S30 | — | — |
| 35–39 | — | — | TH-S31 | — |

Lane loads: L1 = 42h, L2 = 33h, L3 = 23h, L4 = 24h, L5 = 6h (L5 idles until hour 29 — it exists only to keep the 42h floor).

**Execution rules (do not break these):**

1. **TH-S01 runs first and alone** (2h, docs-only) — all later stories read its ADRs. Do not parallelize it.
2. **TH-S02 → TH-S03 are serial on Lane 1.** `schema.prisma` + `shared-types` must land before any fan-out (hour 9); no other lane touches those files.
3. **`_app.ts` is a contention point:** TH-S06, TH-S08, TH-S09, TH-S11, TH-S13, TH-S15, TH-S18, TH-S21, TH-S23, TH-S25, TH-S26, TH-S27 each register a router there. In this schedule S09/S08/S06 (h15–20), S15/S11/S18 (h21–25), and S25/S13 (h25–31) overlap across lanes → concurrent edits conflict. Mitigation: **one designated agent owns `apps/test-harness/src/server/routers/_app.ts`** and merges the one-line registrations as router stories land (or run those stories on the same lane).
4. **`apps/api/src/lib/vertex-ai.ts` is touched by TH-S10 (optional) and TH-S17 (optional)** — the schedule keeps them ~24h apart (S10 at 2–7, S17 at 26–29); keep it that way.
5. **Cross-lane ordering that must hold:** S10 → S19/S11/S13/S15/S18 · S08 → S18 → S25 → S27 · S09 → S11/S13/S15 · S17+S18+S19 → S20 · S15 → S16 · S13 → S14. The table above satisfies all of these.
6. **Human review overlaps, doesn't extend the clock** — review each lane's output as it lands (~40h total review/QA).

**Fewer agents:** 4 agents ≈ 44–46h (S20 moves onto a busy lane; S28 slips a few hours). 3 agents ≈ 48–50h. 2 agents ≈ 64h+. Never drop below 2 — Lane 1 must stay dedicated to the critical chain.

**Wave view (unlimited agents, 17 waves):**

`[S01] → [S02, S10] → [S03] → [S19] → [S04, S23] → [S05] → [S06, S08, S09, S24, S26] → [S07, S18, S31] → [S11, S13, S15] → [S12, S25] → [S14, S16, S17] → [S20, S21] → [S27, S29] → [S22] → [S30] → [S28] → [S32]`

---

## Notes for the AI Agent Running These Stories

1. **Read before coding:** `AGENTS.md` (design spec workflow), `docs/design/EVIA_Therapist_Portal_Design.md`, and the target files named in each story's AI Coding Notes.
2. **Match repo conventions:** pnpm, ESM `.js` import suffixes in `apps/api`/`apps/worker`, TS strict, vitest for tests, PR title style from `CONTRIBUTING.md`.
3. **Never hardcode** `LOCAL_DEV_BYPASS_AUTH=true` (CI security job rejects it).
4. **Never commit** `.env` files or service-account credentials (CI security job blocks them).
5. **Run verifications** from each story's Acceptance Criteria; record results in the PR description.
6. **Plan inconsistencies** (Next 15 vs 16, Manrope vs Inter, RUNNING color) are resolved in this doc — follow the repo's actual state and note any deviation in the PR.
