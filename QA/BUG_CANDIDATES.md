# Evia Therapist Portal — Bug Candidates (code-review findings)

**Status convention:** 🔍 **Candidate** — needs a repro to confirm (see "How to verify"). None of these have been executed against a running app yet; they are static-analysis findings from `develop` (HEAD `b13d1f5`).

> **Process note (per E13-S01):** every confirmed bug must be filed as a GitHub Issue using `BUG_REPORT_TEMPLATE.md` — reproduction steps are mandatory. P0 safety-related issues are escalated the same day, not just logged.

**Relevant file paths:**
- `apps/therapist-portal/src/server/routers/clients.ts`
- `apps/therapist-portal/src/server/routers/notes.ts`
- `apps/therapist-portal/src/app/clients/[id]/page.tsx` (T-02)
- `apps/therapist-portal/src/app/clients/[id]/notes/page.tsx` (T-05)
- `apps/therapist-portal/src/app/clients/[id]/program/page.tsx` (T-03)
- `apps/therapist-portal/src/app/clients/[id]/layout.tsx`
- `apps/therapist-portal/src/app/components/AuthenticatedShell.tsx`
- `apps/therapist-portal/src/app/dashboard/_components/ClientTable.tsx`
- `apps/therapist-portal/src/lib/format.ts`
- `apps/therapist-portal/src/app/globals.css`
- `docs/design/EVIA_Therapist_Portal_Design.md`

---

## BUG-C-1 — T-02 page can crash when the latest summary is FAILED / SKIPPED_TRIVIAL

- **Severity:** 🔴 Critical · **Priority:** P0 candidate
- **Location:** `clients/[id]/page.tsx:264-267` + `formatDateTime` `page.tsx:16-25`
- **Finding:** When `data.summary.status` is `not_available_yet` but a `session_id` exists (which happens for real rows with status `FAILED` or `SKIPPED_TRIVIAL` — `clients.ts:164-167` returns the session_id), the UI renders `Last session: {formatDateTime(data.summary.session_id)}`. `formatDateTime` calls `new Date(session_id)` where session_id is a UUID. `new Date('<uuid>')` is `Invalid Date`, and `.toLocaleDateString(...)` throws `RangeError: Invalid time value` in V8 → the page fails to render.
- **Reachability:** real data path only. In `LOCAL_DEV_BYPASS_AUTH=true` the mock detail returns `session_id: null` so it does not reproduce locally with bypass.
- **Repro:** seed a client whose latest `session_summaries` row has `status = 'SKIPPED_TRIVIAL'` (or `FAILED`), `summary_text = null`, `session_id = <uuid>`, then open `/clients/<id>`.
- **Recommended fix:** pass a real timestamp (e.g. `session_started_at`) or omit the line when no valid date exists. Guard `formatDateTime` with `Number.isNaN(date.getTime())`.
- **Related:** EDGE-028, F-CLNT-003, API-011.
- **How to verify:** manual repro above; assert the page renders the "No session summary available yet." message and does not throw.

---

## BUG-C-2 — Notes procedures fail in bypass mode (dev experience)

- **Severity:** 🟠 Medium · **Priority:** P1 (blocks local dev/dogfooding of T-05)
- **Location:** `notes.ts:14-29` (`addNote`, `listNotes`)
- **Finding:** `clients.*` routers honor `LOCAL_DEV_BYPASS_AUTH=true` (`getTherapistId` → `th_bypass_mock`, `assertClientAssigned` skips). `notes.*` does **not**: it always looks up the session email in the `therapist` table, and in bypass mode the session email is `bypass@evia.dev` (mock), which is not a real therapist → `UNAUTHORIZED "Therapist not found"`. So the Session Notes page is permanently broken in bypass mode, while the dashboard/overview work.
- **Repro:** run portal with `LOCAL_DEV_BYPASS_AUTH=true`, open any client's Session Notes page → "Could not load notes." (HTTP 401 under the hood).
- **Recommended fix:** apply the same bypass handling as `clients.ts` (return mock therapist id / skip assignment check), or document bypass mode as not supporting T-05.
- **Related:** API-025, SEC docs note.
- **How to verify:** reproduce with bypass mode; after fix, notes list + save succeed.

---

## BUG-C-3 — Dashboard is empty in bypass mode

- **Severity:** 🟡 Low (dev-only) · **Priority:** P2
- **Location:** `clients.ts:79-114` (`list`)
- **Finding:** In bypass mode `getTherapistId` returns `th_bypass_mock`; `list` queries `therapist_client` for that id, which has no assignments → the dashboard always shows "No clients assigned yet." The mock therapist is never seeded with assignments.
- **Workaround:** seed a `therapist_client` row with `therapist_id = 'th_bypass_mock'`, or develop against a seeded therapist email and real auth.
- **How to verify:** confirm dashboard is empty under bypass; confirm seeding restores rows.

---

## BUG-C-4 — Dashboard safety column is color-only for S0/S1/S2

- **Severity:** 🟠 Medium · **Priority:** P2 (accessibility)
- **Location:** `ClientTable.tsx:53-83` (`SafetyIndicator`)
- **Finding:** For `S2` the cell renders a bare amber dot with no text; for `S0`/`S1` it renders **nothing**. Only `S3`/`S4` get a text label ("Review"). This is a color-only + missing-state indicator. Design.md §6 requires information never conveyed by color alone (WCAG 1.4.1); the T-02 detail page does include text for all states, so the dashboard is inconsistent with it.
- **Recommended fix:** render a text label for every state (e.g. "Stable (S0)" green, "Monitor (S2)" amber, "Review required (S3/S4)" red).
- **Related:** UI-009.
- **How to verify:** with clients at S0/S1/S2, confirm the Safety column communicates the state without color vision.

---

## BUG-C-5 — Care-plan change has no audit trail

- **Severity:** 🟠 Medium · **Priority:** P2 (clinical auditability)
- **Location:** `clients.ts:211-254` (`setCarePlan`)
- **Finding:** E11-S01 NFR requires logging therapist-driven care-plan changes for audit. `setCarePlan` performs an upsert with no audit record (who changed it, from what, when). No such table exists in `packages/prisma/schema.prisma`.
- **Secondary:** `clients.ts:224-227` queries `clinicalConfig` into `existing` and never uses it (dead query).
- **How to verify:** change a care plan, then check DB/logs for any record of the change — none should exist (confirming the gap). Raise with PM/Senior Engineer whether an audit trail is required for E11-S01 sign-off.

---

## BUG-C-6 — T-03 shows a fabricated "current" care plan for clients with none assigned

- **Severity:** 🟠 Medium · **Priority:** P2 (data honesty / UX)
- **Location:** `clients.ts:191-209` (`getCarePlan`), `program/page.tsx:65-67`
- **Finding:** When a client has no `ClinicalConfig` row, `getCarePlan` returns `{ care_plan_id: 'CP1', assignment_state: 'provisional', created_at: null }`. T-03 then renders "CURRENT CARE PLAN: Anxiety & Worry / Provisional" with no date. A client who has never been assigned a plan is shown as having CP1 provisional — implying the system picked CP1 when it did not. E11-S02 FR-1 says "renders current care plan state"; a synthetic CP1 may mislead therapists during T-03 walkthrough (E13-S02).
- **Recommended fix:** return `null` (or an explicit "No care plan assigned") and render that state; only default to CP1 if a product decision requires it.
- **Related:** EDGE-005.
- **How to verify:** seed a client with no ClinicalConfig; open T-03 → note the fabricated CP1/provisional; confirm with PM whether intended.

---

## BUG-C-7 — Dead code: legacy client components

- **Severity:** 🟡 Low · **Priority:** P3 (cleanup)
- **Location:** `src/app/components/ClientList.tsx`, `ClientRow.tsx`, `SignOutButton.tsx`, `clients/[id]/_components/page-header.tsx`
- **Finding:** No active imports reference these (dashboard uses `ClientTable.tsx`; signout is inline in `sidebar.tsx:184-195`). Likely pre-refactor leftovers.
- **How to verify:** grep for imports; confirm zero references, then propose removal in a refactor (not a bug-fix PR).

---

## BUG-C-8 — Fonts diverge from the design spec

- **Severity:** 🟡 Low · **Priority:** P3 (design conformance)
- **Location:** `globals.css:70-75`, `src/app/layout.tsx`
- **Finding:** Design.md specifies Manrope (UI) + IBM Plex Mono (data/code). Implementation uses **Inter** for every font family and loads Inter + Material Symbols. Cosmetic divergence; flag to Lead Developer.
- **How to verify:** compare `--font-*` values and `layout.tsx` `<link>` tags against Design.md §2.

---

## BUG-C-9 — Misleading comment in notes router

- **Severity:** 🟡 Low · **Priority:** P3 (maintainability)
- **Location:** `notes.ts:61-62`
- **Finding:** The comment claims "clientId is a phone number, not a UUID." It is actually the route `[id]` param (a user UUID) passed by `notes/page.tsx:48`. Remove/rewrite the comment.
- **How to verify:** read the calling code in `notes/page.tsx`.

---

## BUG-C-10 — Double shell nesting on T-02 / T-05 (desktop layout)

- **Severity:** 🟠 Medium · **Priority:** P2 (needs visual confirmation)
- **Location:** `clients/[id]/layout.tsx:22-32` + `AuthenticatedShell.tsx:10-17`
- **Finding:** `clients/[id]/layout.tsx` renders its own `Sidebar` + `TopBar` + `md:ml-[240px]` wrapper around every `clients/[id]/*` page. The T-02 page (`page.tsx`) and T-05 page (`notes/page.tsx`) also render `AuthenticatedShell`, which adds a **second** `Sidebar` and a **second** `md:ml-[240px]` div. The two sidebars are `fixed` (so they overlap visually) but the inner `md:ml-[240px]` compounds the layout margin (~480px) and the pages end up inside two nested `<main>` elements. The T-03 program page does *not* use `AuthenticatedShell`, so it is single-wrapped — inconsistent between sibling pages.
- **Recommended fix:** pick one owner — either the layout provides the shell and pages omit `AuthenticatedShell`, or drop `[id]/layout.tsx` and keep `AuthenticatedShell` in each page.
- **How to verify:** open `/clients/<id>` and `/clients/<id>/notes` on a ≥768px viewport; measure left margin and compare to the dashboard and to `/clients/<id>/program`. Screenshot for evidence.

---

## BUG-C-11 — Two design implementations coexist

- **Severity:** 🟡 Low · **Priority:** P3 (consistency)
- **Location:** T-02/notes (`page.tsx`, `notes/page.tsx` use raw-hex Tailwind arbitrary values like `bg-[#F4F6F8]`, `text-[#1A6B5A]`) vs T-03 (`program/page.tsx` uses `@theme` tokens `bg-surface`, `text-on-surface`, `font-display-title`, `shadow-soft`).
- **Finding:** sibling pages under the same layout implement the same design system twice. Also minor label drift: T-02 StatusBadge says "Confirmed"; T-03 AssignmentBadge says "Confirmed by therapist".
- **How to verify:** visual + class-name audit across the three pages.
- **Related:** BUG-C-8, BUG-C-10.

---

## BUG-C-12 — Client label format differs between pages

- **Severity:** 🟡 Low · **Priority:** P3 (consistency)
- **Location:** `format.ts:7-10` (`formatClientLabel` = first 4 id chars) vs `program/page.tsx:95` (`User #${clientId.slice(-4)}` = last 4 chars)
- **Finding:** The same client is labelled from different id segments on T-02/T-05 vs T-03 (e.g. `User #AAAA` vs `User #EEEE`), which can confuse a therapist verifying identity across screens.
- **Recommended fix:** use `formatClientLabel` in `program/page.tsx`.
- **How to verify:** open T-02 and T-03 for the same client and compare labels.

---

## Triage recommendation (for the weekly triage / E13-S04)

| Candidate | Suggested priority | Blocking sign-off? |
|---|---|---|
| BUG-C-1 (crash) | P0 | Yes — repro and fix first |
| BUG-C-2 (bypass notes) | P1 | No (dev tooling) — but blocks dogfooding T-05 |
| BUG-C-4 (a11y) | P2 | No, but required before GA per Design.md §6 |
| BUG-C-5 (audit trail) | P2 | Confirm scope with PM/Senior Engineer |
| BUG-C-6 (fabricated CP1) | P2 | Confirm with PM |
| BUG-C-10 (layout) | P2 | Visual confirmation needed |
| BUG-C-3, 7, 8, 9, 11, 12 | P3 | No |

---

## Resolved items (historical)

- **CRITICAL-1 from `Sprint3_Audit_Report.md` (2026-07-12):** "T-02 page missing" — **resolved**: `apps/therapist-portal/src/app/clients/[id]/page.tsx` now exists and implements the E10-S06 UI. Re-verified during this review. Do not re-open unless a regression removes it.
