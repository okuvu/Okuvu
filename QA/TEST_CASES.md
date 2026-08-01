# Evia Therapist Portal — Functional Test Cases

**Test Case ID scheme:** `F-<screen>-<nnn>` where screen is `AUTH`, `DASH`, `CLNT` (client overview), `PROG` (care plan), `NOTE` (session notes), `NAV` (routing/navigation), `NET` (network), `SESSION` (session/refresh/duplicate).

**Priority:** P0 = must pass before beta; P1 = important; P2 = cosmetic/deferred.
**Severity:** Critical / High / Medium / Low.

> **How to run:** Start the portal (`cd apps/therapist-portal && pnpm dev` → http://localhost:3000). Seed data per `TEST_PLAN.md` §6. Record your result in the blank **Actual result / Status** cell. Blank cells are for the tester.

---

## T-00 — Login (E10-S01)

### F-AUTH-001 — Authorized Google account logs in and reaches dashboard

| Field | Value |
|---|---|
| Test Case ID | F-AUTH-001 |
| Module | Authentication |
| Feature | T-00 Login — Google OAuth |
| Story ID | E10-S01 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm an allowlisted therapist Google account can authenticate and reach the dashboard. |
| Requirement Reference | E10-S01 FR-1, FR-2; AC-1 |
| Preconditions | `LOCAL_DEV_BYPASS_AUTH` not `true`. `qa.therapist@example.com` exists in `therapist` table. Portal running. |
| Test Data | Google account `qa.therapist@example.com` |
| Environment | Local dev (http://localhost:3000) |
| Browser | Chrome (latest) |
| Device | Desktop 1440×900 |
| Post Conditions | Authenticated session established |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Open `http://localhost:3000` | Redirected to `/auth` (login screen) with "Sign in to Evia" and "Continue with Google" button |
| 2 | Click **Continue with Google** | Google account chooser appears |
| 3 | Select/enter `qa.therapist@example.com` and complete sign-in | Redirected back; lands on `/dashboard` |
| 4 | Confirm page shows a greeting and "You have N active clients" | Greeting shown: "Good morning/afternoon/evening, <name>." with client count matching seed data |

| Actual result / Status | |
|---|---|

---

### F-AUTH-002 — Unauthorized Google account is rejected after OAuth

| Field | Value |
|---|---|
| Test Case ID | F-AUTH-002 |
| Module | Authentication |
| Feature | T-00 Login — allowlist enforcement |
| Story ID | E10-S01 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm a Google account NOT in the `therapist` table is rejected after successful Google OAuth. |
| Requirement Reference | E10-S01 FR-4, AC-2, Edge case; `docs/therapist-portal-oauth-setup.md` |
| Preconditions | `LOCAL_DEV_BYPASS_AUTH` not `true`. `unauthorized@gmail.com` is NOT in `therapist` table. |
| Test Data | Google account `unauthorized@gmail.com` |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Open `http://localhost:3000` | Redirected to `/auth` |
| 2 | Click **Continue with Google**, sign in as `unauthorized@gmail.com` | Redirected back to `/auth?error=unauthorized` |
| 3 | Observe error banner | Banner shown: "Your account is not yet set up on Evia. Please contact your administrator." |
| 4 | Confirm no dashboard access | Stays on `/auth`; no redirect to `/dashboard`; navigating to `/dashboard` manually redirects back to `/auth` |

| Actual result / Status | |
|---|---|

---

### F-AUTH-003 — Cancelled OAuth returns cleanly to login

| Field | Value |
|---|---|
| Test Case ID | F-AUTH-003 |
| Module | Authentication |
| Feature | T-00 Login — OAuth cancellation |
| Story ID | E10-S01 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm cancelling the Google flow mid-way returns to a usable login screen, not an error page. |
| Requirement Reference | E10-S01 Edge case, QA edge-case test |
| Preconditions | OAuth enabled (not bypass). |
| Test Data | Any Google account |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Open `/auth`, click **Continue with Google** | Account chooser appears |
| 2 | Cancel/close the chooser (Esc or Cancel) | Returns to `/auth` login screen with "Sign-in was cancelled. Please try again." (or a clean login screen), not a broken/error page |
| 3 | Confirm the "Continue with Google" button still works | Clicking it again reopens the chooser |

| Actual result / Status | |
|---|---|

---

### F-AUTH-004 — Server error during sign-in returns error message

| Field | Value |
|---|---|
| Test Case ID | F-AUTH-004 |
| Module | Authentication |
| Feature | T-00 Login — server error path |
| Story ID | E10-S01 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm DB failure during sign-in shows a clear server-error message. |
| Requirement Reference | E10-S01 Error Handling |
| Preconditions | OAuth enabled. Temporarily point `DATABASE_URL` at an unreachable DB (or stop the DB). |
| Test Data | Allowlisted account |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | With DB down, sign in with an allowlisted Google account | Redirected to `/auth?error=server_error` |
| 2 | Observe banner | "A server error occurred. Please try again." |
| 3 | Restore DB, repeat sign-in | Login succeeds normally |

| Actual result / Status | |
|---|---|

---

### F-AUTH-005 — Sign out returns to login

| Field | Value |
|---|---|
| Test Case ID | F-AUTH-005 |
| Module | Authentication |
| Feature | Sign out |
| Story ID | E10-S01 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm sign-out ends the session and returns to the login screen. |
| Requirement Reference | E10-S01 FR-2 (session establishment), portal sidebar behavior |
| Preconditions | Logged in as `qa.therapist@example.com` |
| Test Data | — |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | On the dashboard, click **Sign out** in the bottom-left sidebar | Redirected to `/auth` |
| 2 | Navigate to `/dashboard` manually | Redirected back to `/auth` (session ended) |

| Actual result / Status | |
|---|---|

---

## T-01 — Dashboard (E10-S03, E10-S04)

### F-DASH-001 — Dashboard shows assigned clients with summary fields

| Field | Value |
|---|---|
| Test Case ID | F-DASH-001 |
| Module | Dashboard |
| Feature | T-01 Dashboard — client list |
| Story ID | E10-S03, E10-S04 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm the dashboard renders the therapist's assigned clients with the summary fields from `clients.list`. |
| Requirement Reference | E10-S03 FR-1, FR-2; E10-S04 FR-1 |
| Preconditions | Logged in as Therapist A (3 assigned clients: CP1 confirmed, CP2 provisional, none). |
| Test Data | Fixtures per TEST_PLAN §6.2 |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop 1440×900 |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Log in as Therapist A, land on `/dashboard` | Header shows greeting and "You have 3 active clients." |
| 2 | Inspect the **Active clients** table | 3 rows; columns: Client, Care Plan, Status, Last Session, Safety, Actions |
| 3 | Verify Client 1 (CP1 confirmed) | Care Plan badge "Anxiety & Worry" (green `#E8F5EE` bg); Status badge "Confirmed" |
| 4 | Verify Client 2 (CP2 provisional) | Care Plan badge "Low Mood" (blue `#EEF2FF`); Status badge "Provisional" (amber) |
| 5 | Verify Client 3 (no care plan) | Care Plan column shows `—`; Status column shows `—` |
| 6 | Verify the Client column shows masked phone number | Format `••• ••• 1234` (last 4 digits visible) |
| 7 | Verify Last Session column | Shows "Today" / "Yesterday" / "N days ago" or a date per `formatLastSession`; "No sessions yet" equivalent (`—`) if none |
| 8 | Verify Safety column | Client 3 (S3) shows red "Review" pill + red left border on row; Client 2 (S2) shows amber dot; Client 1 (S0) shows no indicator |

| Actual result / Status | |
|---|---|

---

### F-DASH-002 — Empty caseload shows empty state

| Field | Value |
|---|---|
| Test Case ID | F-DASH-002 |
| Module | Dashboard |
| Feature | T-01 Dashboard — empty state |
| Story ID | E10-S03 (edge case), E10-S04 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm a therapist with zero assigned clients sees a clean empty state. |
| Requirement Reference | E10-S03 Edge case "zero assigned clients" |
| Preconditions | Therapist B has no assignments (temporarily remove). |
| Test Data | Therapist with no `TherapistClient` rows |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Log in as a therapist with zero assignments | Header: "You have 0 active clients." |
| 2 | Inspect the Active clients section | "No clients assigned yet." + "Clients assigned to you will appear here." — no error, no crash |

| Actual result / Status | |
|---|---|

---

### F-DASH-003 — Navigate from dashboard to client overview

| Field | Value |
|---|---|
| Test Case ID | F-DASH-003 |
| Module | Dashboard |
| Feature | T-01 → T-02 navigation |
| Story ID | E10-S04 FR-3 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm clicking a client row's phone or View link opens that client's overview page. |
| Requirement Reference | E10-S04 FR-3 |
| Preconditions | Logged in as Therapist A with clients. |
| Test Data | Client 1 ID |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | On the dashboard, click the masked phone number of Client 1 | Navigates to `/clients/<id>` showing that client's overview |
| 2 | Go back to dashboard, click **View →** for Client 1 | Same navigation, same page |

| Actual result / Status | |
|---|---|

---

### F-DASH-004 — Dashboard loading skeleton

| Field | Value |
|---|---|
| Test Case ID | F-DASH-004 |
| Module | Dashboard |
| Feature | T-01 Dashboard — loading state |
| Story ID | E10-S04 |
| Priority | P2 |
| Severity | Low |
| Objective | Confirm a loading skeleton appears while data is fetched. |
| Requirement Reference | E10-S04 FR (render client list) |
| Preconditions | Logged in; simulate latency (throttle network in DevTools). |
| Test Data | — |
| Environment | Local dev, Chrome DevTools network throttle |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Throttle to Slow 3G, load `/dashboard` | Grey skeleton bars (greeting + table rows) shown while loading, replaced by data |
| 2 | Confirm no blank screen during load | Skeleton visible, not blank |

| Actual result / Status | |
|---|---|

---

### F-DASH-005 — Dashboard error state with Retry

| Field | Value |
|---|---|
| Test Case ID | F-DASH-005 |
| Module | Dashboard |
| Feature | T-01 Dashboard — error/retry |
| Story ID | E10-S04 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm a failed `clients.list` call shows an error card with a working Retry button. |
| Requirement Reference | E10-S04 error handling |
| Preconditions | Logged in; then stop the portal DB (or break `DATABASE_URL` via tRPC context) so the query fails. |
| Test Data | — |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | With DB unavailable, load `/dashboard` | Error card: "Couldn't load your caseload" + message + **Retry** button |
| 2 | Restore DB, click **Retry** | Table loads successfully |

| Actual result / Status | |
|---|---|

---

## T-02 — Client Overview (E10-S05, E10-S06)

### F-CLNT-001 — Client overview renders all fields

| Field | Value |
|---|---|
| Test Case ID | F-CLNT-001 |
| Module | Client Overview |
| Feature | T-02 Client Overview |
| Story ID | E10-S05, E10-S06 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm the client overview page renders care plan, assignment state, reasoning note, session summary, and safety state. |
| Requirement Reference | E10-S05 FR-1..FR-3; E10-S06 FR-1..FR-3 |
| Preconditions | Logged in as Therapist A; Client 1 has confirmed CP1 + COMPLETED summary + S0. |
| Test Data | Client 1 fixture |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/clients/<client1-id>` | Breadcrumb: Dashboard / User #XXXX. Page title is the masked user label (`User #ABCD`-style from `formatClientLabel`) |
| 2 | Inspect **CLIENT OVERVIEW** card | Phone shown masked; Safety state shown as "Stable (S0)" with green dot |
| 3 | Inspect **CARE PLAN** card | Plan name "Anxiety & Worry"; Assignment state badge "Confirmed" (green); "Manage →" link points to `/clients/<id>/program` |
| 4 | Expand "What does confirmed mean?" `<details>` | Green info box: confirmed assignment reviewed and set by therapist; system will not change automatically |
| 5 | Inspect **Clinical reasoning** card | Reasoning note text shown; subtitle "Therapist only — never shown to the client." |
| 6 | Inspect **LATEST SESSION SUMMARY** card | Summary text rendered; "Session ID: <uuid>" shown below |
| 7 | Confirm **View and add session notes →** link | Points to `/clients/<id>/notes`; subtitle "Notes are private and never read by the AI." |

| Actual result / Status | |
|---|---|

---

### F-CLNT-002 — Provisional assignment shown distinctly

| Field | Value |
|---|---|
| Test Case ID | F-CLNT-002 |
| Module | Client Overview |
| Feature | T-02 — provisional vs confirmed |
| Story ID | E10-S06 Edge case, E10-S05 |
| Priority | P0 |
| Severity | High |
| Objective | Confirm a provisional assignment is visually distinct and clearly communicated as provisional. |
| Requirement Reference | E10-S05 AC-2; E10-S06 Edge case, Design.md §0 |
| Preconditions | Client 2 has provisional CP2. |
| Test Data | Client 2 fixture |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/clients/<client2-id>` | Care plan "Low Mood & Depression"; badge "Provisional" (amber `#FEF3E2`/`#E8A020`) — visually distinct from Confirmed |
| 2 | Expand "What does provisional mean?" | Amber info box: system-suggested, not yet reviewed/confirmed by a therapist; therapist should review and confirm |
| 3 | Confirm reasoning note still shown | Reasoning note card present |

| Actual result / Status | |
|---|---|

---

### F-CLNT-003 — No session summary yet — honest empty state

| Field | Value |
|---|---|
| Test Case ID | F-CLNT-003 |
| Module | Client Overview |
| Feature | T-02 — missing summary state |
| Story ID | E10-S05 FR-2, Edge case; E10-S06 Edge case |
| Priority | P0 |
| Severity | High |
| Objective | Confirm a client with no available summary shows a clear "no summary yet" state, not stale/fabricated data. |
| Requirement Reference | E10-S05 AC-2; E10-S06 AC-3 |
| Preconditions | Client with latest `SessionSummary.status` = `FAILED` or `SKIPPED_TRIVIAL` (or none). |
| Test Data | Client 2 fixture (summary not COMPLETED) |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/clients/<client2-id>` | Latest summary card shows "No session summary available yet. Summaries are generated after each session." |
| 2 | Confirm no fake summary text is displayed | No summary body; message is clearly an empty-state, not a placeholder that looks like real content |

| Actual result / Status | |
|---|---|

---

### F-CLNT-004 — No care plan at all

| Field | Value |
|---|---|
| Test Case ID | F-CLNT-004 |
| Module | Client Overview |
| Feature | T-02 — no care plan |
| Story ID | E10-S05, E10-S06 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm a client with no `ClinicalConfig` shows "No care plan assigned yet." |
| Requirement Reference | E10-S05 edge case (provisional / missing) |
| Preconditions | Client 3 has no ClinicalConfig row. |
| Test Data | Client 3 fixture |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/clients/<client3-id>` | CARE PLAN card shows "No care plan assigned yet." |
| 2 | Confirm no "What does … mean?" expander renders | Absent because assignment_state is null |

| Actual result / Status | |
|---|---|

---

### F-CLNT-005 — Safety state S3/S4 shows red "Review required"

| Field | Value |
|---|---|
| Test Case ID | F-CLNT-005 |
| Module | Client Overview |
| Feature | T-02 — safety state |
| Story ID | E10-S05 FR-3 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm higher safety states render correctly on the overview. |
| Requirement Reference | E10-S05 FR-3; Design.md §2.1 badge.red |
| Preconditions | Client 3 safety S3. |
| Test Data | Client 3 fixture |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/clients/<client3-id>` | Safety state shown as "High (S3)" in red text with red dot |
| 2 | (If fixture allows) verify S4 | "Critical (S4)" in red |

| Actual result / Status | |
|---|---|

---

### F-CLNT-006 — Client overview error state

| Field | Value |
|---|---|
| Test Case ID | F-CLNT-006 |
| Module | Client Overview |
| Feature | T-02 — error state |
| Story ID | E10-S06 Error Handling |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm the overview shows a clear error state when the detail procedure fails. |
| Requirement Reference | E10-S06 Error Handling |
| Preconditions | Logged in; DB unavailable so `clients.detail` fails. |
| Test Data | — |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | With DB down, navigate to `/clients/<client1-id>` | "Could not load client details." + "Please refresh and try again." — not a blank screen |

| Actual result / Status | |
|---|---|

---

## T-03 — Care Plan / Program Evia (E11-S01, E11-S02)

### F-PROG-001 — Program page shows current care plan

| Field | Value |
|---|---|
| Test Case ID | F-PROG-001 |
| Module | Care Plan |
| Feature | T-03 Program Evia |
| Story ID | E11-S01, E11-S02 |
| Priority | P0 |
| Severity | High |
| Objective | Confirm the program page displays the client's current care plan and assignment badge. |
| Requirement Reference | E11-S02 FR-1 |
| Preconditions | Logged in as Therapist A; Client 1 confirmed CP1. |
| Test Data | Client 1 fixture |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/clients/<client1-id>/program` | Header "Program Evia"; breadcrumb Dashboard / User #XXXX / Program Evia |
| 2 | Inspect **CURRENT CARE PLAN** | "Anxiety & Worry (CP1)" or "Anxiety & Worry" + "Assigned on <date>" + badge "Confirmed by therapist" |
| 3 | Inspect **Change care plan** dropdown | Shows exactly 3 options: Anxiety & Worry (CP1), Low Mood & Depression (CP2), Stress & Burnout (CP3) — no CP4–CP10 |
| 4 | Confirm dropdown shows current value | Select shows CP1 (current value), not a blank placeholder |

| Actual result / Status | |
|---|---|

---

### F-PROG-002 — Change care plan and confirm

| Field | Value |
|---|---|
| Test Case ID | F-PROG-002 |
| Module | Care Plan |
| Feature | T-03 — save care plan |
| Story ID | E11-S01, E11-S02 |
| Priority | P0 |
| Severity | High |
| Objective | Confirm a therapist can change a client's care plan and receives a clear confirmation. |
| Requirement Reference | E11-S01 FR-1, FR-2; E11-S02 FR-3, FR-4 |
| Preconditions | Logged in as Therapist A; Client 1 confirmed CP1. |
| Test Data | Change to CP2 |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | On `/clients/<client1-id>/program`, select **Low Mood & Depression (CP2)** in the dropdown | Selection updates |
| 2 | Click **Save care plan** | Button shows "Saving…" then a green toast "✓ Care plan saved" appears at top; toast disappears after ~3s |
| 3 | Confirm the CURRENT CARE PLAN section updates | Shows CP2 name and badge "Confirmed by therapist" |
| 4 | Navigate to `/clients/<client1-id>` (T-02) | Care plan now shows "Low Mood & Depression" with Confirmed badge |

| Actual result / Status | |
|---|---|

---

### F-PROG-003 — Re-save the same care plan (no-op)

| Field | Value |
|---|---|
| Test Case ID | F-PROG-003 |
| Module | Care Plan |
| Feature | T-03 — no-op save |
| Story ID | E11-S01 Edge case |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm selecting the current care plan and saving succeeds cleanly (no error). |
| Requirement Reference | E11-S01 Edge case, AC-3 |
| Preconditions | Client currently CP2. |
| Test Data | Keep CP2 selected |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | On program page, ensure dropdown is on current CP2, click **Save care plan** | Success toast shown; no error; state stays CP2/confirmed |

| Actual result / Status | |
|---|---|

---

### F-PROG-004 — Save failure shows error, no false success

| Field | Value |
|---|---|
| Test Case ID | F-PROG-004 |
| Module | Care Plan |
| Feature | T-03 — save failure |
| Story ID | E11-S02 Edge case, Error Handling |
| Priority | P0 |
| Severity | High |
| Objective | Confirm a failed save shows a clear error and does NOT imply success. |
| Requirement Reference | E11-S02 AC-2, Edge case |
| Preconditions | Logged in; DB down before saving (or network interrupted). |
| Test Data | Change CP2→CP3 |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | With DB down, select CP3 and click **Save care plan** | Red error toast appears with the error message (e.g. "Failed to save care plan. Please try again." or tRPC message) |
| 2 | Confirm no green success toast is shown | Success toast absent |
| 3 | Restore DB, save again | Succeeds with green toast |

| Actual result / Status | |
|---|---|

---

### F-PROG-005 — Cancel returns to client overview

| Field | Value |
|---|---|
| Test Case ID | F-PROG-005 |
| Module | Care Plan |
| Feature | T-03 — cancel navigation |
| Story ID | E11-S02 |
| Priority | P2 |
| Severity | Low |
| Objective | Confirm Cancel returns to the client overview without saving. |
| Requirement Reference | E11-S02 |
| Preconditions | Logged in; Client 1 at CP2. |
| Test Data | Change selection, then Cancel |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | On program page, select CP3 (unsaved), click **Cancel** | Returns to `/clients/<id>`; care plan still CP2 |

| Actual result / Status | |
|---|---|

---

## T-05 — Session Notes (E11-S03, E11-S04)

### F-NOTE-001 — Empty notes state

| Field | Value |
|---|---|
| Test Case ID | F-NOTE-001 |
| Module | Session Notes |
| Feature | T-05 — empty list |
| Story ID | E11-S04 Edge case |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm a client with no notes shows a clean empty state. |
| Requirement Reference | E11-S04 AC-3, Edge case |
| Preconditions | Client 3 has no TherapistNote rows. |
| Test Data | Client 3 fixture |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/clients/<client3-id>/notes` | Privacy notice box visible: notes stored securely, never read by the AI |
| 2 | Inspect **NOTE HISTORY** | "No notes yet." + "Notes you add below will appear here." |
| 3 | Inspect **ADD A NOTE** form | Textarea with placeholder "Enter your session notes here..." and disabled **Save note** button |

| Actual result / Status | |
|---|---|

---

### F-NOTE-002 — Add a note and see it in the list

| Field | Value |
|---|---|
| Test Case ID | F-NOTE-002 |
| Module | Session Notes |
| Feature | T-05 — add note |
| Story ID | E11-S03 FR-1, FR-2; E11-S04 FR-2, FR-3 |
| Priority | P0 |
| Severity | High |
| Objective | Confirm a note can be added, appears immediately in the list, and is persisted. |
| Requirement Reference | E11-S03 AC-1; E11-S04 AC-2 |
| Preconditions | Logged in as Therapist A; Client 3 assigned; on `/clients/<client3-id>/notes`. |
| Test Data | Note text: "Client reported improved sleep this week." |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Type "Client reported improved sleep this week." in the textarea | Button becomes enabled |
| 2 | Click **Save note** | Button shows "Saving…"; green "Note saved." message appears |
| 3 | Confirm the note appears in NOTE HISTORY | New note at top with relative timestamp ("Just now") and author name |
| 4 | Confirm the textarea is cleared | Textarea empty; draft storage cleared |
| 5 | Refresh the page (`F5`) | Note still present in history (persisted) |

| Actual result / Status | |
|---|---|

---

### F-NOTE-003 — Empty note rejected, draft preserved

| Field | Value |
|---|---|
| Test Case ID | F-NOTE-003 |
| Module | Session Notes |
| Feature | T-05 — validation |
| Story ID | E11-S03 Edge case, FR-2; E11-S04 Edge case |
| Priority | P0 |
| Severity | High |
| Objective | Confirm an empty/whitespace-only note is rejected with a clear error and the draft is not lost. |
| Requirement Reference | E11-S03 AC (empty rejected); E11-S04 Edge case |
| Preconditions | On notes page for Client 3. |
| Test Data | Empty string; then "   " (whitespace) |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | With empty textarea, click **Save note** | Button is disabled (no click possible) — expected UI guard |
| 2 | Type spaces only "   " | Button still disabled (trimmed value empty) |
| 3 | Type "partial note" (do NOT save), click away | Draft preserved in textarea; no error |
| 4 | Type only whitespace "  " then attempt save if enabled | If savable, validation error "Note cannot be empty." shown and input not silently cleared |

| Actual result / Status | |
|---|---|

---

### F-NOTE-004 — Draft preserved across refresh (sessionStorage)

| Field | Value |
|---|---|
| Test Case ID | F-NOTE-004 |
| Module | Session Notes |
| Feature | T-05 — draft persistence |
| Story ID | E11-S04 (draft preservation) |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm unsaved draft text survives a refresh via sessionStorage. |
| Requirement Reference | E11-S04 "draft input preserved" |
| Preconditions | On notes page for Client 3. |
| Test Data | Draft text "Draft note in progress" |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Type "Draft note in progress" in the textarea (do not save) | Text present |
| 2 | Press F5 / reload the page | Draft text restored in the textarea |
| 3 | Save the note | Draft removed from sessionStorage; textarea cleared |

| Actual result / Status | |
|---|---|

> Note: draft persistence relies on `sessionStorage` keyed `note-draft-<clientId>` (`notes/page.tsx`). If the audit report's earlier concern (React-state-only draft) still applies to your build, verify and log in BUG_CANDIDATES.md.

---

### F-NOTE-005 — Notes list error state

| Field | Value |
|---|---|
| Test Case ID | F-NOTE-005 |
| Module | Session Notes |
| Feature | T-05 — list error |
| Story ID | E11-S04 Error Handling |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm a failed `listNotes` call shows a clear error, not a blank screen. |
| Requirement Reference | E11-S04 "List fetch failure: clear error/retry state" |
| Preconditions | DB down. |
| Test Data | — |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | With DB down, open `/clients/<client3-id>/notes` | NOTE HISTORY shows "Could not load notes. Please refresh and try again." |
| 2 | Restore DB, refresh | Notes load |

| Actual result / Status | |
|---|---|

---

### F-NOTE-006 — Add-note save failure shows error and preserves draft

| Field | Value |
|---|---|
| Test Case ID | F-NOTE-006 |
| Module | Session Notes |
| Feature | T-05 — save failure |
| Story ID | E11-S04 Edge case |
| Priority | P0 |
| Severity | High |
| Objective | Confirm a failed note save shows an error and does not clear the draft. |
| Requirement Reference | E11-S04 "Save failure: clear error, draft input preserved" |
| Preconditions | On notes page; DB down. |
| Test Data | Note text "Important note" |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | With DB down, type "Important note", click **Save note** | Red error message appears (tRPC error message, e.g. "Therapist not found"/"Database not configured" or generic "Could not save note.") |
| 2 | Confirm draft still present | Textarea still contains "Important note" |

| Actual result / Status | |
|---|---|

---

### F-NOTE-007 — Note author shown on each entry

| Field | Value |
|---|---|
| Test Case ID | F-NOTE-007 |
| Module | Session Notes |
| Feature | T-05 — author display |
| Story ID | E11-S03 FR-2, E11-S04 FR-1 |
| Priority | P2 |
| Severity | Low |
| Objective | Confirm each note shows its authoring therapist name and timestamp. |
| Requirement Reference | E11-S04 FR-1 |
| Preconditions | Two notes exist, written by therapists with names set. |
| Test Data | Notes by Therapist A and Therapist B |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Open `/clients/<id>/notes` with ≥1 note | Each note shows timestamp (relative like "5m ago" or date) and author name (e.g. "QA Therapist") separated by `·` |
| 2 | If a therapist has no name | Author segment omitted (no dangling dot) |

| Actual result / Status | |
|---|---|

---

## Routing / Navigation

### F-NAV-001 — Unauthenticated access redirects to login

| Field | Value |
|---|---|
| Test Case ID | F-NAV-001 |
| Module | Routing |
| Feature | Route guard (`proxy.ts`) |
| Story ID | E10-S01 FR-3 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm unauthenticated access to any portal route redirects to `/auth`. |
| Requirement Reference | E10-S01 FR-3 |
| Preconditions | Logged out; bypass disabled. |
| Test Data | Routes: `/`, `/dashboard`, `/clients/anything` |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Open `/dashboard` while logged out | Redirected to `/auth` |
| 2 | Open `/clients/123e4567-e89b-12d3-a456-426614174000` while logged out | Redirected to `/auth` |
| 3 | Open `/` while logged out | Redirects through `/dashboard` → `/auth` |
| 4 | Open `/auth` while logged out | Login screen renders (public route) |

| Actual result / Status | |
|---|---|

---

### F-NAV-002 — Authenticated user on /auth is sent to dashboard

| Field | Value |
|---|---|
| Test Case ID | F-NAV-002 |
| Module | Routing |
| Feature | Route guard |
| Story ID | E10-S01 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm an already-authenticated user visiting `/auth` is redirected to `/`. |
| Requirement Reference | E10-S01; proxy behavior |
| Preconditions | Logged in. |
| Test Data | — |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | While logged in, navigate to `/auth` | Redirected to `/` → `/dashboard` (does not show login) |

| Actual result / Status | |
|---|---|

---

### F-NAV-003 — Sidebar navigation to assigned clients

| Field | Value |
|---|---|
| Test Case ID | F-NAV-003 |
| Module | Routing |
| Feature | Sidebar patient list |
| Story ID | E10-S04 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm the sidebar lists assigned patients and navigates to their overview. |
| Requirement Reference | E10-S04 |
| Preconditions | Logged in as Therapist A; on a `/clients/<id>` page (sidebar only lists patients on client pages). |
| Test Data | — |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Navigate to `/clients/<client1-id>` | Sidebar shows "Patients" section with masked phone numbers of assigned clients; current client highlighted |
| 2 | Click another patient | Navigates to that client's overview; highlight moves |
| 3 | Click "Dashboard" in sidebar | Returns to `/dashboard` |
| 4 | Confirm disabled items | "Schedule", "Safety Reviews", "Reports" are present but not clickable (cursor-not-allowed) |

| Actual result / Status | |
|---|---|

---

## Cross-cutting: refresh, duplicate, network

### F-NET-001 — Refresh during a save (notes)

| Field | Value |
|---|---|
| Test Case ID | F-NET-001 |
| Module | Network / reliability |
| Feature | Duplicate submission — note save |
| Story ID | E11-S04 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm double-submission of a note is prevented or handled safely. |
| Requirement Reference | E11-S04 reliability |
| Preconditions | On notes page. |
| Test Data | Note text |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Type a note, click **Save note**, immediately click again | Button is disabled while pending ("Saving…"); no duplicate note created |
| 2 | Verify in NOTE HISTORY | Exactly one copy of the note |

| Actual result / Status | |
|---|---|

---

### F-NET-002 — Refresh mid-load of client overview

| Field | Value |
|---|---|
| Test Case ID | F-NET-002 |
| Module | Network / reliability |
| Feature | Refresh handling |
| Story ID | E10-S05, E10-S06 |
| Priority | P2 |
| Severity | Low |
| Objective | Confirm refreshing the client overview reloads cleanly. |
| Requirement Reference | E10-S06 reliability |
| Preconditions | Logged in. |
| Test Data | — |
| Environment | Local dev |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Load `/clients/<client1-id>`, press F5 | Page reloads showing the same data (skeleton then content) |

| Actual result / Status | |
|---|---|

---

### F-NET-003 — Slow network on dashboard

| Field | Value |
|---|---|
| Test Case ID | F-NET-003 |
| Module | Network / reliability |
| Feature | Slow network behavior |
| Story ID | E10-S04 |
| Priority | P2 |
| Severity | Low |
| Objective | Confirm slow responses render skeletons, not frozen UI. |
| Requirement Reference | E10-S04 |
| Preconditions | Throttle network. |
| Test Data | — |
| Environment | Local dev + Chrome throttling |
| Browser | Chrome |
| Device | Desktop |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Throttle to Slow 3G, load `/dashboard` | Skeleton shows, then data renders; no unhandled error |

| Actual result / Status | |
|---|---|

---

## Test Case Summary

| ID | Screen | Genre | Priority | Status |
|---|---|---|---|---|
| F-AUTH-001 | Login | Positive | P0 | |
| F-AUTH-002 | Login | Negative / permission | P0 | |
| F-AUTH-003 | Login | Negative | P1 | |
| F-AUTH-004 | Login | API failure | P1 | |
| F-AUTH-005 | Login | Positive | P1 | |
| F-DASH-001 | Dashboard | Positive | P0 | |
| F-DASH-002 | Dashboard | Boundary (empty) | P1 | |
| F-DASH-003 | Dashboard | Positive / navigation | P0 | |
| F-DASH-004 | Dashboard | Positive (loading) | P2 | |
| F-DASH-005 | Dashboard | API failure | P1 | |
| F-CLNT-001 | Client Overview | Positive | P0 | |
| F-CLNT-002 | Client Overview | Negative / edge | P0 | |
| F-CLNT-003 | Client Overview | Edge (empty) | P0 | |
| F-CLNT-004 | Client Overview | Edge (no CP) | P1 | |
| F-CLNT-005 | Client Overview | Edge (safety) | P1 | |
| F-CLNT-006 | Client Overview | API failure | P1 | |
| F-PROG-001 | Care Plan | Positive | P0 | |
| F-PROG-002 | Care Plan | Positive | P0 | |
| F-PROG-003 | Care Plan | Duplicate/no-op | P1 | |
| F-PROG-004 | Care Plan | API failure | P0 | |
| F-PROG-005 | Care Plan | Negative | P2 | |
| F-NOTE-001 | Notes | Boundary (empty) | P1 | |
| F-NOTE-002 | Notes | Positive | P0 | |
| F-NOTE-003 | Notes | Validation | P0 | |
| F-NOTE-004 | Notes | Refresh/draft | P1 | |
| F-NOTE-005 | Notes | API failure | P1 | |
| F-NOTE-006 | Notes | API failure | P0 | |
| F-NOTE-007 | Notes | Positive | P2 | |
| F-NAV-001 | Routing | Security / positive | P0 | |
| F-NAV-002 | Routing | Negative | P1 | |
| F-NAV-003 | Routing | Positive | P1 | |
| F-NET-001 | Network | Duplicate | P1 | |
| F-NET-002 | Network | Refresh | P2 | |
| F-NET-003 | Network | Positive | P2 | |
