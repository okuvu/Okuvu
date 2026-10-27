# Evia Therapist Portal — QA Test Plan

**Prepared by:** QA Lead
**Date:** August 2026
**Product under test:** Evia Therapist Portal (`apps/therapist-portal`)
**Related system:** Evia backend API (`apps/api`), Prisma schema (`packages/prisma`), shared types (`packages/shared-types`)
**Scope of this plan:** Manual QA of the therapist portal, executed against the portal's current implementation on the `develop` branch.

---

## 1. Introduction

This test plan defines the scope, approach, environment, and exit criteria for manual QA of the Evia Therapist Portal. It is written for a QA intern with no prior product knowledge — every test case in the companion documents gives exact URLs, click paths, typed values, and per-step expected behavior.

The portal is a Next.js 16 App Router application that lets therapists log in with Google OAuth, see their assigned clients, view a read-only client overview, set/change a client's care plan, and write private session notes. It talks to the backend through an in-process tRPC API (`/api/trpc`) and stores data in PostgreSQL (Neon).

### 1.1 Documents used as source of truth

| Document | Location | Role |
|---|---|---|
| Sprint 3 Implementation Specs (E10, E11) | `docs/sprints/` | Functional requirements, acceptance criteria, edge cases for the portal |
| Sprint 4 Implementation Specs (E12, E13) | `docs/sprints/` | Regression scope, beta/dogfooding context |
| EVIA Therapist Portal Design.md | `docs/design/EVIA_Therapist_Portal_Design.md` | UI/UX, design tokens, badge system, accessibility |
| Prisma schema | `packages/prisma/schema.prisma` | Data model (Therapist, TherapistClient, ClinicalConfig, TherapistNote, SafetyState, SessionLog, SessionSummary) |
| Shared types | `packages/shared-types/index.ts` | `SafetyState`, `ClientCarePlan`, `ClientListItem`, labels |
| Therapist seed guide | `docs/therapist-onboarding/therapist-seed-guide.md` | How to create test therapist accounts |
| OAuth setup guide | `docs/therapist-portal-signin-setup.md` | Auth test setup, unauthorized-account behavior |
| Existing QA precedent | `docs/testing/QA_Test_Cases.md` | Existing test-case format for the mobile app |

---

## 2. Scope

### 2.1 In scope

- **T-00 Login** (`/auth`) — Google OAuth, allowlist enforcement, error states.
- **T-01 Dashboard** (`/dashboard`) — client list, care plan badge, status badge, last session, safety column, navigation to client overview.
- **T-02 Client Overview** (`/clients/[id]`) — care plan + assignment state, clinical reasoning note, latest session summary, safety state, session notes link.
- **T-03 Program Evia / Care Plan** (`/clients/[id]/program`) — current care plan display, care plan dropdown (CP1/CP2/CP3), save, confirmation.
- **T-05 Session Notes** (`/clients/[id]/notes`) — note list, add-note form, draft preservation, validation, privacy notice.
- **Authentication & route guarding** — NextAuth Google OAuth, `proxy.ts` route guard, tRPC auth middleware, bypass-mode behavior.
- **Backend procedures** (via UI and, where noted, direct tRPC calls) — `clients.list`, `clients.detail`, `clients.getCarePlan`, `clients.setCarePlan`, `notes.listNotes`, `notes.addNote`.
- **Cross-cutting test types** — positive, negative, validation, boundary, permission, API failure, network failure, duplicate submission, refresh, session timeout, accessibility, responsive, cross-browser, security, regression, smoke.

### 2.2 Out of scope

- The Flutter mobile app (covered separately by `docs/testing/QA_Test_Cases.md`).
- `apps/api` Fastify endpoints (they serve the mobile app; the portal uses tRPC in-process).
- Post-MVP features explicitly deferred by the Design.md (multi-parameter A14 assessment, CP4–CP10, secondary care plan, non-English content, T-04 safety screen, T-06 preview modal, T-07 invite client).
- The `example` tRPC router is present for scaffolding; it is verified in API test cases only to confirm the tRPC layer is healthy, not as a product feature.

### 2.3 Verified MVP scope (from Design.md §0)

- 3 care plans only: CP1 (Anxiety & Worry), CP2 (Low Mood & Depression), CP3 (Stress & Burnout).
- One therapeutic agent (A2); portal shows care-plan + assignment state, not full routing.
- SRS-only measurement; no multi-parameter construct trending.
- English only.
- Read-only T-02 (no inline editing).

---

## 3. Test Strategy & Approach

Manual black-box testing guided by the sprint specs and the design document, combined with targeted white-box checks against the source (so that "Missing Implementation" gaps and code-level facts are documented accurately, never invented).

Test genre coverage is defined explicitly because the client requested all of the following, and each is exercised in the companion documents:

| Genre | Definition | Where covered |
|---|---|---|
| Positive | Correct path with valid inputs | TEST_CASES.md, SMOKE_TESTS.md |
| Negative | Correct rejection of invalid inputs/actions | TEST_CASES.md |
| Validation | Field-level rules (empty note, whitespace, invalid care plan) | TEST_CASES.md |
| Boundary | Limits (empty client list, long notes, whitespace-only) | TEST_CASES.md, EDGE_CASES.md |
| Permission | Cross-therapist access, unassigned client, non-allowlisted Google account | SECURITY_TEST_CASES.md |
| API failure | tRPC error handling, DB not configured, procedure errors | API_TEST_CASES.md |
| Network failure | Server down, slow network, reconnect | TEST_CASES.md (refresh/network sections) |
| Duplicate submission | Double-click save, re-saving same care plan | TEST_CASES.md |
| Refresh | Refresh during draft, after save, mid-load | TEST_CASES.md, EDGE_CASES.md |
| Session timeout | Expired NextAuth JWT session | SECURITY_TEST_CASES.md |
| Accessibility | Keyboard nav, screen-reader labels, contrast, focus | UI_TEST_CASES.md |
| Responsive | Desktop/mobile/tablet breakpoints | UI_TEST_CASES.md |
| Cross-browser | Chrome, Firefox, Edge, Safari | UI_TEST_CASES.md |
| Security | Allowlist, scoping, bypass flags, JWT handling | SECURITY_TEST_CASES.md |
| Regression | Verify previously-working features stay working | REGRESSION_TESTS.md |
| Smoke | Fast health check of critical paths | SMOKE_TESTS.md |

---

## 4. Test Environment

### 4.1 Primary environment

| Item | Value |
|---|---|
| Application | `apps/therapist-portal` run via `pnpm dev` (Next.js 16, port 3000) |
| Backend | `apps/api` run via `pnpm dev` (Fastify, port 8080) — required only if testing against live data |
| Database | Local Neon branch via `DATABASE_URL` (see `docs/neon-setup.md`) |
| Auth | Real Google OAuth with a test therapist account in the `therapist` table (see §6), **or** `LOCAL_DEV_BYPASS_AUTH=true` for bypass-mode tests |
| Node | 20+ |
| pnpm | 9+ |

### 4.2 Launcher commands

```bash
# Terminal 1 — backend API (only if live data needed)
cd apps/api
pnpm dev

# Terminal 2 — therapist portal
cd apps/therapist-portal
pnpm dev
# → http://localhost:3000
```

### 4.3 Browsers

Test on all of these where feasible; at minimum Chrome + one other:

- Google Chrome (latest) — primary
- Mozilla Firefox (latest)
- Microsoft Edge (latest)
- Safari (latest) — if on macOS

### 4.4 Devices / viewports

| Class | Viewport | Notes |
|---|---|---|
| Desktop | 1440×900, 1920×1080 | Primary — portal is desktop-first |
| Tablet | 768×1024 | Sidebar collapses below `md` (768px) |
| Mobile | 375×812 | Not a primary target; verify no broken layout |

---

## 5. Roles & Responsibilities

| Role | Responsibility |
|---|---|
| QA Lead | Author this plan and test cases, triage bugs, sign off exit criteria |
| QA Intern | Execute test cases, record actual results, file bug reports using `BUG_REPORT_TEMPLATE.md` |
| Lead Developer | Fix UI/portal bugs, answer questions on intended behavior |
| Senior Engineer | Fix backend/infra bugs, review auth/security findings |
| Data setter | Seed therapists, assign clients, set care plans, create session data (may be the QA Lead) |

---

## 6. Test Data Preparation

### 6.1 Seed therapist accounts

Per `docs/therapist-onboarding/therapist-seed-guide.md`:

```bash
cd apps/therapist-portal
npx tsx src/scripts/seed-therapist.ts therapist@example.com
npx tsx src/scripts/seed-therapists-batch.ts   # for multiple accounts
```

Create at least these accounts:

| Email | Purpose |
|---|---|
| `qa.therapist@example.com` | Primary test therapist (allowlisted) |
| `qa.therapist2@example.com` | Second therapist for cross-therapist tests |
| `unauthorized@gmail.com` | A Google account **not** in the `therapist` table (for allowlist rejection) |

Verify with:
```sql
SELECT id, email, created_at FROM "Therapist" WHERE email IN ('qa.therapist@example.com','qa.therapist2@example.com');
```

### 6.2 Assign clients to therapists

Assignments live in `TherapistClient` (composite key `therapist_id` + `client_user_id`). Insert directly via SQL or a Prisma script. A client is a `User` row with `auth_subject` (the Cognito user's `sub`) and `phone_number`. Use distinct fake phone numbers like `+15550000001`.

Minimum data set:

- **Therapist A** — 3 assigned clients:
  - Client 1: confirmed care plan CP1, has a COMPLETED session summary, safety S0.
  - Client 2: provisional care plan CP2, has a FAILED/SKIPPED_TRIVIAL summary (to test the "no summary yet" state), safety S2.
  - Client 3: no `ClinicalConfig` row at all (no care plan assigned yet), safety S3.
- **Therapist B** — 1 assigned client (uniquely theirs) for cross-therapist tests.
- One `User` row with **no** therapist assignment (for unassigned-client tests).

### 6.3 Care plan and summary fixtures

`ClinicalConfig` row fields: `care_plan_id` (`CP1|CP2|CP3`), `assignment_state` (`provisional|confirmed`), `reasoning_note` (string), `confidence_at_last_eval`, `turns_evaluated`.

`SessionSummary` row fields: `status` (`PENDING|COMPLETED|FAILED|SKIPPED_TRIVIAL`), `summary_text`, `last_updated_turn`, `last_updated_at`, linked to a `SessionLog`.

### 6.4 Test data notes

- The `therapist` table **is** the allowlist. A Google account only gets portal access if its email exists there.
- `LOCAL_DEV_BYPASS_AUTH=true` bypasses the allowlist in the auth callback and the tRPC context; it should be off for allowlist tests.
- The dashboard and notes rely on real DB data; in bypass mode the clients router returns mock rows for `detail` but an empty list for `list` (see `BUG_CANDIDATES.md`). Tests that need real data should use real OAuth.

---

## 7. Test Execution Plan

### 7.1 Entry criteria

- Portal builds and runs: `pnpm build` succeeds (or `pnpm dev` starts without errors).
- `pnpm lint` (runs `tsc --noEmit`) passes.
- Test therapist accounts and client fixtures are seeded (see §6).
- `LOCAL_DEV_BYPASS_AUTH` is set per the test being run, and is understood to be local-only.

### 7.2 Execution order

1. **Smoke tests** (SMOKE_TESTS.md) — gate the session; if smoke fails, fix or log before proceeding.
2. **Functional tests** (TEST_CASES.md) — T-00 → T-01 → T-02 → T-03 → T-05, plus cross-cutting cases.
3. **API tests** (API_TEST_CASES.md).
4. **Security tests** (SECURITY_TEST_CASES.md).
5. **UI/accessibility/responsive** (UI_TEST_CASES.md).
6. **Edge cases** (EDGE_CASES.md).
7. **Regression** (REGRESSION_TESTS.md) — after any fix or at the start of each new sprint cycle.

### 7.3 Defect management

- File every failure against the bug log using `BUG_REPORT_TEMPLATE.md`.
- Severity: Critical (blocks use / data loss), High (major feature broken), Medium (partial failure), Low (cosmetic).
- Priority: P0 (must fix before beta), P1 (fix before beta if time allows), P2 (deferred).
- Link each bug to its traceability row in TRACEABILITY_MATRIX.md.

---

## 8. Exit Criteria

- 100% of smoke tests pass.
- 100% of P0-priority test cases pass; no open Critical bugs.
- ≥95% of planned test cases executed with a recorded result (Pass/Fail/Blocked).
- All failures have a bug report with reproduction steps.
- No `LOCAL_DEV_BYPASS_AUTH=true` shipped in any non-local path (verify per `apps/api/src/lib/check-production-bypass.ts` and portal env).
- Regression suite passes for the affected areas after each fix.

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| No Google OAuth credentials for dev | Auth tests blocked | Use `LOCAL_DEV_BYPASS_AUTH=true` for non-auth tests; run allowlist tests against an environment with real creds |
| No real therapist/client data | Dashboard/notes show empty states only | Seed fixtures per §6 |
| `LOCAL_DEV_BYPASS_AUTH=true` masks real session behavior | False confidence | Explicitly run a full auth/session/security pass with bypass off |
| Design doc vs implementation divergence | Tests written against aspirational UI | Every UI test references the actual code path; divergences are logged in BUG_CANDIDATES.md, not silently assumed |
| Next.js 16 `proxy.ts` route guard is not a hard security boundary | Over-reliance on client redirect | Security tests verify server-side tRPC authorization (UNAUTHORIZED/FORBIDDEN), not just the redirect |

---

## 10. Deliverables

| File | Purpose |
|---|---|
| `TEST_PLAN.md` | This document |
| `TEST_CASES.md` | Full functional test cases (all genres) |
| `SMOKE_TESTS.md` | Fast health-check suite |
| `REGRESSION_TESTS.md` | Regression suite |
| `API_TEST_CASES.md` | tRPC procedure tests |
| `SECURITY_TEST_CASES.md` | Auth, allowlist, scoping, session tests |
| `UI_TEST_CASES.md` | Design-system, accessibility, responsive, cross-browser tests |
| `EDGE_CASES.md` | Edge/negative scenarios |
| `TRACEABILITY_MATRIX.md` | Story → requirement → test-case mapping |
| `BUG_REPORT_TEMPLATE.md` | Standard bug report template |
| `BUG_CANDIDATES.md` | Findings from source review (potential issues to confirm) |
| `TEST_SUMMARY_TEMPLATE.md` | Per-cycle QA summary template |

---

## 11. Abbreviations

- **AC** — Acceptance Criteria
- **CP** — Care Plan (CP1 Anxiety & Worry / CP2 Low Mood & Depression / CP3 Stress & Burnout)
- **E2E** — End to end
- **FR** — Functional Requirement
- **P0/P1/P2** — Priority levels
- **tRPC** — The portal's in-process RPC layer
- **S0–S4** — Safety states (Stable/Low/Elevated/High/Critical)
- **T-00…T-05** — Portal screens (login, dashboard, client overview, program, session notes)
