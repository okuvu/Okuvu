# Evia Therapist Portal — Smoke Tests

**Purpose:** Fast gate (≈5–10 minutes) verifying that the portal's critical paths work before deeper testing. Run after every deploy, every env change, and at the start of every test session. If any SMK test fails, log a bug and fix/acknowledge before continuing.

**Preconditions for all smoke tests:**
- Portal running at `http://localhost:3000` (`cd apps/therapist-portal && pnpm dev`).
- `LOCAL_DEV_BYPASS_AUTH` set as noted per test. Prefer **real Google OAuth** for SMK-001/SMK-002; use **bypass mode** for SMK-003+ if OAuth is unavailable.
- Seed data per `TEST_PLAN.md` §6 (at least 1 therapist with ≥1 assigned client).

---

## SMK-001 — Login and dashboard load (Critical path)

| Field | Value |
|---|---|
| Test Case ID | SMK-001 |
| Module | Auth + Dashboard |
| Feature | T-00 → T-01 |
| Story ID | E10-S01, E10-S04 |
| Priority | P0 |
| Severity | Critical |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Open `http://localhost:3000` | Redirected to `/auth` login screen with "Continue with Google" |
| 2 | Sign in with an allowlisted Google account | Redirected to `/dashboard` with greeting and client count |
| 3 | Confirm the client table renders | ≥1 row with masked phone, care plan/status/last session/safety columns |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SMK-002 — Allowlist rejection (Critical path)

| Field | Value |
|---|---|
| Test Case ID | SMK-002 |
| Module | Auth |
| Feature | T-00 allowlist |
| Story ID | E10-S01 |
| Priority | P0 |
| Severity | Critical |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Log out (or incognito window) | On `/auth` |
| 2 | Sign in with a Google account NOT in the `therapist` table | Redirected to `/auth?error=unauthorized`; banner "Your account is not yet set up on Evia. Please contact your administrator." |
| 3 | Try opening `/dashboard` | Redirected back to `/auth` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SMK-003 — Client overview renders (Critical path)

| Field | Value |
|---|---|
| Test Case ID | SMK-003 |
| Module | Client Overview |
| Feature | T-01 → T-02 |
| Story ID | E10-S05, E10-S06 |
| Priority | P0 |
| Severity | Critical |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Log in (bypass OK if OAuth unavailable) | Dashboard visible |
| 2 | Click a client row (phone or View →) | `/clients/<id>` loads; no blank screen/error |
| 3 | Confirm CLIENT OVERVIEW + CARE PLAN cards render | Phone, safety, plan name, assignment badge visible |
| 4 | Confirm "View and add session notes →" link present | Link to `/clients/<id>/notes` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SMK-004 — Care plan page loads (Critical path)

| Field | Value |
|---|---|
| Test Case ID | SMK-004 |
| Module | Care Plan |
| Feature | T-03 |
| Story ID | E11-S01, E11-S02 |
| Priority | P0 |
| Severity | Critical |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | From a client overview, click **Manage →** (or open `/clients/<id>/program`) | Program Evia page loads |
| 2 | Confirm CURRENT CARE PLAN + dropdown | Shows current plan/badge; dropdown has exactly CP1/CP2/CP3 |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SMK-005 — Add a session note (Critical path)

| Field | Value |
|---|---|
| Test Case ID | SMK-005 |
| Module | Session Notes |
| Feature | T-05 |
| Story ID | E11-S03, E11-S04 |
| Priority | P0 |
| Severity | Critical |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Open `/clients/<id>/notes` | Notes page with privacy notice loads |
| 2 | Type "Smoke test note" and click **Save note** | Green "Note saved."; note appears at top of history |
| 3 | Refresh page | Note persists |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SMK-006 — Sign out (Critical path)

| Field | Value |
|---|---|
| Test Case ID | SMK-006 |
| Module | Auth |
| Feature | Sign out |
| Story ID | E10-S01 |
| Priority | P1 |
| Severity | Medium |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Click **Sign out** in sidebar | Returns to `/auth` |
| 2 | Navigate to `/dashboard` | Redirected to `/auth` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## Smoke Test Log

| Date | Run by | SMK-001 | SMK-002 | SMK-003 | SMK-004 | SMK-005 | SMK-006 | Overall |
|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |
