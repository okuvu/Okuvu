# Evia Therapist Portal — Edge Cases

**Purpose:** Collect the boundary and edge scenarios from the sprint specs, the code, and the design doc that don't fit neatly into the happy-path suites. Each entry gives the trigger, the expected behavior (verified against code/spec where possible), and where the canonical test lives.

---

## Edge Case Index

| ID | Area | Scenario | Priority |
|---|---|---|---|
| EDGE-001 | Auth | Google OAuth succeeds but account not allowlisted | P0 |
| EDGE-002 | Auth | User cancels OAuth flow | P1 |
| EDGE-003 | Auth | DB down during sign-in | P1 |
| EDGE-004 | Dashboard | Zero assigned clients | P1 |
| EDGE-005 | Dashboard | Client with no care plan assigned (null ClinicalConfig) | P0 |
| EDGE-006 | Dashboard | Client with provisional assignment | P0 |
| EDGE-007 | Dashboard | Client with no sessions (lastSessionDate null) | P1 |
| EDGE-008 | Client overview | Latest summary FAILED | P0 |
| EDGE-009 | Client overview | Latest summary SKIPPED_TRIVIAL | P0 |
| EDGE-010 | Client overview | Latest summary PENDING (generating) | P1 |
| EDGE-011 | Client overview | No session summary rows at all | P0 |
| EDGE-012 | Client overview | Safety state S2 (amber dot) | P1 |
| EDGE-013 | Client overview | Safety state S3/S4 (review required) | P0 |
| EDGE-014 | Client overview | Unknown client id (malformed / not-found) | P1 |
| EDGE-015 | Care plan | Save same plan again (no-op) | P1 |
| EDGE-016 | Care plan | Save fails (network/DB) — no false success | P0 |
| EDGE-017 | Care plan | Invalid care plan id (CP4) via API | P0 |
| EDGE-018 | Notes | Empty / whitespace-only note | P0 |
| EDGE-019 | Notes | Draft preserved on refresh and save-failure | P0 |
| EDGE-020 | Notes | Duplicate save (double click) | P1 |
| EDGE-021 | Notes | Very long note (boundary) | P2 |
| EDGE-022 | Notes | Note author has no name | P2 |
| EDGE-023 | Routing | Unauthenticated deep link to client pages | P0 |
| EDGE-024 | Routing | Authenticated user opens /auth | P1 |
| EDGE-025 | Session | Session expires mid-use | P1 |
| EDGE-026 | Network | Server down / offline during a page load | P1 |
| EDGE-027 | Data | Client phone number shorter than 4 digits (maskPhone) | P2 |
| EDGE-028 | Data | Session summary session_id present but status not available | P1 |

---

## EDGE-001 — Google OAuth succeeds but account not allowlisted

- **Trigger:** Sign in with a valid Google account not in the `therapist` table.
- **Expected:** Redirect to `/auth?error=unauthorized`; banner "Your account is not yet set up on Evia…"; no portal access.
- **Code:** `auth.ts:33-41` (`therapist.findUnique` → `'/auth?error=unauthorized'`).
- **Canonical test:** F-AUTH-002, SEC-001.

---

## EDGE-002 — User cancels OAuth flow

- **Trigger:** Close the Google chooser mid-flow.
- **Expected:** Clean return to `/auth`; "Sign-in was cancelled. Please try again." message; button still functional.
- **Code:** `auth/page.tsx:21-26` handles `OAuthSignin`/`OAuthCallback` errors.
- **Canonical test:** F-AUTH-003.

---

## EDGE-003 — DB down during sign-in

- **Trigger:** `DATABASE_URL` unreachable while a user signs in.
- **Expected:** `/auth?error=server_error` + "A server error occurred. Please try again."; access denied.
- **Code:** `auth.ts:42-45` (`server_error` on throw).
- **Canonical test:** F-AUTH-004, SEC-003.

---

## EDGE-004 — Zero assigned clients

- **Trigger:** Therapist with no `TherapistClient` rows.
- **Expected:** "You have 0 active clients." + empty state card; no error.
- **Code:** `clients.list` returns `[]`; `ClientTable` empty branch.
- **Canonical test:** F-DASH-002, API-007.

---

## EDGE-005 — Client with no care plan (null ClinicalConfig)

- **Trigger:** A `User` with no `clinical_config` relation.
- **Expected dashboard:** Care plan column `—`; status `—`.
- **Expected overview:** "No care plan assigned yet."; no "What does … mean?" expander.
- **Expected program page:** defaults `care_plan_id:"CP1"`, `assignment_state:"provisional"`, no `Assigned on` date (`getCarePlan` fallback).
- **Code:** `clients.ts:204-207` (fallback defaults), `clients/[id]/page.tsx:216-218`.
- **Canonical tests:** F-DASH-001, F-CLNT-004, API-014.

> ⚠️ **Note for BUG_CANDIDATES:** the T-03 program page defaults an unconfigured client to **CP1/provisional** and shows it as the current plan. The T-03 spec (`E11-S02 FR-1`) says render "the client's current care plan state" — showing CP1 as *current* for a client with no plan may be misleading. Confirm intended behavior.

---

## EDGE-006 — Provisional assignment

- **Trigger:** `assignment_state = 'provisional'`.
- **Expected:** Distinct amber badge ("Provisional") on dashboard + overview; honest explanation expander; detail API returns `provisional` (never silently `confirmed`).
- **Code:** `ClientTable.tsx` STATUS_STYLES, `page.tsx` StatusBadge, `clients.ts` detail passthrough.
- **Canonical tests:** F-CLNT-002, API-010, UI-003.

---

## EDGE-007 — Client with no sessions

- **Trigger:** No `SessionLog` rows.
- **Expected dashboard:** Last Session shows `—` (em dash).
- **Code:** `ClientTable.tsx:5-6` `formatLastSession(null)` → `—`.
- **Canonical test:** F-DASH-001.

---

## EDGE-008 — Latest summary FAILED

- **Trigger:** Most recent `SessionSummary.status = 'FAILED'`.
- **Expected API:** `summary.status = 'not_available_yet'`.
- **Expected UI:** "No session summary available yet…" message.
- **Code:** `clients.ts:164-165`.
- **Canonical tests:** F-CLNT-003, API-011.
- **Cross-check:** Also confirm the overview page does NOT attempt to format the `session_id` as a date here (see EDGE-028).

---

## EDGE-009 — Latest summary SKIPPED_TRIVIAL

- **Trigger:** `SessionSummary.status = 'SKIPPED_TRIVIAL'` (short/trivial sessions per E7-S03 design).
- **Expected API:** `not_available_yet`.
- **Expected UI:** "No session summary available yet…".
- **Code:** `clients.ts:166-167`.
- **Canonical tests:** F-CLNT-003, API-011.

---

## EDGE-010 — Latest summary PENDING (generating)

- **Trigger:** `SessionSummary.status = 'PENDING'` (async pipeline in progress).
- **Expected API:** `summary.status = 'generating'`.
- **Expected UI:** Amber pulsing dot + "Summary is being generated...".
- **Code:** `clients.ts:162-163`, `page.tsx:254-258`.
- **Canonical test:** API-011 (UI spot-check).
- **Cross-check:** On the overview page the "generating" branch must NOT render the session-id-as-date line (see EDGE-028).

---

## EDGE-011 — No session summary rows

- **Trigger:** New client, zero `SessionSummary` rows.
- **Expected API:** `summary.status = 'not_available_yet'`, `summary_text = null`, `session_id = null`.
- **Expected UI:** "No session summary available yet…".
- **Code:** `clients.ts:155,168-170`.
- **Canonical tests:** F-CLNT-003, API-011.

---

## EDGE-012 — Safety S2 (amber dot, no text)

- **Trigger:** `safetyState = 'S2'` on dashboard.
- **Expected dashboard:** Amber dot only (`ClientTable.tsx:69-71`).
- **Expected overview:** "Elevated (S2)" with text.
- **Concern:** Color-only indicator on the dashboard violates Design.md §6 (severity must not be color-only). Log in BUG_CANDIDATES.md; test documents current behavior.
- **Canonical test:** UI-009.

---

## EDGE-013 — Safety S3/S4

- **Trigger:** `safetyState = 'S3'` or `'S4'`.
- **Expected dashboard:** Red left-border row + "Review" pill + `border-l-[3px] border-l-[#C0392B]`.
- **Expected overview:** "High (S3)"/"Critical (S4)" red text + dot.
- **Code:** `ClientTable.tsx:73-80`, `page.tsx:70-85`.
- **Canonical tests:** F-CLNT-005, UI-002.

---

## EDGE-014 — Unknown / malformed client id

- **Trigger:** Navigate to `/clients/<uuid-not-in-db>`.
- **Expected:** Detail call throws `FORBIDDEN` (unassigned) if the id exists but isn't yours; if it doesn't exist, `FORBIDDEN` or `NOT_FOUND`. UI shows "Could not load client details." error card.
- **Code:** `clients.ts:133` (assertClientAssigned) runs before the `findUnique` at `:135`.
- **Canonical test:** API-013, F-CLNT-006.
- **Note:** Because the assignment check runs first, an unknown id returns `FORBIDDEN` in most cases — this is acceptable (no data leak), but record the actual code.

---

## EDGE-015 — Save the same care plan

- **Trigger:** Re-select the client's current plan and save.
- **Expected:** Success (no-op write); assignment_state remains `confirmed`; no error.
- **Code:** `clients.ts:229-245` upsert; E11-S01 edge case.
- **Canonical tests:** F-PROG-003, API-017.

---

## EDGE-016 — Care plan save fails

- **Trigger:** Network/DB failure during `setCarePlan`.
- **Expected:** Red error toast; NO green success toast; UI must not imply success.
- **Code:** `program/page.tsx:83-87` (`onError`).
- **Canonical tests:** F-PROG-004.

---

## EDGE-017 — Invalid care plan id

- **Trigger:** `carePlanId: 'CP4'` via API.
- **Expected:** Zod enum validation → `BAD_REQUEST`; no DB write.
- **Code:** `clients.ts:215` `z.enum(CARE_PLANS)`.
- **Canonical test:** API-016.

---

## EDGE-018 — Empty / whitespace-only note

- **Trigger:** Submit `""` or `"   "`.
- **Expected:** Client-side: Save button disabled when trimmed value empty. Server: zod `.trim().min(1)` → `BAD_REQUEST` "Note text must not be empty".
- **Code:** `notes/page.tsx:71-73`, `notes.ts:10`.
- **Canonical tests:** F-NOTE-003, API-023.

---

## EDGE-019 — Draft preservation

- **Trigger:** Type draft → refresh; type draft → save fails.
- **Expected:** Draft restored after refresh (sessionStorage key `note-draft-<clientId>`); preserved on save failure; cleared only on success.
- **Code:** `notes/page.tsx:37-42, 57-59, 177-180`.
- **Canonical tests:** F-NOTE-004, F-NOTE-006.
- **Audit note:** The earlier audit (M1) flagged React-state-only drafts; the current code persists to sessionStorage — verify this matches your build.

---

## EDGE-020 — Duplicate note save

- **Trigger:** Double-click "Save note".
- **Expected:** Button disabled while pending (`addNote.isPending`); exactly one note created.
- **Code:** `notes/page.tsx:184,189`.
- **Canonical test:** F-NET-001.

---

## EDGE-021 — Very long note

- **Trigger:** Paste a very long note (e.g. 10,000+ chars).
- **Expected:** Accepts (no explicit max length in `notes.ts`); renders with `whitespace-pre-wrap`; list stays usable. Record behavior; if a limit is desired, raise a spec question.
- **Code:** `notes.ts:10` (only min), `notes/page.tsx:138`.
- **Canonical test:** boundary check within F-NOTE-002.

---

## EDGE-022 — Note author with no name

- **Trigger:** A `Therapist` row with `name = null` writes a note.
- **Expected:** Author segment omitted (no dangling `·`); timestamp still shown.
- **Code:** `notes/page.tsx:144-149` guards on `note.therapist?.name`.
- **Canonical test:** F-NOTE-007.

---

## EDGE-023 — Unauthenticated deep link

- **Trigger:** Logged out, open `/clients/<uuid>/program` or `/clients/<uuid>/notes`.
- **Expected:** Redirect to `/auth` (proxy).
- **Code:** `proxy.ts:25-28`.
- **Canonical test:** F-NAV-001, SEC-004.

---

## EDGE-024 — Authenticated user opens /auth

- **Trigger:** Logged in, visit `/auth`.
- **Expected:** Redirected to `/` → `/dashboard`.
- **Code:** `proxy.ts:30-33`; also `auth/page.tsx:12-16` (client-side `router.replace('/')`).
- **Canonical test:** F-NAV-002.

---

## EDGE-025 — Session expires mid-use

- **Trigger:** Wait for JWT expiry (or clear session cookie) while on the dashboard.
- **Expected:** Next refetch fails; route navigation redirects to `/auth`; no partial stale data rendered after reload.
- **Canonical test:** SEC-012.

---

## EDGE-026 — Server down / offline

- **Trigger:** Stop the portal server (or switch to airplane mode on the browser).
- **Expected:** Graceful error states on dashboard ("Couldn't load your caseload" + Retry), client overview ("Could not load client details."), notes ("Could not load notes…"); no blank screens, no unhandled errors.
- **Canonical tests:** F-DASH-005, F-CLNT-006, F-NOTE-005, F-NET-003.

---

## EDGE-027 — Short phone number (maskPhone)

- **Trigger:** A client whose `phone_number` has fewer than 4 digits (unlikely with real phone numbers).
- **Expected:** `maskPhone` returns the raw phone unchanged when `<4` digits (`format.ts:2-4`).
- **Canonical test:** data-boundary check.

---

## EDGE-028 — Summary session_id present but status not 'available'

- **Trigger:** Latest summary is `FAILED`/`SKIPPED_TRIVIAL` (so `session_id` is set and status is `not_available_yet`).
- **Expected UI:** The overview "no summary" branch at `page.tsx:264-267` renders `Last session: {formatDateTime(data.summary?.session_id)}`. **Verify this does NOT crash.** The value passed is the session UUID, not a timestamp; `formatDateTime` calls `new Date(uuid)` → Invalid Date → `.toLocaleDateString()` throws `RangeError: Invalid time value` in some engines.
- **Code:** `clients/[id]/page.tsx:16-25` (`formatDateTime`), `:264-267` (render site), `clients.ts` summary mapping.
- **Canonical test:** F-CLNT-003 + focused render check.
- **⚠️ HIGH-priority candidate:** Confirm and log in BUG_CANDIDATES.md. If the page crashes for FAILED/SKIPPED_TRIVIAL summaries, this is a Critical bug. Recommended fix: pass a real timestamp (e.g. `session_started_at`) or drop the line when no valid date exists.

---

## Edge Case Run Log

| Date | ID | Result | Notes |
|---|---|---|---|
|  | EDGE-001 | | |
|  | EDGE-002 | | |
|  | … | | |
