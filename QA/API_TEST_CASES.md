# Evia Therapist Portal — API Test Cases (tRPC procedures)

**Purpose:** Verify the portal's tRPC procedures (`/api/trpc/*`) at the API level. These are the backend procedures the portal UI calls in-process. All are defined in:

- `apps/therapist-portal/src/server/routers/clients.ts`
- `apps/therapist-portal/src/server/routers/notes.ts`
- `apps/therapist-portal/src/server/routers/example.ts`
- `apps/therapist-portal/src/server/trpc.ts` (context + auth middleware)
- `apps/therapist-portal/src/app/api/trpc/[trpc]/route.ts` (HTTP adapter)

## How to call the API

The tRPC HTTP endpoint accepts GET (queries) and POST (mutations). URL shape for a procedure `clients.list`:

```
GET http://localhost:3000/api/trpc/clients.list
GET http://localhost:3000/api/trpc/clients.detail?input={"json":{"clientUserId":"<uuid>"}}
```

Response shape on success:

```json
{ "result": { "data": { ... } } }
```

Response shape on error (e.g. UNAUTHORIZED):

```json
{ "error": { "json": { "code": "UNAUTHORIZED", "message": "...", "data": { "code": "UNAUTHORIZED" } } } }
```

## Authentication notes for API testing

1. **With a browser session:** Log in to the portal, then in DevTools → Console run `fetch('/api/trpc/clients.list').then(r=>r.json())`. The session cookie is attached automatically.
2. **Without login (`LOCAL_DEV_BYPASS_AUTH=true`):** The tRPC context substitutes a mock session (`bypass@evia.dev`). This is the easiest way to exercise the API layer, but note the bypass-specific behaviors flagged in each case and in `BUG_CANDIDATES.md`.
3. **Without login and bypass disabled:** `proxy.ts` redirects unauthenticated `/api/trpc/*` requests to `/auth` (a redirect, not a JSON error). Confirm and record this behavior.

---

## A. `example.health` (public)

### API-001 — Health check returns ok

| Field | Value |
|---|---|
| Test Case ID | API-001 |
| Module | API |
| Feature | example.health |
| Story ID | E10-S02 |
| Priority | P2 |
| Severity | Low |
| Objective | Confirm the public health procedure responds. |
| Requirement Reference | E10-S02 (example procedure) |
| Preconditions | Portal running; no login required. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | `curl "http://localhost:3000/api/trpc/example.health"` | HTTP 200; body contains `{"result":{"data":{"status":"ok","timestamp":"<ISO>"}}}` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## B. `example.echo` (public)

### API-002 — Echo returns the message

| Field | Value |
|---|---|
| Test Case ID | API-002 |
| Module | API |
| Feature | example.echo |
| Story ID | E10-S02 |
| Priority | P2 |
| Severity | Low |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | `curl "http://localhost:3000/api/trpc/example.echo?input=%7B%22json%22%3A%7B%22message%22%3A%22hi%22%7D%7D"` | HTTP 200; `{"result":{"data":{"echoed":"hi"}}}` |
| 2 | POST with missing message | Validation error (zod) — HTTP 400 with error code `BAD_REQUEST` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## C. `example.getMe` (protected)

### API-003 — getMe returns the authenticated user

| Field | Value |
|---|---|
| Test Case ID | API-003 |
| Module | API |
| Feature | example.getMe |
| Story ID | E10-S02 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm protected procedure returns the session user identity. |
| Requirement Reference | E10-S02 (auth wiring) |
| Preconditions | Bypass enabled OR logged in. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | With bypass on: `curl "http://localhost:3000/api/trpc/example.getMe"` | 200; data `{id:"mock", email:"bypass@evia.dev", name:"Bypass"}` |
| 2 | Logged in (real OAuth): same call | 200; data reflects the real Google session user |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-004 — getMe rejects unauthenticated requests

| Field | Value |
|---|---|
| Test Case ID | API-004 |
| Module | API |
| Feature | example.getMe — auth enforcement |
| Story ID | E10-S02, E10-S01 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm protected procedures reject requests without a session. |
| Requirement Reference | E10-S02 FR-3, Security; E10-S01 FR-3 |
| Preconditions | Bypass DISABLED; not logged in. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | `curl -s -i "http://localhost:3000/api/trpc/example.getMe"` | Because `proxy.ts` intercepts: HTTP 307 redirect to `/auth` (record actual). If the redirect is followed, `/auth` HTML is returned — record this as the observed behavior |
| 2 | If possible to reach the handler without proxy (e.g. server-side call), confirm the tRPC middleware | `UNAUTHORIZED` error from `isAuthed` middleware in `src/server/trpc.ts:17-22` |

**Result:** Pass / Fail / Blocked — **Notes:**

> **Note:** The proxy redirect is the observable behavior from a browser/curl. The tRPC middleware is the real enforcement boundary and is verified directly in code (`src/server/trpc.ts`). Both should be confirmed; the redirect alone is not a security boundary.

---

## D. `clients.list` (protected, no input)

### API-005 — List returns assigned clients with summary fields

| Field | Value |
|---|---|
| Test Case ID | API-005 |
| Module | API |
| Feature | clients.list |
| Story ID | E10-S03 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm list returns the therapist's assigned clients with dashboard fields. |
| Requirement Reference | E10-S03 FR-1, FR-2 |
| Preconditions | Real OAuth login as Therapist A (3 clients) OR bypass with seeded data caveat (see notes). |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Logged in as Therapist A, run `fetch('/api/trpc/clients.list').then(r=>r.json())` in DevTools | 200; `data` is an array of 3 items, each with `id` (uuid), `phoneNumber`, `carePlan` (`{care_plan_id, assignment_state}` or null), `lastSessionDate` (ISO or null), `safetyState` (S0–S4 or null) |
| 2 | Verify carePlan correctness | Client 1 → CP1/confirmed; Client 2 → CP2/provisional; Client 3 → null |
| 3 | Verify lastSessionDate | Most recent session's `session_started_at` as ISO, or null when none |
| 4 | Verify safetyState | Matches `SafetyState` rows (S0/S2/S3 for fixtures) |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-006 — List is scoped to the authenticated therapist

| Field | Value |
|---|---|
| Test Case ID | API-006 |
| Module | API |
| Feature | clients.list — scoping |
| Story ID | E10-S03 FR-3 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm a therapist never sees another therapist's clients. |
| Requirement Reference | E10-S03 FR-3, AC-2, Edge case |
| Preconditions | Real OAuth; log in as Therapist A and Therapist B in separate browsers/incognito. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | As Therapist A: call `clients.list` | Only Therapist A's 3 clients |
| 2 | As Therapist B: call `clients.list` | Only Therapist B's 1 client; Therapist A's clients absent |
| 3 | Attempt to widen scope by crafting input | No input accepted for `list` (no input schema) — impossible to inject a therapist_id (derived from session) |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-007 — List returns empty array for zero-assignment therapist

| Field | Value |
|---|---|
| Test Case ID | API-007 |
| Module | API |
| Feature | clients.list — empty |
| Story ID | E10-S03 Edge case |
| Priority | P1 |
| Severity | Medium |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Log in as a therapist with no `TherapistClient` rows | 200; `data` = `[]` (clean empty array, not an error) |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-008 — List in bypass mode returns empty (known limitation)

| Field | Value |
|---|---|
| Test Case ID | API-008 |
| Module | API |
| Feature | clients.list — bypass |
| Story ID | E10-S03 |
| Priority | P1 |
| Severity | Medium |
| Objective | Document bypass-mode behavior of `clients.list`. |
| Requirement Reference | `clients.ts` `getTherapistId` bypass branch |
| Preconditions | `LOCAL_DEV_BYPASS_AUTH=true`. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | `curl "http://localhost:3000/api/trpc/clients.list"` with bypass on | 200; `data` = `[]` because the mock therapist `th_bypass_mock` has no assignments (see BUG_CANDIDATES.md) |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## E. `clients.detail` (protected, input `clientUserId`)

### API-009 — Detail returns full client payload

| Field | Value |
|---|---|
| Test Case ID | API-009 |
| Module | API |
| Feature | clients.detail |
| Story ID | E10-S05 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm detail returns care plan, reasoning note, safety, and latest summary. |
| Requirement Reference | E10-S05 FR-1..FR-3 |
| Preconditions | Real OAuth as Therapist A; Client 1 has confirmed CP1, COMPLETED summary, S0. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | `fetch('/api/trpc/clients.detail?input='+encodeURIComponent(JSON.stringify({json:{clientUserId:'<client1-id>'}}))).then(r=>r.json())` | 200; data has `id`, `phoneNumber`, `carePlan{care_plan_id,assignment_state}`, `reasoningNote`, `safetyState`, `summary{status,summary_text,session_id}` |
| 2 | Verify carePlan | CP1 / confirmed |
| 3 | Verify reasoningNote | Non-null string (from ClinicalConfig.reasoning_note) |
| 4 | Verify summary | status `available`, summary_text non-null, session_id set |
| 5 | Verify safetyState | S0 |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-010 — Detail surfaces provisional state honestly

| Field | Value |
|---|---|
| Test Case ID | API-010 |
| Module | API |
| Feature | clients.detail — provisional |
| Story ID | E10-S05 FR-1, Edge case; AC-2 |
| Priority | P0 |
| Severity | High |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Call detail for Client 2 (provisional CP2) | `carePlan.assignment_state` = `provisional` (NOT silently `confirmed`) |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-011 — Detail handles missing summary

| Field | Value |
|---|---|
| Test Case ID | API-011 |
| Module | API |
| Feature | clients.detail — summary states |
| Story ID | E10-S05 FR-2, Edge case; Hidden requirement (E7-S03 states) |
| Priority | P0 |
| Severity | High |
| Objective | Confirm detail maps each `SessionSummary.status` to the correct UI state. |
| Requirement Reference | `clients.ts:156-170` mapping |
| Preconditions | Seed clients whose latest summary is: (a) COMPLETED, (b) PENDING, (c) FAILED, (d) SKIPPED_TRIVIAL, (e) none. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Detail for COMPLETED summary client | `summary.status` = `available`, `summary_text` non-null |
| 2 | Detail for PENDING summary client | `summary.status` = `generating` |
| 3 | Detail for FAILED summary client | `summary.status` = `not_available_yet` |
| 4 | Detail for SKIPPED_TRIVIAL summary client | `summary.status` = `not_available_yet` |
| 5 | Detail for client with no summary | `summary.status` = `not_available_yet`, `session_id` = null |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-012 — Detail blocks unassigned client

| Field | Value |
|---|---|
| Test Case ID | API-012 |
| Module | API |
| Feature | clients.detail — scoping |
| Story ID | E10-S05 FR-4, AC-3, Edge case |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm a therapist cannot fetch detail for a client not assigned to them. |
| Requirement Reference | E10-S05 AC-3 |
| Preconditions | Real OAuth; Therapist A does NOT have Therapist B's client assigned. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | As Therapist A, call detail with Therapist B's client id | tRPC error code `FORBIDDEN`, message "Client is not assigned to this therapist" (from `assertClientAssigned`) |
| 2 | Confirm no partial data leaks | No client fields returned in the error payload |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-013 — Detail returns NOT_FOUND for unknown client

| Field | Value |
|---|---|
| Test Case ID | API-013 |
| Module | API |
| Feature | clients.detail — not found |
| Story ID | E10-S05 |
| Priority | P1 |
| Severity | Medium |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Call detail with a valid-format UUID that has no User row (and no assignment) | Because the assignment check runs first, this returns `FORBIDDEN` (not assigned) — record actual. If bypassing assignment is possible, confirm `NOT_FOUND` "Client not found" |
| 2 | Confirm consistent behavior | Document the observed error code |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## F. `clients.getCarePlan` (protected, input `clientId`)

### API-014 — getCarePlan returns current plan

| Field | Value |
|---|---|
| Test Case ID | API-014 |
| Module | API |
| Feature | clients.getCarePlan |
| Story ID | E11-S01, E11-S02 |
| Priority | P0 |
| Severity | High |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Call `clients.getCarePlan` for Client 1 (CP1 confirmed) | 200; `{care_plan_id:"CP1", assignment_state:"confirmed", created_at:"<ISO or null>"}` |
| 2 | Call for a client with no ClinicalConfig | Defaults: `{care_plan_id:"CP1", assignment_state:"provisional", created_at:null}` (see `clients.ts:204-207`) — record this as observed behavior |
| 3 | Call with empty `clientId` (`""`) | Validation error (zod `.min(1)`) — `BAD_REQUEST` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## G. `clients.setCarePlan` (protected mutation, inputs `clientId`, `carePlanId`)

### API-015 — setCarePlan updates and confirms the plan

| Field | Value |
|---|---|
| Test Case ID | API-015 |
| Module | API |
| Feature | clients.setCarePlan |
| Story ID | E11-S01 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm a therapist can set a client's care plan and it becomes `confirmed`. |
| Requirement Reference | E11-S01 FR-1, FR-2; AC-1, AC-2 |
| Preconditions | Real OAuth as Therapist A; Client 3 (no care plan yet). |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | POST `clients.setCarePlan` with `{clientId:'<client3-id>', carePlanId:'CP2'}` | 200; `{success:true, clientId, carePlanId:'CP2', assignmentState:'confirmed', created_at:'<ISO>'}` |
| 2 | Confirm DB row created | `ClinicalConfig` for client3 has `care_plan_id=CP2`, `assignment_state=confirmed` |
| 3 | Confirm T-02 now shows it | Client overview shows CP2 / Confirmed |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-016 — setCarePlan rejects invalid carePlanId

| Field | Value |
|---|---|
| Test Case ID | API-016 |
| Module | API |
| Feature | clients.setCarePlan — validation |
| Story ID | E11-S01 Validation Rules |
| Priority | P0 |
| Severity | High |
| Objective | Confirm only CP1/CP2/CP3 are accepted. |
| Requirement Reference | E11-S01 "care_plan_id must be valid (CP1/CP2/CP3)" |
| Preconditions | Bypass or real auth. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Call setCarePlan with `carePlanId:'CP4'` | Validation error (zod enum) — `BAD_REQUEST`; no DB write |
| 2 | Call with `carePlanId:'CP1'` but empty `clientId` | `BAD_REQUEST` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-017 — setCarePlan no-op on same plan

| Field | Value |
|---|---|
| Test Case ID | API-017 |
| Module | API |
| Feature | clients.setCarePlan — idempotent |
| Story ID | E11-S01 Edge case |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm re-setting the current plan succeeds cleanly. |
| Requirement Reference | E11-S01 Edge case, AC-3 |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Call setCarePlan with the client's current plan | 200 success; assignment_state stays `confirmed`; no error |
| 2 | Confirm DB unchanged | Same care_plan_id, still confirmed |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-018 — setCarePlan blocks cross-therapist writes

| Field | Value |
|---|---|
| Test Case ID | API-018 |
| Module | API |
| Feature | clients.setCarePlan — scoping |
| Story ID | E11-S01 FR-3, AC-3, Security |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm a therapist cannot change a care plan for a client they don't have. |
| Requirement Reference | E11-S01 AC-3 |
| Preconditions | Real OAuth as Therapist A; use Therapist B's client id. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | As Therapist A, call setCarePlan for Therapist B's client | tRPC error `FORBIDDEN` "Client is not assigned to this therapist"; no DB write |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-019 — setCarePlan in bypass mode (documented behavior)

| Field | Value |
|---|---|
| Test Case ID | API-019 |
| Module | API |
| Feature | clients.setCarePlan — bypass |
| Story ID | E11-S01 |
| Priority | P1 |
| Severity | Medium |
| Objective | Document that bypass mode skips the assignment check (see BUG_CANDIDATES.md). |
| Requirement Reference | `clients.ts` `assertClientAssigned` bypass branch |
| Preconditions | `LOCAL_DEV_BYPASS_AUTH=true`. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Call setCarePlan for any `clientId` in bypass mode | Succeeds (assignment check bypassed) and writes to `ClinicalConfig` for that user — record this as a known dev-only behavior |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## H. `notes.listNotes` (protected, input `clientId`)

### API-020 — listNotes returns the client's notes (newest first)

| Field | Value |
|---|---|
| Test Case ID | API-020 |
| Module | API |
| Feature | notes.listNotes |
| Story ID | E11-S04 (read companion to E11-S03) |
| Priority | P0 |
| Severity | High |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Call `notes.listNotes` for Client 3 (1+ notes) | 200; array newest-first, each with `id`, `note_text`, `created_at`, `therapist{name}` |
| 2 | Verify ordering | Ordered by `created_at` descending |
| 3 | Call for a client with no notes | `[]` |
| 4 | Call with empty `clientId` | Validation error (zod `.min(1)`) |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-021 — listNotes scopes to authoring therapist

| Field | Value |
|---|---|
| Test Case ID | API-021 |
| Module | API |
| Feature | notes.listNotes — scoping |
| Story ID | E11-S03 FR-3, E11-S04 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm a therapist only sees notes for their own assigned clients. |
| Requirement Reference | E11-S03 AC-3 |
| Preconditions | Real OAuth; Therapist A's client id passed while notes belong to a shared client. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | As Therapist A, call listNotes for an unassigned client id | tRPC error `FORBIDDEN` "Client not assigned to therapist" |
| 2 | Confirm notes for assigned clients only | Only notes where `therapist_id` = current therapist AND client assigned are returned |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## I. `notes.addNote` (protected mutation, inputs `clientUserId`, `noteText`)

### API-022 — addNote persists a note

| Field | Value |
|---|---|
| Test Case ID | API-022 |
| Module | API |
| Feature | notes.addNote |
| Story ID | E11-S03 |
| Priority | P0 |
| Severity | High |
| Objective | Confirm a note is created with author + timestamp. |
| Requirement Reference | E11-S03 FR-1, FR-2; AC-1 |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | POST `notes.addNote` `{clientUserId:'<client3-id>', noteText:'API test note'}` | 200; `{id:'<uuid>', created_at:'<ISO>'}` |
| 2 | Call `notes.listNotes` | New note appears with authoring therapist name |
| 3 | Confirm DB row | `TherapistNote` row with correct `therapist_id`, `client_user_id`, `note_text` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-023 — addNote rejects empty/whitespace note

| Field | Value |
|---|---|
| Test Case ID | API-023 |
| Module | API |
| Feature | notes.addNote — validation |
| Story ID | E11-S03 Edge case, Validation Rules |
| Priority | P0 |
| Severity | High |
| Objective | Confirm empty/whitespace-only notes are rejected. |
| Requirement Reference | E11-S03 "empty or whitespace-only rejected" |
| Preconditions | Bypass or real auth (note: bypass mode has a quirk — see API-024). |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | `noteText:""` | Validation error (zod `.min(1)`) — `BAD_REQUEST`; no row created |
| 2 | `noteText:"   "` (spaces) | Because schema uses `.trim()`, spaces-only → `BAD_REQUEST` "Note text must not be empty" |
| 3 | `noteText:"ok"` with empty `clientUserId` | Validation error |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-024 — addNote blocks unassigned client

| Field | Value |
|---|---|
| Test Case ID | API-024 |
| Module | API |
| Feature | notes.addNote — scoping |
| Story ID | E11-S03 AC-3 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm notes cannot be added for unassigned clients. |
| Requirement Reference | E11-S03 AC-3 |
| Preconditions | Real OAuth; unassigned client id. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | As Therapist A, call addNote for an unassigned client | `FORBIDDEN` "Client not assigned to therapist"; no row created |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### API-025 — addNote/listNotes in bypass mode (documented quirk)

| Field | Value |
|---|---|
| Test Case ID | API-025 |
| Module | API |
| Feature | notes.* — bypass |
| Story ID | E11-S03, E11-S04 |
| Priority | P1 |
| Severity | Medium |
| Objective | Document that the notes router has NO bypass handling (see BUG_CANDIDATES.md). |
| Requirement Reference | `notes.ts` (no `isBypassEnabled` branch) |
| Preconditions | `LOCAL_DEV_BYPASS_AUTH=true`. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Call `notes.listNotes` in bypass mode | tRPC error `UNAUTHORIZED` "Therapist not found" (the mock email `bypass@evia.dev` is not in the `therapist` table) |
| 2 | Call `notes.addNote` in bypass mode | Same `UNAUTHORIZED` "Therapist not found" |
| 3 | Compare to clients router | Note the inconsistency: clients.* handles bypass, notes.* does not (log in BUG_CANDIDATES.md) |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## API Test Summary

| ID | Procedure | Type | Input | Expected success | Priority |
|---|---|---|---|---|---|
| API-001 | example.health | query | — | status ok | P2 |
| API-002 | example.echo | query | message | echoed | P2 |
| API-003 | example.getMe | query | — | session user | P1 |
| API-004 | example.getMe | query | — | 307/401 | P0 |
| API-005 | clients.list | query | — | array | P0 |
| API-006 | clients.list | query | — | scoped | P0 |
| API-007 | clients.list | query | — | [] | P1 |
| API-008 | clients.list | query | — | [] bypass | P1 |
| API-009 | clients.detail | query | clientUserId | full payload | P0 |
| API-010 | clients.detail | query | clientUserId | provisional | P0 |
| API-011 | clients.detail | query | clientUserId | summary states | P0 |
| API-012 | clients.detail | query | clientUserId | FORBIDDEN | P0 |
| API-013 | clients.detail | query | clientUserId | FORBIDDEN/NOT_FOUND | P1 |
| API-014 | clients.getCarePlan | query | clientId | plan+defaults | P0 |
| API-015 | clients.setCarePlan | mutation | clientId, carePlanId | confirmed write | P0 |
| API-016 | clients.setCarePlan | mutation | carePlanId CP4 | BAD_REQUEST | P0 |
| API-017 | clients.setCarePlan | mutation | same plan | no-op success | P1 |
| API-018 | clients.setCarePlan | mutation | unassigned | FORBIDDEN | P0 |
| API-019 | clients.setCarePlan | mutation | bypass | writes (dev) | P1 |
| API-020 | notes.listNotes | query | clientId | array desc | P0 |
| API-021 | notes.listNotes | query | clientId | FORBIDDEN | P0 |
| API-022 | notes.addNote | mutation | clientUserId, noteText | id+created_at | P0 |
| API-023 | notes.addNote | mutation | empty note | BAD_REQUEST | P0 |
| API-024 | notes.addNote | mutation | unassigned | FORBIDDEN | P0 |
| API-025 | notes.* | query/mutation | bypass | UNAUTHORIZED | P1 |
