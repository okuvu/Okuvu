# Evia Therapist Portal — Regression Tests

**Purpose:** Verify that previously-working features still work after changes. Run the full regression suite:
- At the start of each new sprint/QA cycle.
- After any fix to auth, tRPC, dashboard, client overview, care plan, or notes.
- After dependency upgrades (Next.js, next-auth, tRPC, react-query, Prisma).
- Before the beta sign-off (Sprint 4 context, E12/E13).

Regression cases reference the original functional cases (F-*) they re-verify. All are run under the same environment as `TEST_PLAN.md`.

---

## REG-001 — Full auth round trip

| Field | Value |
|---|---|
| Test Case ID | REG-001 |
| Module | Auth |
| Feature | T-00 |
| Re-verifies | F-AUTH-001, F-AUTH-002, F-AUTH-005 |
| Priority | P0 |
| Severity | Critical |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Log in with an allowlisted Google account | Reaches `/dashboard` |
| 2 | Log in with a non-allowlisted account (separate browser/incognito) | Rejected with `?error=unauthorized` banner |
| 3 | Sign out | Returns to `/auth`; `/dashboard` redirects to `/auth` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## REG-002 — Dashboard data integrity

| Field | Value |
|---|---|
| Test Case ID | REG-002 |
| Module | Dashboard |
| Feature | T-01 |
| Re-verifies | F-DASH-001, F-DASH-002, F-DASH-003 |
| Priority | P0 |
| Severity | Critical |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Log in as Therapist A (3 clients) | Table shows exactly 3 rows with correct badges (Anxiety & Worry/Confirmed, Low Mood/Provisional, —/—) |
| 2 | Verify empty-caseload therapist (if seeded) | "No clients assigned yet." empty state |
| 3 | Click a row | Navigates to correct `/clients/<id>` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## REG-003 — Client overview renders all states

| Field | Value |
|---|---|
| Test Case ID | REG-003 |
| Module | Client Overview |
| Feature | T-02 |
| Re-verifies | F-CLNT-001..F-CLNT-006 |
| Priority | P0 |
| Severity | Critical |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Open client with confirmed CP1 + COMPLETED summary + S0 | All cards render; summary shown |
| 2 | Open client with provisional CP2 + no summary | Provisional badge distinct; "No session summary available yet" |
| 3 | Open client with no care plan | "No care plan assigned yet." |
| 4 | Open client with S3 | Red "High (S3)" safety display |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## REG-004 — Care plan change round trip

| Field | Value |
|---|---|
| Test Case ID | REG-004 |
| Module | Care Plan |
| Feature | T-03 |
| Re-verifies | F-PROG-001..F-PROG-005 |
| Priority | P0 |
| Severity | High |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Change Client 1 care plan CP1→CP2, save | Green toast; CURRENT CARE PLAN updates to CP2/Confirmed |
| 2 | Open the client overview | Care plan shows Low Mood & Depression / Confirmed |
| 3 | Save same CP2 again | No error (no-op success) |
| 4 | Change back to CP1 and save | Restores CP1/Confirmed |

**Result:** Pass / Fail / Blocked — **Notes:**

> Cleanup: after this test, restore Client 1 to CP1 so subsequent runs see the same starting state.

---

## REG-005 — Notes create + persist

| Field | Value |
|---|---|
| Test Case ID | REG-005 |
| Module | Session Notes |
| Feature | T-05 |
| Re-verifies | F-NOTE-001..F-NOTE-007 |
| Priority | P0 |
| Severity | High |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Add a note for a client | Appears immediately in list; draft cleared |
| 2 | Refresh | Note persists |
| 3 | Attempt empty/whitespace note | Validation error; draft preserved |
| 4 | Confirm note order | Newest first (reverse-chronological) |
| 5 | Verify note visible only to the authoring therapist's clients | Client overview for that client shows the note; unrelated data unaffected |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## REG-006 — Route guarding still enforced

| Field | Value |
|---|---|
| Test Case ID | REG-006 |
| Module | Routing |
| Feature | Route guard |
| Re-verifies | F-NAV-001, F-NAV-002 |
| Priority | P0 |
| Severity | Critical |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | While logged out, open `/dashboard`, `/clients/<id>`, `/clients/<id>/program`, `/clients/<id>/notes` | All redirect to `/auth` |
| 2 | While logged in, open `/auth` | Redirected to `/` → `/dashboard` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## REG-007 — tRPC API health (example router)

| Field | Value |
|---|---|
| Test Case ID | REG-007 |
| Module | tRPC |
| Feature | API layer |
| Re-verifies | API-001..API-003 |
| Priority | P1 |
| Severity | Medium |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Open `http://localhost:3000/api/trpc/example.health` | Returns JSON `{"result":{"data":{"status":"ok",...}}}` |
| 2 | Call `example.getMe` unauthenticated | Returns UNAUTHORIZED (JSON error, code UNAUTHORIZED) |
| 3 | Call `example.getMe` authenticated (via app logs or a logged-in page) | Returns the session user id/email/name |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## REG-008 — Bypass mode does not leak into production behavior

| Field | Value |
|---|---|
| Test Case ID | REG-008 |
| Module | Config |
| Feature | LOCAL_DEV_BYPASS_AUTH |
| Re-verifies | Security suite |
| Priority | P0 |
| Severity | High |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Verify `apps/api/src/lib/check-production-bypass.ts` guards production | API refuses to start in `NODE_ENV=production` if `LOCAL_DEV_BYPASS_AUTH=true` or `LOAD_TEST_MODE=true` |
| 2 | Verify portal env | `LOCAL_DEV_BYPASS_AUTH` must not be `true` in any deployed/cloud config (checked at review; confirm current env) |
| 3 | Confirm no committed `.env` values | `git grep` shows no real secrets committed |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## REG-009 — No regression on legacy components

| Field | Value |
|---|---|
| Test Case ID | REG-009 |
| Module | Code health |
| Feature | Dead-code check |
| Re-verifies | BUG_CANDIDATES.md notes |
| Priority | P2 |
| Severity | Low |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Grep for imports of `ClientList`, `ClientRow`, `SignOutButton`, `PageHeader` | No active page imports them (they are legacy/unused) — dashboard uses `ClientTable`/`DashboardContent` |
| 2 | If any component is still imported somewhere | Flag as a possible regression/discrepancy |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## Regression Log

| Date | Build/Commit | REG-001 | REG-002 | REG-003 | REG-004 | REG-005 | REG-006 | REG-007 | REG-008 | REG-009 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |  |  |  |
