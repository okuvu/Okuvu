# EVIA Consolidated Test Report

## Report Meta

| Field | Value |
|-------|-------|
| **Application** | EVIA Mobile (Android) + Therapist Portal |
| **Release/Build** | MVP |
| **Test Cycle** | QA Pass 1 |
| **Environment** | evia-beta / local dev |
| **Test Lead** | |
| **Date** | 2026-08-06 |
| **Source** | `docs/testing/*` suite + real bugs logged from automated test runs |

---

## 1. Test Type Summary

| ID | Test Type | Scope | Known Bugs |
|----|-----------|-------|------------|
| TPT-01 | Functional Testing | Feature behaviour vs sprint specs | 1 |
| TPT-02 | Smoke Testing | Critical-path happy flow (Smoke_Test_Checklist.md) | 0 |
| TPT-03 | Regression Testing | Full 128-item Regression_Checklist.md | 1 |
| TPT-04 | UI/UX Accessibility Testing | Rendering, layout, a11y, low-end devices | 1 |
| TPT-05 | Security Testing | Auth, consent, encryption, DPDP, portal authorization | 0 |
| TPT-06 | API/tRPC Testing | Endpoints, WebSocket, unit tests, rate limiter | 6 |
| TPT-07 | Edge Cases | Boundaries, race conditions, empty states | 2 |

> **Note:** TPT-02, TPT-05 have no bugs reported in this cycle. If your execution results
> surface bugs in any type, append them to the matching section below following the
> `Bug_Report_Template.md` fields.

---

## 2. TPT-01 — Functional Testing

| Bug ID | Title | Severity | Priority | Related TC | Status |
|--------|-------|----------|----------|------------|--------|
| F-01 | Therapist Portal: after saving care plan, user stays on Program Evia page instead of returning to client overview | Minor | P1 | T-03 (SCR-TP-003) | Fixed |

**F-01 — Details**
- **Test Type:** TPT-01 Functional / TPT-04 UI
- **What:** On `/clients/[id]/program`, selecting a care plan and tapping **Save care plan** only showed a "✓ Care plan saved" toast; the page never returned to the client detail page.
- **Expected:** After save, user returns to the client overview page (`/clients/[id]`).
- **Actual:** User remained on the Program Evia page and had to click Cancel.
- **Repro:** Dashboard → client → Manage → Program Evia → change care plan → Save.
- **Fix:** Redirect to `/clients/${clientId}` after ~1s success toast in `apps/therapist-portal/src/app/clients/[id]/program/page.tsx` (`setCarePlan.onSuccess`).
- **Spec Ref:** EVIA_Therapist_Portal_Design.md §5.4 T-03.

---

## 3. TPT-02 — Smoke Testing

No bugs identified in this cycle. Smoke checklist = `Smoke_Test_Checklist.md` (20 steps, S1–S20).

---

## 4. TPT-03 — Regression Testing

| Bug ID | Title | Severity | Priority | Related TC | Status |
|--------|-------|----------|----------|------------|--------|
| R-01 | Session-close regression: `closeSession()` crashes on `prisma.user.findUnique` (undefined) | Major | P0 | CHAT-013, CHAT-010, CHAT-009 | Fixed |

**R-01 — Details**
- **Test Type:** TPT-03 Regression / TPT-06 API
- **What:** 8 `session-close` unit tests (`apps/api/src/__tests__/session-close.test.ts`) threw
  `TypeError: Cannot read properties of undefined (reading 'findUnique')` at
  `apps/api/src/lib/session-close.ts:34`. The test's `prisma.js` mock only defined
  `sessionLog.updateMany`; `closeSession` later began calling `prisma.user.findUnique`
  (to resolve `dbUserId`), which the mock did not provide.
- **Impact:** Idle-timeout, cap, explicit-close, idempotency, and race tests all failed; also
  produced an unhandled rejection.
- **Fix:** Added `user: { findUnique: mockFindUser }` to the mock in
  `apps/api/src/__tests__/session-close.test.ts` and reset it in `beforeEach`.
- **Spec Ref:** E4-S03 unified session close handler.

---

## 5. TPT-04 — UI/UX Accessibility Testing

| Bug ID | Title | Severity | Priority | Related TC | Status |
|--------|-------|----------|----------|------------|--------|
| U-01 | T-03 post-save navigation jarring: success toast disappears on unmount, no explicit "returning to client" affordance | Trivial | P2 | T-03 (SCR-TP-003) | Fixed |

**U-01 — Details**
- **Test Type:** TPT-04 UI/UX
- **What:** After save, the success toast is shown but the page navigates away ~1s later; the
  toast unmounts with the page, so confirmation is brief.
- **Expected:** Clear visual confirmation before leaving (per low-cognitive-load principle).
- **Actual:** Brief toast then immediate redirect.
- **Fix (accepted design):** 1s toast then `router.push`. Optionally re-verify on a real device
  that 1s is sufficient reading time.

---

## 6. TPT-05 — Security Testing

No bugs identified in this cycle. Scope covers: Firebase OTP auth, consent enforcement
(CONS-005 400 on `safety_monitoring=false`), AES-256-GCM emergency contact, DPDP account
deletion, portal cross-therapist access control, `LOCAL_DEV_BYPASS_AUTH` production guard.

---

## 7. TPT-06 — API/tRPC Testing

| Bug ID | Title | Severity | Priority | Related TC | Status |
|--------|-------|----------|----------|------------|--------|
| A-01 | A9 governance model mismatch: test expects `gemini-2.5-flash`, code passes `gemini-3.1-flash-lite-preview` | Minor | P1 | a9.test.ts | Fixed |
| A-02 | Vertex AI model path uses default project `evia-dev`, tests expect `evia-500215` | Minor | P1 | vertex-ai.test.ts | Open |
| A-03 | Vertex AI default model fallback synced to `gemini-2.5-flash`; test still red on A-02 project-ID | Minor | P1 | vertex-ai.test.ts | Fixed |
| A-04 | Latency overlap test fails: `classifySafety` never invoked (`a1Windows.length === 0`) | Major | P1 | orchestrator-latency.test.ts | Open |
| A-05 | Rate-limiter concurrency AC#4 times out (30s) across 20 consecutive runs | Major | P1 | rate-limiter-concurrency.test.ts | Open |
| A-06 | Test env missing Vertex/Gemini overrides — model & project assertions depend on `.env` values | Minor | P2 | setup.ts | Fixed |

**A-01 — Details**
- **Test Type:** TPT-06 API
- **What:** `apps/api/src/__tests__/a9.test.ts:54` expects `callArgs.model === 'gemini-2.5-flash'`
  but receives `gemini-3.1-flash-lite-preview`.
- **Root cause:** `GEMINI_FLASH_LITE_MODEL` is not set in the test environment; code default is
  `gemini-3.1-flash-lite-preview` (`apps/api/src/agents/a9/agent.ts:8`). `.env.example` sets
  `GEMINI_FLASH_LITE_MODEL="gemini-2.5-flash"`.
- **Resolution (story A-01):** `GEMINI_FLASH_LITE_MODEL` pinned to `gemini-2.5-flash` in
  `apps/api/src/__tests__/setup.ts`; code defaults synced to `gemini-2.5-flash` in `a9/agent.ts`,
  `a9-post/agent.ts`, and `apps/worker/src/lib/vertex-ai.ts`. Verified: `a9.test.ts` (20) +
  `a9-post.test.ts` (26) pass.

**A-02 / A-03 — Details**
- **Test Type:** TPT-06 API
- **What:** `apps/api/src/__tests__/vertex-ai.test.ts:124,136` expect model resource path under
  `projects/evia-500215/...`. Received `projects/evia-dev/...` and default
  `gemini-3.1-pro-preview`.
- **Root cause:** `VERTEX_AI_PROJECT_ID` / `GEMINI_PRO_MODEL` not set in test env; code fallback
  defaults (`apps/api/src/lib/vertex-ai.ts:21-23`).
- **Resolution (story A-01):** `GEMINI_PRO_MODEL` fallback default synced to `gemini-2.5-flash`
  in `apps/api/src/lib/vertex-ai.ts:23`. A-03's root cause (model fallback) is fixed; the test
  remains red solely due to the A-02 project-ID mismatch (`evia-dev` vs `evia-500215`), still open.

**A-06 — Details**
- **Test Type:** TPT-06 API
- **What:** Model & project assertions in `a9.test.ts`, `a9-post.test.ts`, `vertex-ai.test.ts`
  depended on Vertex/Gemini env values from a repo-root `.env`, which is absent in CI.
- **Root cause:** `apps/api/src/__tests__/setup.ts` pinned only `VERTEX_AI_PROJECT_ID` and
  `GEMINI_FLASH_LITE_MODEL`; `GEMINI_PRO_MODEL` and `VERTEX_AI_LOCATION` came from `.env` or
  code fallback.
- **Resolution (story A-06):** pinned `GEMINI_PRO_MODEL="gemini-2.5-flash"` and
  `VERTEX_AI_LOCATION="asia-south1"` in `apps/api/src/__tests__/setup.ts`, matching
  `.env.example`. Verified: `a9.test.ts` (20) + `a9-post.test.ts` (26) + `vertex-ai.test.ts`
  (6) + `orchestrator-latency.test.ts` (2) pass with no repo-root `.env`.

**A-04 — Details**
- **Test Type:** TPT-06 API / TPT-07 Edge
- **What:** `apps/api/src/__tests__/orchestrator-latency.test.ts:184` — `a1Windows.length` is `0`
  after 10 `processTurn` calls; the `classifySafety` mock was never invoked.
- **Investigation status:** needs confirmation whether `processTurn` short-circuits before the
  A1/A9 `Promise.allSettled` (e.g., session/user validation).

**A-05 — Details**
- **Test Type:** TPT-06 API / TPT-07 Edge
- **What:** `apps/api/src/__tests__/rate-limiter-concurrency.test.ts:134` — 20 consecutive
  concurrency runs exceed the 30s timeout. Requires a real DB (`DATABASE_URL`); may be
  environment/latency-bound.
- **Impact:** Race-condition guarantee (exactly one session opened, one 429) not verified in CI.

---

## 8. TPT-07 — Edge Cases

| Bug ID | Title | Severity | Priority | Related TC | Status |
|--------|-------|----------|----------|------------|--------|
| E-01 | Session-close idle-timeout test: `capturedResult` null when timer fires (same prisma mock root cause as R-01) | Major | P0 | CHAT-009 | Fixed |
| E-02 | Concurrent SESSION_OPEN race under load not reliably verifiable (30s timeout) | Major | P1 | CHAT-004 | Open |

---

## 9. Bug Status Legend

| Status | Meaning |
|--------|---------|
| **Open** | Reported, fix pending |
| **Fixed** | Fix committed/verified |
| **In Progress** | Fix being implemented |

---

## 10. Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Test Lead | | | |
| QA Lead | | | |
| Senior Engineer | | | |
| Lead Developer | | | |
| Product Lead | | | |
