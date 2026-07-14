# Sprint 3 Audit Report

**Date:** July 12, 2026  
**Scope:** Sprint 3 — Home, Settings, Therapist Portal  
**Audit Type:** Implementation verification against ClickUp task requirements  

---

## Executive Summary

| Metric | Count |
|---|---|
| Total Sprint 3 tasks | 18 |
| Fully completed | 15 |
| Partially completed | 2 |
| Incomplete / not implemented | 1 |

**Overall completion:** ~89% of functional requirements met. One critical gap (T-02 Client Overview UI missing) blocks the therapist portal's primary user flow. Two moderate issues exist (note list draft preservation, PR not yet merged). The remaining 15 tasks are verified complete with no material deviations from their ClickUp specifications.

---

## Critical Issues

### CRITICAL-1: T-02 Client Overview UI page does not exist

| Field | Value |
|---|---|
| **Task ID** | E10-S06 |
| **Title** | T-02 Client Overview UI |
| **Severity** | **Critical** |
| **Status in ClickUp** | `in progress` |

**Description:** The page file `apps/therapist-portal/src/app/clients/[id]/page.tsx` does not exist in the codebase. The T-01 Dashboard (E10-S04, marked complete) renders a list of clients where each row is a `<Link>` pointing to `/clients/${client.id}`. Since the target page does not exist, every client click results in a 404 error, making the therapist portal's primary user flow (caseload overview → client detail) non-functional.

**Why it matters:** The T-02 Client Overview is the substantive clinical visibility screen the portal exists to provide. Without it:
- Therapists can see their client list but cannot view any client's care plan, reasoning note, session summary, or safety state.
- The T-03 (care plan dropdown) and T-05 (notes) screens are also routed under `/clients/[id]/` — though those sub-pages exist, there is no landing page at the root path to navigate users into them or provide context.
- E10-S05 (the detail backend procedure) is fully implemented and ready — the blockage is purely the frontend page.

**Relevant files:**
- **Missing:** `apps/therapist-portal/src/app/clients/[id]/page.tsx`
- **Backend ready:** `apps/therapist-portal/src/server/routers/clients.ts` (detail procedure, lines 72-135)
- **Dashboard linking to 404:** `apps/therapist-portal/src/app/components/ClientRow.tsx`
- **Sub-pages that exist:** `apps/therapist-portal/src/app/clients/[id]/program/page.tsx`, `apps/therapist-portal/src/app/clients/[id]/notes/page.tsx`

**Recommended fix:** Create `apps/therapist-portal/src/app/clients/[id]/page.tsx` as a client component that:
1. Calls `trpc.clients.detail.useQuery({ clientUserId: params.id })` to fetch data.
2. Renders care plan (with provisional/confirmed visual distinction), reasoning note, most recent session summary (or "not yet available" state), and safety state.
3. Remains read-only per spec (editing belongs in T-03 / E11-S02).
4. Handles loading, error, and missing-client states.

The backend `reasoningNote` field was confirmed present in the response (a bug flagged on July 9 was fixed). The assignee (Anvi Patchigolla) was already notified via ClickUp comments that E10-S05's fix has landed.

---

## Medium / Minor Issues

### M1: E11-S04 note list draft preservation incomplete

| Field | Value |
|---|---|
| **Task ID** | E11-S04 |
| **Title** | T-05 UI — note list |
| **Severity** | **Moderate** |
| **Status in ClickUp** | `pr approved` |

**Description:** The notes page (`apps/therapist-portal/src/app/clients/[id]/notes/page.tsx`) stores draft text in React state only (`useState`). On mutation failure, the draft is correctly preserved (re-render survives). However, there is no `localStorage` or `sessionStorage` persistence — if the user navigates away, refreshes the page, or closes the browser tab, any unsaved draft text is permanently lost.

**Why it matters:** Losing a partially-written clinical note due to accidental navigation or refresh is a trust-eroding failure mode. The ClickUp spec explicitly requires: "Save failure: clear error, draft input preserved (not silently cleared)." While the "save failure" sub-requirement is met, the broader expectation of draft preservation is only partially addressed.

**Relevant files:**
- `apps/therapist-portal/src/app/clients/[id]/notes/page.tsx` (lines 21-24: `const [noteText, setNoteText]`)

**Recommended fix:** Persist the draft text to `sessionStorage` keyed by `draft-note-${clientId}` on every keystroke (debounced), and restore on mount. Clear the storage key on successful save. This adds ~10 lines and provides true cross-navigation draft safety.

---

### M2: E11-S04 pull request not yet merged

| Field | Value |
|---|---|
| **Task ID** | E11-S04 |
| **Title** | T-05 UI — note list |
| **Severity** | **Moderate** |
| **Status in ClickUp** | `pr approved` |

**Description:** The E11-S04 PR is approved but has not been merged to `develop`. The `listNotes` procedure (added to `notes.ts` as part of this story) and the notes UI page (`notes/page.tsx`) are not yet available on the base branch.

**Why it matters:** Until this merges, the therapist portal has no functional notes interface. The T-05 screen is unreachable or non-functional on `develop`, and any downstream work depending on `listNotes` or the notes UI is blocked.

**Relevant files:**
- `apps/therapist-portal/src/server/routers/notes.ts` (listNotes procedure)
- `apps/therapist-portal/src/app/clients/[id]/notes/page.tsx`

**Recommended fix:** Merge the approved PR to `develop`. If additional review is needed, request it promptly — the changes are scoped to two files and are well-defined.

---

### M3: Widespread `as any` type casts in clients router

| Field | Value |
|---|---|
| **Task ID** | E10-S02 / E10-S03 / E10-S05 / E11-S01 |
| **Title** | All therapist portal backend procedures in `clients.ts` |
| **Severity** | **Low** (code quality) |
| **Status in ClickUp** | All four marked `complete` |

**Description:** The file `apps/therapist-portal/src/server/routers/clients.ts` uses `as any` type assertions on every Prisma query (lines 24, 42, 57, 76, 93, 143, 158, 178, 194). This bypasses TypeScript's strict mode type checking entirely. By contrast, the sibling file `apps/therapist-portal/src/server/routers/notes.ts` uses proper Prisma client typing without `as any`.

**Why it matters:** While functional, the `as any` casts hide real type errors at development time. A Prisma schema change (field rename, type change) that would normally produce a compile-time type error in `notes.ts` would silently pass in `clients.ts`, potentially causing runtime failures. This is inconsistent with the project's stated "Strict mode on" TypeScript convention.

**Relevant files:**
- `apps/therapist-portal/src/server/routers/clients.ts` (lines 24, 42, 57, 76, 93, 143, 158, 178, 194)

**Recommended fix:** Replace `(ctx.prisma as any)` with the properly typed Prisma client. The root cause is likely that `ctx.prisma` is typed as `PrismaClient | null` in the tRPC context. The fix is to either:
- Use non-null assertion (`ctx.prisma!`) with a runtime guard, or
- Ensure the middleware guarantees prisma is always set for protected procedures.

---

---

## Summary Table

| Task | Title | Issue | Priority |
|---|---|---|---|
| E10-S06 | T-02 Client Overview UI | **Page file missing** — `/clients/[id]/page.tsx` does not exist. Dashboard links return 404. | **Critical** |
| E11-S04 | T-05 UI — note list | Draft preservation is React-state only. Text lost on navigation/refresh. | **Moderate** |
| E11-S04 | T-05 UI — note list | PR approved but not merged to `develop`. Notes UI unavailable on base branch. | **Moderate** |
| E10-S02/03/05, E11-S01 | clients.ts router | `as any` casts on all Prisma queries (9 occurrences). Bypasses strict TypeScript. | **Low** |

---

## Overall Recommendation

Sprint 3 is in strong shape with **15 of 18 tasks fully verified** against their ClickUp specifications — the mood check-in pipeline (E8-S02), mood history API (E8-S05), progress screen (E8-S04), emergency contact encryption (E9-S02), account deletion (E9-S03), and all therapist portal backend procedures (E10-S02/03/05, E11-S01/03) are production-ready implementations with solid test coverage.

**Immediate priority (blocking):** Complete E10-S06 (T-02 Client Overview UI). This is the only task that breaks an end-to-end user flow. The backend is ready; a single frontend page file needs to be created. Without it, the therapist dashboard is a dead end.

**Short-term (this week):** Merge the E11-S04 PR and address the draft-preservation gap with a `sessionStorage` backup. These are small changes that complete the notes feature.

**Code quality (debt):** Schedule a follow-up to clean up the `as any` casts in `clients.ts` — the pattern is straightforward and well-understood from `notes.ts`. This is not blocking but it erodes the project's stated TypeScript strictness guarantee over time.
