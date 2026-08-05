# EVIA Therapist Portal Manual Test Runbook

## Local Dev Environment

| | |
|---|---|
| **Application** | EVIA Therapist Portal (Next.js, `apps/therapist-portal`) |
| **Environment** | Local dev — portal on `http://localhost:3001`, local Neon branch DB |
| **Auth** | Google OAuth (NextAuth v4); allowlist = presence in `Therapist` table |
| **Estimated Duration** | 60–90 minutes full run; ~20 minutes for the P0 path only |
| **Prepared By** | QA Team |

---

## Purpose

A step-by-step manual test runbook for the therapist portal, run locally. Each
section maps to the detailed test cases in `QA_Test_Cases.md` (TP-001 → TP-022)
and the regression items in `Regression_Checklist.md` Section 10 (R10). Follow
this runbook before opening a portal PR, after portal changes, and before any
portal walkthrough or beta deployment.

### Which doc to use for what

| Need | Document |
|------|----------|
| Detailed portal test cases | `docs/testing/QA_Test_Cases.md` → TP-001 … TP-022 |
| Portal regression pass | `docs/testing/Regression_Checklist.md` → Section 10 (R10.1–R10.12) |
| Test cycle tracking / logs | `docs/testing/Test_Execution_Checklist.md` |
| Filing a bug | `docs/testing/Bug_Report_Template.md` (see [Bug filing](#bug-filing) below for the web adaptation) |
| Mobile-side end-to-end journey | `docs/testing/EVIA_QA_UAT_Manual.md` (generates the client data the portal shows) |
| Walkthrough narrative | `docs/therapist-onboarding/walkthrough-guide.md` |

---

## Local Setup

### 1. Prerequisites

- Node.js 20+, pnpm 9+
- Local Neon branch (`DATABASE_URL`) — see `docs/neon-setup.md`
- Google OAuth credentials for the portal (see `apps/therapist-portal/README.md`)
- Dependencies installed from repo root: `pnpm install`

### 2. Configure environment

```bash
cp apps/therapist-portal/.env.example apps/therapist-portal/.env
```

Set at minimum:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your local Neon branch connection string |
| `NEXTAUTH_URL` | `http://localhost:3001` |
| `NEXTAUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From Google Cloud Console (authorized redirect: `http://localhost:3001/api/auth/callback/google`) |
| `LOCAL_DEV_BYPASS_AUTH` | Leave **unset / `"false"`** — see the warning below |

> **Warning — do NOT run this runbook with `LOCAL_DEV_BYPASS_AUTH="true"`.**
> In bypass mode the tRPC context injects a mock session and:
> - `clients.detail` returns hardcoded mock data (T-02 shows fake client info)
> - `notes.addNote` / `listNotes` and `clients.add` fail against the real DB
>   (`bypass@evia.dev` / `th_bypass_mock` do not exist in the database)
> Bypass is only useful for a visual smoke of the T-01 empty dashboard. It is
> not a valid configuration for functional testing.

### 3. Run the migration (once)

```bash
cd apps/api && pnpm prisma migrate dev && cd ../..
```

### 4. Start the portal

```bash
cd apps/therapist-portal
pnpm dev
```

Open `http://localhost:3001`. The backend API does **not** need to be running —
the portal reads the database directly via Prisma.

### 5. Seed therapist accounts

```bash
cd apps/therapist-portal
npx tsx src/scripts/seed-therapist.ts tester1@example.com
npx tsx src/scripts/seed-therapist.ts tester2@example.com   # second account for cross-therapist tests
```

Sign in with a Google account whose email matches a seeded row. Non-seeded
accounts are rejected with "Your account is not yet set up on Evia."

---

## Test Data Preparation

Create clients so every T-02 state can be exercised:

| Client | Intended state | How to create |
|--------|----------------|----------------|
| Client A | Assigned, no care plan, no summary, no notes | Add via **Add client** dialog |
| Client B | Confirmed assignment (CP1) + reasoning note + available summary | Run a mobile session end-to-end against the same DB, or insert via SQL |
| Client C | Provisional assignment (CP2) | A2 onboarding assignment with low confidence (or SQL) |
| Client D | S3 or S4 safety state | Crisis message via mobile (or SQL `safety_state`) |
| Client E | Summary `generating` (PENDING) | Session closed but A10A not completed |
| Client F | Multiple notes from different times | Add 3+ notes in T-05 on separate sessions |

Create one therapist with **zero** assigned clients for the empty-caseload test.

---

## Runbook

Mark each step **PASS (✓)** or **FAIL (✗)**. For any FAIL, file a GitHub Issue
(see [Bug filing](#bug-filing)) and link it in the Notes column. P0 steps must
all pass before proceeding.

### Section 1: T-00 Login

| # | Step | Expected Result | Priority | Pass/Fail | Notes/Issue | TPT |
|---|------|-----------------|----------|-----------|-------------|-----|
| T00-1 (TP-001) | Navigate to `http://localhost:3001` unauthenticated | Redirected to `/auth` login screen with "Continue with Google" button | P0 | ☐ | | TPT-02 |
| T00-2 (TP-001) | Sign in with a **seeded** Google account | OAuth completes → redirected to dashboard (`/dashboard`); therapist name shown | P0 | ☐ | | TPT-02 |
| T00-3 (TP-002) | Sign out, then sign in with a **non-seeded** Google account | OAuth succeeds but server-side allowlist check rejects; clear message "Your account is not yet set up on Evia"; returned to `/auth`; no portal access | P0 | ☐ | | TPT-05 |
| T00-4 (TP-003) | Click "Continue with Google" then cancel partway through Google's flow | Clean return to `/auth` login screen. No error page, no broken state | P1 | ☐ | | TPT-07 |

### Section 2: T-01 Dashboard & Add Client

> **Note — Add Client UI status:** `AddClientDialog.tsx` and the `clients.add`
> tRPC procedure exist on the `story/PortalTesting` branch but the dialog is not
> yet wired into the dashboard page. Until it is, the ADD-* UI steps are pending;
> test `clients.add` behaviour at the API level via the Vitest suite
> (`pnpm vitest run src/server/routers/__tests__/clients.add.test.ts`) or by
> calling the tRPC endpoint directly (see ADD-7). Mark untestable UI steps
> "Not Tested" until the button is present.

| # | Step | Expected Result | Priority | Pass/Fail | Notes/Issue | TPT |
|---|------|-----------------|----------|-----------|-------------|-----|
| T01-1 (TP-004) | Log in as therapist with assigned clients | Client list renders; each row shows name/phone, care plan, status (Provisional/Confirmed), last session date, safety badge (S3/S4 only — no other badge types) | P0 | ☐ | | TPT-01 |
| T01-2 (TP-007) | Examine the dashboard | **No** editing controls anywhere on T-01; read-only overview | P1 | ☐ | | TPT-01 |
| T01-3 (TP-005) | Log in as the zero-client therapist | Clean, friendly empty state — not blank/broken; clear "no clients" message | P1 | ☐ | | TPT-07 |
| T01-4 (TP-006) | Click a client row | Navigates to `/clients/[id]` (T-02) with the correct client's data | P0 | ☐ | | TPT-01 |
| ADD-1 | Open **Add client** dialog → enter a new phone number → Add | Dialog closes or shows success; client appears in the list without a full reload (invalidates `clients.list`) | P0 | ☐ | | TPT-01 |
| ADD-2 | Add the **same phone number again** | Idempotent — no duplicate `User`; assignment upserted; succeeds cleanly | P0 | ☐ | | TPT-07 |
| ADD-3 | Add an existing client already assigned | Succeeds as a no-op; no duplicate assignment row | P1 | ☐ | | TPT-07 |
| ADD-4 | Open dialog → submit empty or whitespace-only phone | Add button disabled (client-side); server-side z.string validation also rejects with error | P0 | ☐ | | TPT-06 |
| ADD-5 | Open dialog → click **Cancel** / click the backdrop | Dialog closes; no client added; dashboard state unchanged | P1 | ☐ | | TPT-04 |
| ADD-6 | Open dialog → focus lands in phone input | Input auto-focused for quick entry | P2 | ☐ | | TPT-04 |
| ADD-7 | API-level: call `clients.add` with a new phone, then the same phone twice | Returns the client id/phone; second call reuses the same `User` (idempotent, no duplicate) | P0 | ☐ | | TPT-06 |

### Section 3: T-02 Client Overview

| # | Step | Expected Result | Priority | Pass/Fail | Notes/Issue | TPT |
|---|------|-----------------|----------|-----------|-------------|-----|
| T02-1 (TP-008) | Open a client with complete data (Client B) | Care plan section: `care_plan_id`, `assignment_state`, `reasoning_note`; Latest Session Summary section shows the most recent summary text; safety state displayed; all values correct for this client | P0 | ☐ | | TPT-01 |
| T02-2 (TP-009) | Compare a **confirmed** client vs a **provisional** client | Assignment state is clearly visually distinct at a glance (Confirmed = green badge, Provisional = amber badge) | P0 | ☐ | | TPT-04 |
| T02-3 (TP-010) | Open a client with no summary (Client A) | Clear "No session summary available yet" message — **not** an error, not blank, no fabricated content | P1 | ☐ | | TPT-07 |
| T02-4 (TP-010) | Open a client whose summary is PENDING (Client E) | "Summary is being generated..." indicator shown | P1 | ☐ | | TPT-07 |
| T02-5 | Expand "What does provisional/confirmed mean?" | Correct explanatory text for the current state | P2 | ☐ | | TPT-01 |
| T02-6 (TP-012) | Inspect the whole T-02 screen | No deferred panels/placeholders for rupture, stage avoidance, peer concern, or A14 trends | P1 | ☐ | | TPT-03 |
| T02-7 | Click **Manage →** | Navigates to `/clients/[id]/program` (T-03) | P0 | ☐ | | TPT-01 |
| T02-8 | Click **View and add session notes** | Navigates to `/clients/[id]/notes` (T-05) | P0 | ☐ | | TPT-01 |

### Section 4: T-03 Care Plan

| # | Step | Expected Result | Priority | Pass/Fail | Notes/Issue | TPT |
|---|------|-----------------|----------|-----------|-------------|-----|
| T03-1 (TP-013) | Open T-03 for an assigned client on CP1 | Current care plan displayed with assignment badge | P0 | ☐ | | TPT-01 |
| T03-2 (TP-013) | Open the dropdown | Options are **only** CP1 / CP2 / CP3 (Anxiety & Worry / Low Mood & Depression / Stress & Burnout) | P0 | ☐ | | TPT-01 |
| T03-3 (TP-013) | Select CP2 → **Save care plan** | Success toast "✓ Care plan saved"; `assignment_state` becomes **confirmed**; change reflected back on T-02 | P0 | ☐ | | TPT-01 |
| T03-4 (TP-016) | Re-select the same care plan → Save | Clean success, no error, no duplicate/conflicting data; assignment stays confirmed | P1 | ☐ | | TPT-07 |
| T03-5 (TP-014) | Confirm invalid values are blocked at both layers | UI: dropdown cannot select anything outside CP1–CP3; API: `setCarePlan` with an invalid `carePlanId` returns a validation error (400-class) | P1 | ☐ | | TPT-06 |
| T03-6 (TP-015) | Simulate a save failure (stop DB / break network) | Clear error message; **no** success toast / no false-success state; current displayed plan unchanged | P1 | ☐ | | TPT-07 |
| T03-7 | Click **Cancel** on T-03 | Returns to T-02 without saving | P2 | ☐ | | TPT-04 |

### Section 5: T-05 Session Notes

| # | Step | Expected Result | Priority | Pass/Fail | Notes/Issue | TPT |
|---|------|-----------------|----------|-----------|-------------|-----|
| T05-1 (TP-017) | Open T-05 for a client with multiple notes | Notes listed with newest first; each shows content, relative timestamp, and authoring therapist name; list scrollable | P0 | ☐ | | TPT-01 |
| T05-2 (TP-018) | Type a note → **Save note** | Success message; new note appears immediately **without a full page reload**; shows correct timestamp + author | P0 | ☐ | | TPT-01 |
| T05-3 (TP-019) | Submit empty or whitespace-only note | Validation error "Note cannot be empty."; nothing saved; input not silently cleared | P1 | ☐ | | TPT-06 |
| T05-4 (TP-020) | Open T-05 for a client with zero notes | Clean empty state — "No notes yet."; not blank/broken | P1 | ☐ | | TPT-04 |
| T05-5 (TP-022) | Type a long note → simulate save failure | Draft text remains in the input (uses `sessionStorage`), error shown, text not lost | P2 | ☐ | | TPT-07 |
| T05-6 | Verify the privacy notice | Notice clearly states notes are "never read" by the AI | P1 | ☐ | | TPT-04 |

### Section 6: Security & Architectural Boundaries

| # | Step | Expected Result | Priority | Pass/Fail | Notes/Issue | TPT |
|---|------|-----------------|----------|-----------|-------------|-----|
| SEC-1 (TP-011) | As Therapist A, open T-02 for Therapist B's client by **manipulating the client ID in the URL** (or calling `clients.detail` directly) | Access blocked **server-side** — `FORBIDDEN` / error state; Therapist B's client data not exposed | P0 | ☐ | | TPT-05 |
| SEC-2 (TP-011) | Repeat for `getCarePlan`, `setCarePlan`, `listNotes`, `addNote` | All reject cross-therapist access server-side; scoping consistent | P0 | ☐ | | TPT-05 |
| SEC-3 (TP-021) | **Code review** — search the agent-facing codebase for references to the therapist notes table | Zero references in any agent context-bundle / agent-facing data path. Notes are architecturally isolated (verify explicitly, do not assume) | P0 | ☐ | | TPT-05 |
| SEC-4 | Sign out → visit a deep link (`/clients/[id]`) directly | Redirected to `/auth`; protected route not reachable unauthenticated | P0 | ☐ | | TPT-05 |

---

## Results Summary

| Section | Items | Passed | Failed | Not Tested | Blockers? |
|---------|-------|--------|--------|------------|-----------|
| T-00 Login | 4 | | | | |
| T-01 Dashboard + Add Client | 11 | | | | |
| T-02 Client Overview | 8 | | | | |
| T-03 Care Plan | 7 | | | | |
| T-05 Session Notes | 6 | | | | |
| Security & Architecture | 4 | | | | |
| **TOTAL** | **40** | | | | |

**Verdict:** PASS (all P0 pass) ☐ / FAIL (any P0 fails — block PR/release) ☐

### Test Type (TPT) Breakdown

| TPT | Type | Steps |
|-----|------|-------|
| TPT-01 | Functional Testing | T01-1, T01-2, T01-4, ADD-1, T02-1, T02-5, T02-7, T02-8, T03-1, T03-2, T03-3, T05-1, T05-2 |
| TPT-02 | Smoke Testing | T00-1, T00-2 |
| TPT-03 | Regression Testing | T02-6 |
| TPT-04 | UI/UX Accessibility Testing | ADD-5, ADD-6, T02-2, T03-7, T05-4, T05-6 |
| TPT-05 | Security Testing | T00-3, SEC-1, SEC-2, SEC-3, SEC-4 |
| TPT-06 | API/tRPC Testing | ADD-4, ADD-7, T03-5, T05-3 |
| TPT-07 | Edge Cases | T00-4, T01-3, ADD-2, ADD-3, T02-3, T02-4, T03-4, T03-6, T05-5 |

**Total classified:** 40 steps (single primary TPT per step)

---

## Bug Filing

Use `docs/testing/Bug_Report_Template.md` for every bug. Because the template
was written for the Android app, adapt the **Environment** table for the web:

| Field (portal) | Value to record |
|----------------|-----------------|
| **Build/Version** | Git branch + commit (`git rev-parse --short HEAD`) |
| **Browser & version** | e.g. Chrome 126 |
| **OS** | e.g. Windows 11 / macOS 14 |
| **Portal URL** | `http://localhost:3001` (local) — note which environment |
| **Backend Environment** | local Neon branch / evia-beta |
| **Network Type** | WiFi / wired / airplane mode (if relevant) |
| **Session ID** | NextAuth session / tRPC trace if applicable |

Also swap the evidence sections:

| Template section | Portal adaptation |
|------------------|-------------------|
| Screenshots / Screen Recording | Browser screenshot + DevTools **Console** errors |
| Logcat output | Browser **Network** tab: failed tRPC request, status code, request/response payload |
| Network Logs | `apps/therapist-portal` terminal output and the failed `/_trpc/...` request in DevTools |

Keep everything else identical: numbered reproduction steps, Expected vs Actual
table, priority/severity/HALT definitions, "Steps Taken Already", Additional
Context, and the engineering triage table. File in GitHub Issues and link it in
the Notes column of the affected runbook row.

**Priority guidance for portal bugs:**
- **P0** — auth/authorization failure, cross-therapist data exposure, notes leaking into agent context, care plan saved but not applied, or any critical-path break
- **P1** — wrong badge/label, missing state (e.g. no empty state), confusing error handling, save failure not communicated
- **P2** — spacing, typography, minor wording, cosmetic

---

## Regression Cross-Check

After the runbook passes, run `Regression_Checklist.md` **Section 10 (R10.1–R10.12)** as the portal regression pass and record results in
`Test_Execution_Checklist.md` (Tester Assignment Log, Daily Test Execution Log,
Bug Summary). The R10 items map onto this runbook as follows:

| R10 item | Covered by |
|----------|------------|
| R10.1 T-00 Google OAuth login | T00-2 / T00-3 |
| R10.2 T-01 assigned client list | T01-1 |
| R10.3 T-01 S3/S4 safety badges | T01-1 |
| R10.4 T-02 A10A summary, safety state, mood trend | T02-1 |
| R10.5 T-02 assignment_state shown | T02-1 / T02-2 |
| R10.6 T-02 reasoning_note visible | T02-1 |
| R10.7 T-03 dropdown CP1/CP2/CP3 only | T03-2 |
| R10.8 T-03 override sets confirmed | T03-3 |
| R10.9 T-03 rejects care plan outside range | T03-5 |
| R10.10 T-05 notes persist, chronological | T05-1 / T05-2 |
| R10.11 T-05 notes NOT ingested by agents | SEC-3 |
| R10.12 tRPC type changes → immediate TS error | `pnpm lint` (tsc --noEmit) after any shared-types change |

---

## Tester Information

| Field | Value |
|-------|-------|
| **Tester Name** | |
| **Date** | |
| **Branch/Commit** | |
| **Browser + OS** | |
| **Backend/DB** | |
| **Notes** | |
