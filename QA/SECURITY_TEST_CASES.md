# Evia Therapist Portal — Security Test Cases

**Purpose:** Verify the portal's security boundary: authentication (E10-S01), allowlist enforcement, route guarding (`proxy.ts`), tRPC authorization (UNAUTHORIZED/FORBIDDEN), therapist-to-client scoping on read and write paths, session/JWT handling, and local-only bypass flags.

**Security sources in code:**
- `apps/therapist-portal/src/lib/auth.ts` — NextAuth config, Google provider, allowlist in `signIn` callback, JWT session.
- `apps/therapist-portal/src/proxy.ts` — route guard (redirects unauthenticated traffic).
- `apps/therapist-portal/src/server/trpc.ts` — `isAuthed` middleware (UNAUTHORIZED), context wiring.
- `apps/therapist-portal/src/server/routers/clients.ts` — `getTherapistId`, `assertClientAssigned` (FORBIDDEN).
- `apps/therapist-portal/src/server/routers/notes.ts` — therapist lookup + assignment check.
- `apps/api/src/lib/check-production-bypass.ts` — production guard against bypass flags.
- `apps/api/src/middleware/auth.ts` — Fastify middleware (for the mobile backend; referenced for completeness).
- `docs/therapist-portal-signin-setup.md`, `docs/therapist-onboarding/therapist-seed-guide.md` — allowlist setup.

**Hard security facts verified from code (record these as baseline before executing):**

1. **Allowlist = the `therapist` table.** `auth.ts:33-45` looks up the Google email in `prisma.therapist`; missing → `/auth?error=unauthorized`; DB failure → `/auth?error=server_error`.
2. **`LOCAL_DEV_BYPASS_AUTH=true` bypasses the allowlist** in the auth callback (`auth.ts:24-26`), the route guard (`proxy.ts:15-17`), and tRPC context (`trpc.ts:6-8`). This is **local-only**.
3. **tRPC protected procedures** reject unauthenticated calls via `isAuthed` (`trpc.ts:17-22`) with `UNAUTHORIZED`.
4. **Therapist scoping** is derived from the **session email**, never from a client-supplied id (`clients.ts:22-51`). Cross-therapist reads/writes throw `FORBIDDEN`.
5. **`proxy.ts` is NOT a security boundary** — it's a UX redirect. Real enforcement is server-side (NextAuth session + tRPC middleware + scoping). Do not mark a test "pass" based on the redirect alone.
6. **Production bypass guard:** `check-production-bypass.ts` refuses to start the API if `NODE_ENV=production` with `LOCAL_DEV_BYPASS_AUTH=true` or `LOAD_TEST_MODE=true`. The portal should be audited to confirm it also cannot run with bypass in production.

---

## SEC-001 — Allowlist blocks non-therapist Google account

| Field | Value |
|---|---|
| Test Case ID | SEC-001 |
| Module | Security |
| Feature | Auth allowlist |
| Story ID | E10-S01 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm a Google account not in the `therapist` table cannot access the portal. |
| Requirement Reference | E10-S01 FR-4, AC-2 |
| Preconditions | Bypass disabled; `unauthorized@gmail.com` not in `therapist` table. |
| Test Data | `unauthorized@gmail.com` |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Sign in with `unauthorized@gmail.com` | Redirected to `/auth?error=unauthorized`; banner shown |
| 2 | Try `/dashboard`, `/clients/<uuid>` | Redirected to `/auth` |
| 3 | Try `fetch('/api/trpc/clients.list')` | Proxy redirect (307) or UNAUTHORIZED; no data returned |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SEC-002 — Allowlist allows only authorized emails

| Field | Value |
|---|---|
| Test Case ID | SEC-002 |
| Module | Security |
| Feature | Auth allowlist |
| Story ID | E10-S01 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm allowed emails sign in; confirm the exact allowlist source is the `therapist` table. |
| Requirement Reference | E10-S01 AC-1; seed guide |
| Preconditions | Real OAuth creds. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Confirm `qa.therapist@example.com` exists in `Therapist` | `SELECT id,email FROM "Therapist";` shows it |
| 2 | Sign in with that account | Reaches `/dashboard` |
| 3 | Remove the row via SQL, sign out and sign in again | Now rejected with `?error=unauthorized` (allowlist is live DB) |
| 4 | Re-add the row | Sign-in works again |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SEC-003 — Server error path does not bypass auth

| Field | Value |
|---|---|
| Test Case ID | SEC-003 |
| Module | Security |
| Feature | Auth error handling |
| Story ID | E10-S01 |
| Priority | P1 |
| Severity | High |
| Objective | Confirm a DB failure during sign-in denies access (no open fallback). |
| Requirement Reference | E10-S01 Error Handling, Security |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Break the DB connection, sign in with an allowlisted account | `/auth?error=server_error`; NOT granted portal access |
| 2 | Restore DB | Sign-in works again |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SEC-004 — Route guard protects all portal routes

| Field | Value |
|---|---|
| Test Case ID | SEC-004 |
| Module | Security |
| Feature | Route guard |
| Story ID | E10-S01 FR-3 |
| Priority | P0 |
| Severity | Critical |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Logged out, visit each: `/`, `/dashboard`, `/clients/xxx`, `/clients/xxx/program`, `/clients/xxx/notes` | All redirect to `/auth` |
| 2 | Verify `/auth` itself loads | Public route renders login |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SEC-005 — tRPC middleware rejects unauthenticated calls (defense in depth)

| Field | Value |
|---|---|
| Test Case ID | SEC-005 |
| Module | Security |
| Feature | tRPC auth middleware |
| Story ID | E10-S02 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm the `isAuthed` middleware is the enforcement layer, independent of the UI redirect. |
| Requirement Reference | E10-S02 FR-3, Security; E10-S01 |
| Preconditions | Bypass disabled, logged out. |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Call a protected procedure directly (e.g. via server-side call or curl with redirect disabled: `curl -sL -o /dev/null -w "%{http_code}" http://localhost:3000/api/trpc/example.getMe`) | Without proxy: `UNAUTHORIZED`. With proxy: 307 redirect. Record both |
| 2 | Review `src/server/trpc.ts` `isAuthed` | Throws `TRPCError UNAUTHORIZED` when `!ctx.session?.user` |
| 3 | Confirm NO protected procedure forgets the middleware | Grep routers: `clients.*`, `notes.*`, `example.getMe` all use `protectedProcedure` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SEC-006 — Cross-therapist list access blocked

| Field | Value |
|---|---|
| Test Case ID | SEC-006 |
| Module | Security |
| Feature | Scoping — read list |
| Story ID | E10-S03 FR-3, AC-2 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm a therapist can never retrieve another therapist's client list. |
| Requirement Reference | E10-S03 AC-2 |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Log in as Therapist A and Therapist B (separate browsers) | A sees only A's clients; B sees only B's clients |
| 2 | Attempt to craft a request to widen scope | `clients.list` takes no input; therapist derived from session — no injection surface |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SEC-007 — Cross-therapist detail access blocked (sensitive payload)

| Field | Value |
|---|---|
| Test Case ID | SEC-007 |
| Module | Security |
| Feature | Scoping — read detail |
| Story ID | E10-S05 FR-4, AC-3 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm reasoning_note + safety_state are never exposed cross-therapist. |
| Requirement Reference | E10-S05 Security |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | As Therapist A, call `clients.detail` for Therapist B's client id | `FORBIDDEN` "Client is not assigned to this therapist"; reasoning_note/safety_state not leaked |
| 2 | Try alternative id formats / encode the id | Still `FORBIDDEN` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SEC-008 — Cross-therapist write blocked (care plan)

| Field | Value |
|---|---|
| Test Case ID | SEC-008 |
| Module | Security |
| Feature | Scoping — write care plan |
| Story ID | E11-S01 FR-3, AC-3 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm no therapist can change care plan for an unassigned client. |
| Requirement Reference | E11-S01 Security |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | As Therapist A, call `setCarePlan` for Therapist B's client | `FORBIDDEN`; DB unchanged |
| 2 | Confirm assignment check runs before the write | Check `assertClientAssigned` runs before `upsert` in `clients.ts:222` |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SEC-009 — Cross-therapist note write blocked

| Field | Value |
|---|---|
| Test Case ID | SEC-009 |
| Module | Security |
| Feature | Scoping — notes |
| Story ID | E11-S03 AC-3 |
| Priority | P0 |
| Severity | Critical |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | As Therapist A, call `notes.addNote` for an unassigned client | `FORBIDDEN`; no row created |
| 2 | As Therapist A, call `notes.listNotes` for an unassigned client | `FORBIDDEN`; no notes returned |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SEC-010 — Notes never enter any agent context (architectural boundary)

| Field | Value |
|---|---|
| Test Case ID | SEC-010 |
| Module | Security |
| Feature | Non-ingestion boundary |
| Story ID | E11-S03 AC-2, E11-S03 "never ingested" |
| Priority | P0 |
| Severity | Critical |
| Objective | Verify the hard boundary: `TherapistNote` is never referenced by any agent/context code. |
| Requirement Reference | E11-S03 FR-4, AC-2, Design.md §5.6 |
| Preconditions | Code-level verification (grep). |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Grep the repo for `TherapistNote`/`therapistNote` outside `apps/therapist-portal` | No references in `apps/api`, agents, context-bundle assembly, or the mobile app |
| 2 | Grep for context bundle assembly (e.g. `AgentContextBundle`, session summaries feeding A2) | `therapist notes` / `TherapistNote` absent from those queries |
| 3 | Confirm notes table is isolated in schema | `TherapistNote` has no relation used by agent-facing code |
| 4 | Record result | PASS = zero agent-facing references |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SEC-011 — Session/JWT handling

| Field | Value |
|---|---|
| Test Case ID | SEC-011 |
| Module | Security |
| Feature | NextAuth session |
| Story ID | E10-S01 |
| Priority | P0 |
| Severity | High |
| Objective | Confirm JWT session strategy is configured and session identity flows into tRPC. |
| Requirement Reference | E10-S01 FR-2, NFR Security; E10-S02 |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Review `authConfig` in `auth.ts` | `session: { strategy: 'jwt' }`; `session` callback sets `session.user.id = token.sub` |
| 2 | Confirm the session cookie is httpOnly/secure as NextAuth default | Record current cookie flags in DevTools → Application → Cookies |
| 3 | Confirm `getServerSession` (server) and `useSession` (client) both reflect the same user | Dashboard name matches Google name |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SEC-012 — Session expiry / timeout

| Field | Value |
|---|---|
| Test Case ID | SEC-012 |
| Module | Security |
| Feature | Session timeout |
| Story ID | E10-S01 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm an expired/invalidated session is rejected. |
| Requirement Reference | E10-S01 NFR Security, NFR Reliability |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Log in; manually expire the session (clear the NextAuth session cookie or `signOut`) | `/dashboard` redirects to `/auth`; tRPC protected calls fail |
| 2 | Confirm no stale-session data renders | Dashboard never shows cached data for a logged-out user after a full reload |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SEC-013 — Bypass flag is local-only (production guard)

| Field | Value |
|---|---|
| Test Case ID | SEC-013 |
| Module | Security |
| Feature | LOCAL_DEV_BYPASS_AUTH |
| Story ID | E10-S01, E12-S05 (HALT context) |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm the bypass flag cannot enable in production. |
| Requirement Reference | `apps/api/src/lib/check-production-bypass.ts`; CONTRIBUTING.md |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Review `check-production-bypass.ts` | API refuses to start if `NODE_ENV=production` and (`LOCAL_DEV_BYPASS_AUTH=true` or `LOAD_TEST_MODE=true`) |
| 2 | Audit portal + cloud configs | No cloud/CI config sets `LOCAL_DEV_BYPASS_AUTH=true`; `.env.example` documents it as local |
| 3 | Grep committed files for `LOCAL_DEV_BYPASS_AUTH` | Present only in `.env.example`, `next.config.ts` env passthrough, and source logic — never hardcoded `true` in a non-local path |
| 4 | Confirm portal cannot run bypass in production | If the portal has no equivalent guard to the API's, log a finding in BUG_CANDIDATES.md |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## SEC-014 — No secrets committed

| Field | Value |
|---|---|
| Test Case ID | SEC-014 |
| Module | Security |
| Feature | Credentials hygiene |
| Story ID | E10-S01 |
| Priority | P0 |
| Severity | Critical |
| Objective | Confirm no service keys or .env values are committed. |
| Requirement Reference | CONTRIBUTING.md; PR checklist |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | `git grep -n "AIza\|service_account\|BEGIN.*PRIVATE KEY"` in the repo | No matches in tracked files |
| 2 | Verify `.env*` is gitignored | `.env` absent from `git ls-files` |
| 3 | Review `.env.example` | Contains placeholders only, no real values |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## Security Test Summary

| ID | Area | Priority | Status |
|---|---|---|---|
| SEC-001 | Allowlist rejection | P0 | |
| SEC-002 | Allowlist enforcement (live DB) | P0 | |
| SEC-003 | Server-error denial | P1 | |
| SEC-004 | Route guard | P0 | |
| SEC-005 | tRPC middleware (defense in depth) | P0 | |
| SEC-006 | Cross-therapist list | P0 | |
| SEC-007 | Cross-therapist detail | P0 | |
| SEC-008 | Cross-therapist care-plan write | P0 | |
| SEC-009 | Cross-therapist note write | P0 | |
| SEC-010 | Notes never ingested | P0 | |
| SEC-011 | JWT session handling | P0 | |
| SEC-012 | Session expiry | P1 | |
| SEC-013 | Bypass production guard | P0 | |
| SEC-014 | No secrets committed | P0 | |
