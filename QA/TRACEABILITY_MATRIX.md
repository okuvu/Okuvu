# Evia Therapist Portal — Traceability Matrix

**Purpose:** Maps every Sprint 3 therapist-portal story (E10, E11) to its acceptance criteria (AC) / functional requirements (FR), the code that implements it, and the QA test cases that verify it. Sprint 4 (E12/E13) context is included where it affects QA scope (beta sign-off, regression).

**Code paths referenced:**
- Auth: `apps/therapist-portal/src/lib/auth.ts`, `src/proxy.ts`, `src/app/auth/page.tsx`
- tRPC: `src/server/trpc.ts`, `src/server/routers/{clients,notes,example,_app}.ts`, `src/app/api/trpc/[trpc]/route.ts`
- UI: `src/app/dashboard/*`, `src/app/clients/[id]/*`, `src/app/components/*`
- Data: `packages/prisma/schema.prisma`, `packages/shared-types/index.ts`

Legend for **Status**: ✅ Implemented & testable · ⚠️ Partial / discrepancy (see BUG_CANDIDATES.md) · ❌ Not implemented.

---

## E10 — Therapist Portal (T-00 / T-01 / T-02)

### E10-S01 — NextAuth Google OAuth (T-00 login)

| AC / FR | Requirement (from Sprint 3 spec) | Code | Status | Test cases |
|---|---|---|---|---|
| FR-1 | T-00 login renders "Sign in with Google" | `auth/page.tsx` (Continue with Google button) | ✅ | F-AUTH-001, UI-001 |
| FR-2 | Successful OAuth establishes a session (JWT) | `auth.ts` (GoogleProvider, `strategy:'jwt'`) | ✅ | F-AUTH-001, SEC-011 |
| FR-3 | Unauthenticated access to other routes redirects to login | `proxy.ts:25-28` | ✅ | F-NAV-001, SEC-004 |
| FR-4 | Only pre-authorized therapist accounts authenticate (allowlist) | `auth.ts:33-45` (`therapist.findUnique`) | ✅ | F-AUTH-002, SEC-001, SEC-002 |
| AC-1 | Authorized therapist Google account can log in and reach dashboard | above | ✅ | F-AUTH-001, SMK-001 |
| AC-2 | Non-authorized Google account rejected after successful OAuth | `auth.ts:40-41` | ✅ | F-AUTH-002, SMK-002, SEC-001 |
| NFR | Clean handling of cancelled/failed OAuth | `auth/page.tsx:21-26` | ✅ | F-AUTH-003, F-AUTH-004, EDGE-002/003 |
| NFR | Secure cookies / session expiry | NextAuth JWT defaults | ⚠️ verify | SEC-011, SEC-012 |

---

### E10-S02 — tRPC router setup + shared types

| AC / FR | Requirement | Code | Status | Test cases |
|---|---|---|---|---|
| FR-1 | tRPC router functional with working example procedure | `server/trpc.ts`, `routers/example.ts`, `api/trpc/[trpc]/route.ts` | ✅ | API-001, API-002, REG-007 |
| FR-2 | Shared types package consumed by both apps | `packages/shared-types` (`ClientListItem`, `CarePlanId`, `SafetyState`); `clients.ts` uses them | ✅ | API-005 (types), code review |
| FR-3 | NextAuth session wired into tRPC context | `trpc.ts:6-9` | ✅ | API-003 |
| NFR | Protected procedures reject unauthenticated at middleware | `trpc.ts:17-22` (`isAuthed`) | ✅ | API-004, SEC-005 |
| AC-1 | Example procedure works end-to-end | `example.ts` | ✅ | API-001, API-002 |
| AC-2 | Shared types build + consumed without duplication | `packages/shared-types/index.ts`; no duplicate defs in portal | ✅ | code review, REG-007 |

---

### E10-S03 — GET /therapist/clients (T-01 backend)

| AC / FR | Requirement | Code | Status | Test cases |
|---|---|---|---|---|
| FR-1 | tRPC procedure returns assigned clients scoped via session | `clients.ts` `list` (`getTherapistId` from session email) | ✅ | API-005, F-DASH-001 |
| FR-2 | Lightweight dashboard fields only (no full clinical detail) | `list` select shape (id, phone, carePlan, lastSessionDate, safetyState) | ✅ | API-005, API-006 |
| FR-3 | Therapist only sees own clients | `therapistClient.findMany({ therapist_id })` | ✅ | SEC-006, API-006 |
| AC-1 | Correct list scoped to authenticated therapist | above | ✅ | API-005, API-006 |
| AC-2 | Cross-therapist list access blocked | session-derived scoping; no input param | ✅ | SEC-006, API-006 |
| Edge | Zero clients → clean empty list | `list` returns `[]`; `ClientTable` empty state | ✅ | F-DASH-002, API-007 |

---

### E10-S04 — T-01 Dashboard UI

| AC / FR | Requirement | Code | Status | Test cases |
|---|---|---|---|---|
| FR-1 | Renders list of assigned clients with summary fields | `dashboard/page.tsx`, `DashboardContent.tsx`, `ClientTable.tsx` | ✅ | F-DASH-001 |
| FR-2 | Each row shows identifier, care plan, last session | `ClientTable.tsx` columns | ✅ | F-DASH-001 |
| FR-3 | Clicking client navigates to T-02 | `ClientTable.tsx` Links → `/clients/${id}` | ✅ | F-DASH-003 |
| NFR | Read-only (no inline editing) | No editing affordances in DashboardContent/ClientTable | ✅ | UI-002, UI-003 |
| Edge | Loading + error states | `DashboardContent.tsx` skeleton + error/Retry | ✅ | F-DASH-004, F-DASH-005 |
| Design | Row = single click target, keyboard-navigable | `ClientTable.tsx` (row itself not a link; phone + View links are) | ⚠️ see BUG-… | UI-002, UI-006 |

---

### E10-S05 — GET /therapist/clients/:id (T-02 backend)

| AC / FR | Requirement | Code | Status | Test cases |
|---|---|---|---|---|
| FR-1 | Detail returns care_plan_id, assignment_state, reasoning_note | `clients.ts` `detail` (reads ClinicalConfig) | ✅ | API-009, API-010, F-CLNT-001 |
| FR-2 | Returns most recent session summary or clear "not available" | `detail` reads `session_summaries`; maps COMPLETED/PENDING/FAILED/SKIPPED_TRIVIAL | ✅ | API-011, F-CLNT-003, EDGE-008..011 |
| FR-3 | Returns current safety_state | `detail` reads `safety_state` | ✅ | API-009, F-CLNT-005 |
| FR-4 | Strictly scoped to assigned clients | `assertClientAssigned` (FORBIDDEN) | ✅ | API-012, SEC-007 |
| AC-1 | Correct care plan + reasoning_note | `detail` | ✅ | API-009 |
| AC-2 | Latest summary or "not available" state | summary mapping | ✅ | API-011, F-CLNT-003 |
| AC-3 | Cross-therapist access blocked | `assertClientAssigned` | ✅ | API-012, SEC-007 |
| Edge | Provisional surfaced honestly | `assignment_state` passthrough (never normalized) | ✅ | API-010, F-CLNT-002 |

---

### E10-S06 — T-02 Client Overview UI

| AC / FR | Requirement | Code | Status | Test cases |
|---|---|---|---|---|
| FR-1 | Renders care plan + reasoning note + explicit provisional/confirmed distinction | `clients/[id]/page.tsx` (CARE PLAN card, StatusBadge, details expander) | ✅ | F-CLNT-001, F-CLNT-002, UI-003 |
| FR-2 | Renders latest session summary or "not yet available" | `page.tsx` summary card branches | ✅ | F-CLNT-003 |
| FR-3 | Renders safety_state | `page.tsx` SafetyIndicator | ✅ | F-CLNT-005 |
| FR-4 | Read-only (no inline editing) | no editing controls | ✅ | UI-003 |
| AC-1 | All E10-S05 fields render | page cards | ✅ | F-CLNT-001 |
| AC-2 | Provisional vs confirmed visually distinct | StatusBadge colors | ✅ | F-CLNT-002, UI-003 |
| AC-3 | Missing summary → honest "not yet available" | `page.tsx:259-270` | ✅ | F-CLNT-003, EDGE-008..011 |
| Edge | Summary status FAILED/SKIPPED_TRIVIAL with session_id present | `page.tsx:264-267` passes `session_id` to `formatDateTime` | ⚠️ **see EDGE-028 / BUG-C-1** | F-CLNT-003, EDGE-028 |

> **Audit history:** Sprint3_Audit_Report.md CRITICAL-1 flagged `/clients/[id]/page.tsx` missing as of 2026-07-12. It now exists (verified). Re-verify on the current build.

---

## E11 — Therapist Portal (T-03 / T-05)

### E11-S01 — POST /therapist/clients/:id/care-plan (T-03 backend)

| AC / FR | Requirement | Code | Status | Test cases |
|---|---|---|---|---|
| FR-1 | Accepts client_id + new care_plan_id from authenticated therapist | `clients.ts` `setCarePlan` (zod: clientId min 1, carePlanId enum) | ✅ | API-015, API-016 |
| FR-2 | Writes care_plan_id, sets assignment_state=confirmed | `clinicalConfig.upsert` with `assignment_state:'confirmed'` | ✅ | API-015, F-PROG-002 |
| FR-3 | Only succeeds for assigned clients | `assertClientAssigned` before upsert | ✅ | API-018, SEC-008 |
| AC-1 | Therapist can set new care plan | `setCarePlan` | ✅ | API-015, F-PROG-002 |
| AC-2 | Write sets assignment_state to confirmed | upsert | ✅ | API-015 |
| AC-3 | Cross-therapist writes blocked | assertClientAssigned | ✅ | API-018, SEC-008 |
| Edge | Same plan → no-op success | upsert idempotent | ✅ | API-017, F-PROG-003 |
| Validation | care_plan_id must be CP1/CP2/CP3 | `z.enum(CARE_PLANS)` | ✅ | API-016, EDGE-017 |
| NFR | Log therapist-driven changes for audit | **No audit logging found in `setCarePlan`** | ❌/⚠️ see BUG-C-5 | code review |

---

### E11-S02 — T-03 UI (care plan dropdown)

| AC / FR | Requirement | Code | Status | Test cases |
|---|---|---|---|---|
| FR-1 | Renders current care plan state | `program/page.tsx` CURRENT CARE PLAN section (via `getCarePlan`) | ✅ | F-PROG-001 |
| FR-2 | Dropdown of CP1/CP2/CP3 only | `CARE_PLANS` array + `<select>` | ✅ | F-PROG-001 |
| FR-3 | On selection, calls setCarePlan | `handleSave` → `setCarePlan.mutate` | ✅ | F-PROG-002 |
| FR-4 | Clear confirmation after save | success toast "✓ Care plan saved" | ✅ | F-PROG-002 |
| AC-1 | Select + save new plan, reflected on T-02 | toast + refetch + T-02 view | ✅ | F-PROG-002 |
| AC-2 | Save success/failure clearly communicated | success toast / error toast (`onError`) | ✅ | F-PROG-004 |
| Edge | Save failure → no false success | `onError` sets errorToast only | ✅ | F-PROG-004, EDGE-016 |
| Edge | Re-select current plan | no-op success | ✅ | F-PROG-003 |
| Design | Dropdowns over free text | `<select>` not text input | ✅ | UI-004 |

---

### E11-S03 — POST /therapist/clients/:id/notes (T-05 backend)

| AC / FR | Requirement | Code | Status | Test cases |
|---|---|---|---|---|
| FR-1 | Accepts client_id + free-text note | `notes.ts` `addNote` (zod trim min 1) | ✅ | API-022 |
| FR-2 | Persists note with client + author + timestamp | `therapistNote.create` (therapist_id, client_user_id, note_text, created_at) | ✅ | API-022 |
| FR-3 | Scoped to assigned clients | `addNote` assignment check → FORBIDDEN | ✅ | API-024, SEC-009 |
| FR-4 | Notes never read by/injected into any agent | `TherapistNote` isolated; no agent references | ✅ (verify) | SEC-010 |
| AC-1 | Therapist can add note for assigned client | `addNote` | ✅ | API-022, F-NOTE-002 |
| AC-2 | Notes never readable by agents — verify E2-S08 no reference | grep (SEC-010) | ✅ (verify) | SEC-010 |
| AC-3 | Cross-therapist note creation blocked | FORBIDDEN | ✅ | API-024, SEC-009 |
| Validation | Empty/whitespace note rejected | zod trim min 1 | ✅ | API-023, F-NOTE-003 |
| Edge | Note content not logged | no note-text logging found | ✅ | code review |

---

### E11-S04 — T-05 UI (note list)

| AC / FR | Requirement | Code | Status | Test cases |
|---|---|---|---|---|
| FR-1 | Chronological note list with content, timestamp, author | `notes/page.tsx` NOTE HISTORY (desc order, author name) | ✅ | F-NOTE-002, F-NOTE-007 |
| FR-2 | Text input + save action calling addNote | ADD A NOTE form | ✅ | F-NOTE-002 |
| FR-3 | New note appears without full reload | `notesQuery.refetch()` on success | ✅ | F-NOTE-002 |
| AC-1 | Existing notes render chronologically | desc order | ✅ | F-NOTE-007 |
| AC-2 | New note added + appears immediately | refetch | ✅ | F-NOTE-002 |
| AC-3 | Empty-notes state clear and friendly | "No notes yet." empty state | ✅ | F-NOTE-001 |
| Edge | Save failure: clear error, draft preserved | `onError` + sessionStorage draft | ✅ (verify) | F-NOTE-006, EDGE-019 |
| Edge | List fetch failure: clear error/retry | "Could not load notes. Please refresh and try again." | ✅ | F-NOTE-005 |

---

## Sprint 4 context (E12 / E13) — regression & beta

| Story | Requirement relevant to portal QA | Test cases |
|---|---|---|
| E12-S05 (HALT) | Formal sign-off that safety-critical behavior passed before humans use the product | REGRESSION_TESTS.md (esp. SEC-013, SEC-010), BUG_CANDIDATES triage |
| E13-S01 (dogfooding) | ≥1 session/person/day; every bug has repro steps; triage P0/P1/deferred | TEST_SUMMARY_TEMPLATE.md (bug log), BUG_REPORT_TEMPLATE.md |
| E13-S02 (therapist onboarding) | Walkthroughs cover T-01/T-02/T-03/T-05; therapist can describe provisional vs confirmed unaided | F-CLNT-002, UI-003, TRACEABILITY row E10-S06 |
| E13-S03 (supervised beta) | Real TL-mode sessions; ≥1 therapist uses T-03 change + T-05 note; beta sessions flagged in session_logs | F-PROG-002, F-NOTE-002, REGRESSION suite |
| E13-S04 (P0 fixes) | Bug log from dogfooding/beta triaged; fixes land before beta | BUG_REPORT_TEMPLATE.md, REGRESSION_TESTS.md |

---

## Verification summary

| Story | Testable? | Notes |
|---|---|---|
| E10-S01 | ✅ | Allowlist = therapist table; verify cookie flags |
| E10-S02 | ✅ | example router + shared types |
| E10-S03 | ✅ | list + scoping + empty |
| E10-S04 | ✅ | dashboard UI (row-as-link caveat) |
| E10-S05 | ✅ | detail + summary states + scoping |
| E10-S06 | ✅ | T-02 UI (was missing, now present — re-verify) |
| E11-S01 | ✅ | setCarePlan (audit-log gap) |
| E11-S02 | ✅ | T-03 UI |
| E11-S03 | ✅ | addNote + non-ingestion |
| E11-S04 | ✅ | notes UI + draft persistence |

**Known gaps flagged for confirmation (detail in BUG_CANDIDATES.md):**
- **BUG-C-1:** T-02 "Last session" line passes a UUID to `formatDateTime` — potential crash on FAILED/SKIPPED_TRIVIAL summaries (EDGE-028).
- **BUG-C-2:** notes.* has no bypass-mode handling → notes fail in `LOCAL_DEV_BYPASS_AUTH=true` (API-025).
- **BUG-C-3:** `clients.list` in bypass mode returns empty (th_bypass_mock has no assignments) (API-008).
- **BUG-C-4:** Dashboard S2 safety = color-only dot (no text) — accessibility (UI-009).
- **BUG-C-5:** `setCarePlan` has no audit logging, despite E11-S01 NFR (clinical auditability).
- **BUG-C-6:** T-03 defaults unconfigured clients to CP1/provisional as "current" — verify intent (EDGE-005).
- **BUG-C-7:** Legacy components (ClientList/ClientRow/SignOutButton/PageHeader) are unused — possible dead code.
- **BUG-C-8:** Design doc specifies Manrope/IBM Plex Mono; layout.tsx loads Inter.
