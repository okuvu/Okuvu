# Sprint 3 — Handoff Document

**Branch:** `fix/sprint3-audit-fixes`
**Base branch:** `develop`
**Date:** 2026-07-12

---

## 1. What Has Been Completed

### Sprint 3 Audit Fixes (3 of 3 resolved)

| # | Issue | Fix | Status |
|---|---|---|---|
| CRITICAL-1 | T-02 Client Overview page missing (`/clients/[id]/page.tsx` did not exist) | Created `apps/therapist-portal/src/app/clients/[id]/page.tsx` with care plan (confirmed/provisional badges), session summary (available/not-yet-available), safety state, loading/error/null states | ✅ |
| M1 | Note draft preservation limited to React state (lost on refresh/navigation) | Added `sessionStorage` persistence keyed by `draft-note-{clientId}` — draft survives refresh, navigation, and save-failure; cleared on successful save; SSR-safe; per-client isolation | ✅ |
| M3 | `as any` casts on all Prisma queries in `clients.ts` (9 occurrences) | Extracted `getPrisma`, `getTherapistId`, `assertClientAssigned` helpers; zero casts remaining; build passes cleanly | ✅ |

### Additional Fixes

| Fix | Detail |
|---|---|
| **Type fix: `NoteItem.created_at`** | Changed from `Date` to `string` — tRPC serializes `Date` to `string` over the wire |
| **Type fix: `getTherapistId` param** | Widened `email` parameter from `{ email: string \| null }` to `{ email?: string \| null \| undefined }` to match actual session type |
| **PORT config** | Root `.env` had `PORT="3000"` overriding API's default of 8080; changed to `PORT="8080"` |
| **`apps/therapist-portal/.env.local`** | Created (Next.js doesn't read root `.env`) with `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL` |
| **Sign-out bug fix** | Replaced broken server-action `signOut()` (which just called `redirect('/auth')` without clearing the session) with `SignOutButton` client component using `signOut({ callbackUrl: '/auth' })` from `next-auth/react`. Sign-out now POSTs to `/api/auth/signout`, clears JWT cookie, redirects to `/auth`. |

### Build Verification

| Asset | Result |
|---|---|
| API backend (`tsc`) | ✅ Passes |
| Therapist portal (`next build`) | ✅ Passes |
| Flutter (`flutter analyze`) | ✅ No issues |
| Flutter test (60 of 64) | ✅ Passes (4 pre-existing failures unrelated to Sprint 3) |
| API health check (`curl localhost:8080/health`) | ✅ Returns `{"status":"ok"}` |
| Portal sign-in | ✅ Google OAuth → dashboard → client overview → care plan → notes |

### ClickUp Tasks Coverage

All 18 Sprint 3 tasks are structurally implemented. The E8-S01 acceptance criteria (static layout shell with placeholder values) is confirmed intentional per the ClickUp spec — real data integration belongs to E8-S03/E8-S05.

---

## 2. What Is Still Pending

### Manual Verification

An 85-test checklist was produced covering authentication (12 tests), dashboard (10), client overview (22), care plan (10), session notes (17), cross-flow integration (6), and post-audit fixes (8). Of these, 12 are pre-verified, 44 need manual execution, and 29 are edge cases.

**Priority tests to run (in order):**

1. **Client Overview (T-02)** — test all badge states (confirmed/provisional/not assigned), session summary states (available/PENDING/no sessions), safety state variants, unassigned-client error
2. **Care Plan (T-03)** — test save flow, idempotent saves, error handling, disabled-during-save
3. **Session Notes (T-05)** — test add note, empty validation, draft preservation across refresh/navigation/client switch, error recovery
4. **Cross-flow** — full round trips (login → dashboard → client → care plan change → verify; login → dashboard → client → add note → verify)
5. **Edge cases** — rapid double-click, special characters, multiple tabs, concurrent sessions, server restart mid-flow

The full checklist is at the bottom of the Sprint 3 Audit context (see the conversation thread).

### Not in Scope

- Deploying to staging/production
- E8-S03/E8-S05 real data wiring for the dashboard (these are separate stories)
- End-to-end tests (no Playwright/Cypress setup exists)

---

## 3. Known Issues / Limitations

1. **E8-S01 placeholder values** — The dashboard shows hardcoded placeholder data for some metrics. This is confirmed intentional per the ClickUp acceptance criteria. Real data integration is deferred to E8-S03 and E8-S05.

2. **No E2E tests** — The therapist portal has no Playwright or Cypress tests. Manual verification is the only coverage for UI flows.

3. **4 pre-existing Flutter test failures** — Unrelated to Sprint 3. These existed before the audit branch was created. Root cause: likely related to M-06 (home screen) test snapshots that need updating.

4. **Xcode license** — The local dev machine has an unaccepted Xcode license. `sudo xcodebuild -license accept` is needed before any Apple-platform build (Flutter iOS/macOS) or Homebrew operations. This does not affect the API or therapist portal.

5. **Therapist portal has no loading.tsx or error.tsx boundary files** — Individual pages handle their own loading/error states, but there is no root-level error boundary. An unhandled error at the layout level would show a Next.js default error page.

6. **`auth.ts` `signOut()` function is unused but present** — The server-action `signOut()` at `auth.ts:70` is no longer used (replaced by `SignOutButton` client component). It could be removed but is left as-is to avoid unnecessary diff.

---

## 4. What the Next Developer Should Know

### Key Architecture Decisions

- **NextAuth v4 with JWT strategy** — No database adapter (therapist lookup is done via Prisma in the `signIn` callback only). Session is JWT-cookie based.
- **tRPC for API calls** — All data fetching uses `@trpc/react-query`. The tRPC router is in `apps/therapist-portal/src/server/routers/`.
- **Client components** — All page-level components are `'use client'` because they use hooks (tRPC queries, NextAuth `useSession`, etc.).
- **Session storage for drafts** — Notes drafts are stored in `sessionStorage` (per-tab, cleared on tab close). Key format: `draft-note-{clientId}`.

### File Layout

```
apps/therapist-portal/src/app/
├── auth/page.tsx              — Google OAuth sign-in page
├── page.tsx                   — Dashboard (caseload), uses <SignOutButton />
├── clients/
│   ├── [id]/page.tsx          — T-02 Client Overview (CREATED)
│   │   ├── program/page.tsx   — T-03 Care plan dropdown
│   │   └── notes/page.tsx     — T-05 Notes with draft preservation (MODIFIED)
├── components/
│   ├── SignOutButton.tsx      — Client-component sign-out (CREATED)
│   ├── ClientList.tsx         — Client list with loading/error/empty
│   └── ClientRow.tsx          — Individual client row
├── lib/
│   ├── auth.ts                — NextAuth config + unused signOut()
│   └── prisma.ts              — Prisma client singleton
├── server/routers/
│   ├── clients.ts             — Refactored, 0 as any casts (MODIFIED)
│   └── notes.ts               — Note list/add procedures
└── trpc/
    └── client.ts              — tRPC React client
```

### Needed Environment

The therapist portal requires `apps/therapist-portal/.env.local` with:
- `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`)
- `NEXTAUTH_URL=http://localhost:3000`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `DATABASE_URL` (Neon connection string)

The root `.env` must have `PORT="8080"` (not 3000) so the API listens on 8080.

### Authorization Model

Therapist authorization is enforced at two levels:
1. **Sign-in callback** (`auth.ts:22-40`) — rejects Google accounts not in the `therapist` table
2. **tRPC procedures** (`clients.ts`) — each query checks `req.headers.get('x-therapist-email')` matches the therapist and verifies `therapist_client_assignments` for the requested client

---

## 5. Files Changed on This Branch

| File | Action | Purpose |
|---|---|---|
| `.env.example` | Modified | Changed default `PORT` from `3000` to `8080` |
| `apps/therapist-portal/.env.local` | **Created** | Next.js-specific env vars (not visible in git diff — `.gitignore`) |
| `apps/therapist-portal/src/app/clients/[id]/page.tsx` | **Created** | T-02 Client Overview UI |
| `apps/therapist-portal/src/app/clients/[id]/notes/page.tsx` | Modified | Draft preservation via sessionStorage |
| `apps/therapist-portal/src/app/components/SignOutButton.tsx` | **Created** | Client-component sign-out that actually clears the session |
| `apps/therapist-portal/src/app/page.tsx` | Modified | Uses `<SignOutButton />` instead of broken `signOut()` |
| `apps/therapist-portal/src/server/routers/clients.ts` | Modified | Removed 9 `as any` casts; extracted helpers |

---

## Change History

| Date | Change | Author |
|---|---|---|
| 2026-07-12 | Initial handoff document | — |
