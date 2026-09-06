# Evia Therapist Portal — Full-Stack Audit

**Prepared for:** Evia product/eng team — therapist portal engineering & security review
**Scope:** `apps/therapist-portal` (Next.js 16 + tRPC + NextAuth), cross-referenced against `packages/prisma` (shared schema/migrations) and `packages/shared-types`. `apps/api`, `apps/worker`, and `apps/mobile` are referenced only for contrast (e.g. their production-bypass guard) — they are not the object of this review.
**Method:** Static code review of the current `develop` branch (HEAD `0a724b0`, "Test harness Environment (#195)"). No emulator/browser session was run. Every finding is traced to a specific file and line.
**Date:** 2026-09-06

> **Remediation status (2026-09-06): all 13 findings below (F-01 through F-13) have been addressed** in the codebase — see the "Fixed" note under each finding for what changed and where. This document is kept as-written (the original audit) plus those notes, rather than rewritten, so it remains a record of what was found and what was done about it.

> **Live verification (2026-09-06):** the fixes above were not just typechecked — the portal was actually run against a real Postgres 16 + pgvector database (all 11 migrations, including the new `ClinicalAccessLog` one, applied cleanly) with seeded therapist/client data, and driven with real HTTP requests (including a genuine NextAuth session token, not just `LOCAL_DEV_BYPASS_AUTH`). Confirmed live: an assigned therapist reads real client data and it lands two rows in `ClinicalAccessLog` (F-05); an unassigned therapist gets a real `403 FORBIDDEN` from `clients.detail`; `admin.amIAdmin`/`listTherapists` correctly gate on `ADMIN_EMAILS` (F-07); the 21st mutation in 60 seconds gets a real `429 TOO_MANY_REQUESTS` (F-11); and — the important one — a `next build` + `next start` with `NODE_ENV=production` and the bypass flag `true` actually refuses to serve (F-01).
>
> That last check surfaced a real gap in the first version of the F-01 fix: Next.js does not exit the process when an `instrumentation.ts` `register()` hook throws — it logs the error but leaves the HTTP listener up, answering every request with a bare 500. That's fail-closed (no data exposure) but would not register as a failed deployment to Vercel/Docker/k8s health checks the way `apps/api`'s explicit `process.exit(1)` does. Fixed by wrapping the guard in `instrumentation.ts` with the same explicit `console.error(...); process.exit(1)` pattern — re-verified: the process now exits with code 1 and the port closes entirely.
>
> Running it end-to-end also surfaced two issues outside the original 13, fixed in the same pass:
> - **Nested `<main>` landmarks**, introduced by the F-02 fix itself: `clients/[id]/layout.tsx` already wraps its children in `<main className="p-4 md:p-8">`, so once `AuthenticatedShell` was removed from `page.tsx`/`notes/page.tsx`/`program/page.tsx`, their own top-level `<main>` wrappers (used for loading/error/content states) became invalid nested `<main>` elements with doubled padding. Changed to plain `<div>`s, since the page-level landmark now comes solely from the layout.
> - **Fully orphaned design-token CSS and font loads**, left behind by the F-04 rewrite: once the care-plan page stopped using `font-display-title`/`bg-surface`/etc., nothing in the app referenced that Material-Design-3-style token system or the Inter/Material Symbols Google Fonts it existed for. Removed the entire `@theme` block from `globals.css` and both font `<link>` tags from the root layout — two fewer external font requests on every single page load.
> - Also fixed, as a related consistency issue rather than a new finding: `auth()` (used by `dashboard/page.tsx` and the new `admin/page.tsx`) never checked `LOCAL_DEV_BYPASS_AUTH`, unlike `proxy.ts` and `server/trpc.ts` — so the flag only partially worked for local dev. Made consistent; safe because F-01's boot guard already guarantees the flag can never be `true` in production.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scorecard](#2-scorecard)
3. [Architecture Overview](#3-architecture-overview)
4. [Frontend Audit](#4-frontend-audit)
5. [Backend Audit](#5-backend-audit)
6. [API Audit](#6-api-audit)
7. [Database Audit](#7-database-audit)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [Security & Privacy](#9-security--privacy)
10. [UI / UX Audit](#10-ui--ux-audit)
11. [Accessibility](#11-accessibility)
12. [Responsive Design](#12-responsive-design)
13. [Performance](#13-performance)
14. [Error & State Handling](#14-error--state-handling)
15. [Testing](#15-testing)
16. [Code Quality & Observability](#16-code-quality--observability)
17. [Therapist Workflow Analysis](#17-therapist-workflow-analysis)
18. [Finding Register](#18-finding-register)
19. [Risk Matrix](#19-risk-matrix)
20. [Quick Wins](#20-quick-wins)
21. [Recommended Roadmap](#21-recommended-roadmap)
22. [Final Assessment](#22-final-assessment)

---

## 1. Executive Summary

The therapist portal is a small, honestly-scoped Next.js application: a login gate, a caseload table, a per-client detail page, a private notes log, and a care-plan selector. It is **not** a general clinical EHR — there is no scheduling, billing, messaging, file storage, or multi-role admin surface, and none is assumed by this review. Within that scope, the core authorization pattern is genuinely sound: every clinical read or write is checked against a `TherapistClient` assignment row before it touches patient data (§8).

What pulls the portal down is not the happy path — it's the edges. A single environment flag can silently disable every one of those checks at once, with none of the boot-time refusal its sibling services enforce (F-01). Two of the app's four screens render their navigation chrome twice, pushing real content roughly 240px further right than the dashboard (F-02). The only sign-out control in the entire product is hidden on phones (F-03). And the care-plan page — which changes what clinical track the AI companion follows — is a second, unrelated design system stapled under the shared layout (F-04).

### Strengths

- Object-level authorization is real, not decorative — every client-scoped procedure calls `assertClientAssigned()` against the DB, not the session (`clients.ts`, `notes.ts`).
- End-to-end typed contract via tRPC removes an entire class of frontend/backend drift.
- Deliberate, well-communicated clinical boundary: therapist notes are explicitly never fed to the AI, and the UI says so in plain language at the point of entry.
- CI already guards against committed secrets, credential files, and hardcoded bypass flags.

### Biggest risks

- Auth-bypass blast radius: one env var, no production refusal-to-boot, unlike `apps/api` and `apps/worker`.
- No audit trail of therapist access to a client's safety state, reasoning notes, or summaries.
- Zero automated tests for the app that decides who can see clinical data.
- No in-product way to onboard a therapist or assign a client — every roster change is a raw DB script.

### Production readiness

**Conditionally ready for a small, supervised pilot; not ready for unsupervised general release.** The data-access model is fundamentally correct for a single-tenant, small-roster pilot. The blockers are operational and defensive, not architectural: close the bypass-flag gap, add PHI-access logging, and put automated tests on the authorization layer before scaling the therapist roster past what one engineer can watch by hand.

### Top 10 actions

1. Add a production boot/build guard for `LOCAL_DEV_BYPASS_AUTH` in the portal, matching `checkProductionBypass()` in `apps/api` (F-01).
2. Fix the duplicated `<Sidebar>`/layout nesting on `/clients/[id]` and `/clients/[id]/notes` (F-02).
3. Give mobile viewports a way to sign out (F-03).
4. Rebuild the care-plan page on the shared design system and shell (F-04).
5. Add a minimal access log for reads of safety state, reasoning notes, and session summaries (F-05).
6. Require confirmation before a care-plan change commits (F-06).
7. Ship a first-party (even admin-only, low-fi) flow for therapist onboarding and client assignment (F-07).
8. Collapse the three duplicated therapist-resolution blocks into one tRPC middleware (F-08).
9. Delete the dead components and example router before they're mistaken for live surface (F-09).
10. Add authorization-focused tests: an unassigned therapist must never reach another's client (F-12).

---

## 2. Scorecard

Scored against what the portal actually implements, not a generic EHR checklist.

| Area | Score | Reasoning |
|---|---:|---|
| Frontend Architecture | 6/10 | Clean App Router + tRPC pattern, undercut by shell duplication and dead components. |
| Backend Architecture | 6/10 | Thin and readable; auth-resolution logic copy-pasted three times instead of a shared procedure. |
| API Design | 6/10 | tRPC gives real type-safety; a scaffold `example` router still ships live. |
| Database | 7/10 | Sane normalization, real indexes on hot paths, correct unique constraints — but no PHI access-log table. |
| Authentication | 6/10 | Google OAuth gated by a DB allowlist is a solid low-maintenance choice; no idle-timeout tuning for clinical data. |
| Authorization | 5/10 | Resource checks are correct and consistent, but one flag defeats all of them with no boot-time refusal. |
| Security | 5/10 | Good CI guardrails on secrets; no rate limiting anywhere; bypass blast radius as above. |
| UI Consistency | 4/10 | The care-plan page is a visibly different product stitched under the shared chrome. |
| UX | 6/10 | Clear cards, good empty/loading states, honest copy — undercut by the layout bug and no confirm-before-commit on a clinical change. |
| Accessibility | 5/10 | Good aria-live usage on forms; three sets of dead icon buttons with misleading labels; duplicate nav landmarks. |
| Responsiveness | 5/10 | Breakpoints are considered, but mobile has no sign-out path at all. |
| Performance | 6/10 | Caseload sizes are small today; the eager multi-join on every list/detail call won't scale the roster far. |
| Error Handling | 6/10 | Every screen has a real error state with retry; nothing is centrally logged when it fires. |
| Testing | 2/10 | Zero automated tests in `apps/therapist-portal`; CI runs typecheck only. |
| Maintainability | 6/10 | Small, legible codebase; a handful of orphaned files and duplicated logic to sweep. |
| Observability | 3/10 | No error tracker, no structured logs, no request IDs — only scattered `console.*` calls in `auth.ts`. |
| Production Readiness | 4/10 | Fine for a small supervised pilot; the bypass-flag and audit-trail gaps block anything larger. |

---

## 3. Architecture Overview

Evia is a pnpm monorepo. The therapist portal is one of four deployable apps and does **not** go through the main API — it talks to Postgres directly via its own Prisma client, sharing the database with `apps/api` through the `packages/prisma` schema package.

```text
Browser (therapist, Google account)
   │
   ▼
apps/therapist-portal   (Next.js 16 App Router, Vercel)
   │  ├─ proxy.ts             route guard — session or redirect to /auth
   │  ├─ NextAuth (JWT)        Google OAuth only
   │  └─ tRPC client (React Query) ── httpBatchLink → /api/trpc
   │
   ▼
tRPC server   (src/server/routers/*.ts, runs inside the same Next.js process)
   │  ├─ clientsRouter    list / detail / getCarePlan / setCarePlan
   │  ├─ notesRouter      addNote / listNotes
   │  └─ exampleRouter    scaffold — still mounted, see F-09
   │
   ▼
Prisma client   (src/lib/prisma.ts, @prisma/adapter-pg over a pg Pool)
   │
   ▼
PostgreSQL   (packages/prisma/schema.prisma — shared with apps/api, apps/worker, apps/test-harness)
        User · Therapist · TherapistClient · TherapistNote
        ClinicalConfig · SafetyState · SessionSummary · SessionLog

Sibling apps reading/writing the same database, out of this audit's scope:
  apps/api      Fastify + WebSocket — the AI companion (A2) session pipeline
  apps/worker   Cloud Tasks consumer — summaries, cleanup
  apps/mobile   Flutter client app used by patients ("Users")
```

Two consequences of this shape are worth stating up front, because several findings below trace back to them:

- **No service boundary between the portal and the AI pipeline.** They're separate deployables that happen to share one schema package and one database. A migration authored for `apps/api`'s needs can change a column the portal depends on, and vice versa — there's no contract layer between them beyond the shared Prisma types.
- **The portal is its own perimeter.** Because it never calls `apps/api`, none of that service's request-level protections (e.g. its production-bypass boot guard, §9) apply to it. The portal has to defend itself, and in one specific place (F-01) it currently doesn't.

> **Scoping note.** A generic therapist-portal checklist would assume scheduling, billing, messaging, and document management. None of that exists here, and nothing below assumes it should — Evia's actual model is a lightweight therapist-oversight layer on top of an AI-led care product, and it's audited as that.

---

## 4. Frontend Audit

Next.js 16 (App Router) · React 19 · Tailwind 4 · tRPC 11 + React Query 5 · NextAuth 4. Four route groups: `/auth`, `/dashboard`, `/clients/[id]`, and its two children `/clients/[id]/notes` and `/clients/[id]/program`.

**Structure.** The component tree is small and mostly legible: page components fetch via a typed tRPC hook, render a loading skeleton, an error card with retry, or the data. That pattern repeats correctly on the dashboard (`DashboardContent.tsx`), the client detail page, and the notes page — a consistent, good habit worth keeping as the app grows.

**Duplicated / dead components.** Two full implementations of the same caseload list exist side by side: `src/app/dashboard/_components/ClientTable.tsx` (used, rendered from `DashboardContent.tsx`) and `src/app/components/ClientList.tsx` + `ClientRow.tsx` (not imported anywhere in the app — confirmed by repo-wide search). `src/app/components/SignOutButton.tsx` is similarly orphaned; the only working sign-out control is inlined directly in `_components/sidebar.tsx:184-195`. See F-09.

**Two shells for the same app.** There are two different "authenticated shell" implementations doing the same job — `clients/[id]/layout.tsx` (Sidebar + TopBar) and `components/AuthenticatedShell.tsx` (Sidebar only) — and both are active at once on two of the four screens. This is the root cause of F-02; see §10 for the visual consequence.

**State & forms.** State is kept local and simple — no global client-state library, which is appropriate at this size. The notes form (`clients/[id]/notes/page.tsx`) is the one place with meaningful client logic: it drafts to `sessionStorage` keyed by client ID so an in-progress note survives an accidental reload, clears the draft on successful submit, and disables the submit button while the mutation is in flight (correctly preventing duplicate submissions). That's a genuinely good pattern for a long-form clinical field — see the privacy read on the storage choice in §9.

---

## 5. Backend Audit

The portal has no separate backend process — its "backend" is the tRPC router tree executing inside the same Next.js server, talking to Postgres through Prisma. There is no service or repository layer; procedures call Prisma directly, which is a reasonable choice at this scale.

**Repeated authorization logic.** The same three-step sequence — resolve `Therapist` by session email, then check `TherapistClient` for the target client, then proceed — is hand-written independently in three places: `clients.ts`'s `getTherapistId()`/`assertClientAssigned()` (lines 22-76), and inline twice more inside `notes.ts`'s `addNote` (lines 14-42) and `listNotes` (lines 66-93). All three are currently consistent, but nothing enforces that a fourth procedure added later repeats them correctly. This should be a single `therapistProcedure` tRPC middleware that resolves `ctx.therapistId` once. See F-08.

**Error surface.** Procedures throw typed `TRPCError`s (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_SERVER_ERROR`) with client-safe messages — no stack traces or internal details leak to the client in the code paths reviewed. There's no central error-formatting hook or logging sink wired to those throws, though — a `FORBIDDEN` thrown by `assertClientAssigned()` (i.e., someone probing another therapist's client) produces no server-side record at all. That's the same gap noted under Observability (§16) and Security (F-05).

---

## 6. API Audit

One transport: tRPC over a single `/api/trpc` HTTP-batch endpoint (`trpc/provider.tsx`). Five real procedures across two routers, plus a leftover scaffold router.

| Procedure | Type | Auth | Object-level check | Input validation |
|---|---|---|---|---|
| `clients.list` | query | session | scoped by resolved therapist id | none needed (no input) |
| `clients.detail` | query | session | **yes** — `assertClientAssigned` | zod: `clientUserId` string |
| `clients.getCarePlan` | query | session | **yes** | zod: `clientId` min(1) |
| `clients.setCarePlan` | mutation | session | **yes** | zod: `clientId`, `carePlanId` enum |
| `notes.addNote` | mutation | session | **yes** | zod: `noteText` trim().min(1) |
| `notes.listNotes` | query | session | **yes** | zod: `clientId` min(1) |
| `example.getMe` | query | session | n/a — returns own session | — |
| `example.health` / `echo` | query | **public** | n/a | `echo`: zod `message` string |

Input validation is consistent and real (zod on every parameterized procedure) — this is a genuine strength worth preserving as the router grows. The frontend/backend contract can't silently drift because both sides import the same `AppRouter` type; there is no hand-maintained OpenAPI/REST schema to fall out of sync.

The one contract inconsistency: `notes.listNotes`'s own inline comment says `clientId` "is a phone number, not a UUID" (`notes.ts:61`), while every other procedure treats the same conceptual field as the client's `User.id` UUID (e.g. `clients.detail`'s `clientUserId`, which is what the route param actually is — see `clients/[id]/notes/page.tsx:33` passing `params.id`, a UUID, straight through). The comment is stale and describes a shape the code no longer uses; harmless today only because both fields are validated as opaque non-empty strings, but worth deleting before it misleads the next change.

---

## 7. Database Audit

`packages/prisma/schema.prisma`, PostgreSQL via `@prisma/adapter-pg`. Nine migrations touch the therapist-facing models; the schema also carries an unrelated, much larger "test harness" model set (`TestRun`, `CorpusCase`, `GateSignOff`, …) used by a separate evaluation app — not reviewed here as out of scope.

**Tenant isolation.** There is exactly one isolation boundary in this data model: the `TherapistClient` join table (`therapist_id`, `client_user_id`, unique together, indexed on `client_user_id`). Every therapist-facing query correctly filters through it at the application layer (§6). There is no row-level security in Postgres itself — isolation is enforced entirely in the tRPC layer, which is exactly why F-01 (a flag that skips that layer) is rated as high as it is.

**Findings:**

- **No audit/access-log table.** `GovernanceLog` exists but records AI safety-gate decisions, not human reads of clinical data. There is no table that would answer "which therapist viewed this client's safety state on this date." See F-05.
- **No deactivation state on `Therapist`.** `User` has `deleted_at` for soft-delete; `Therapist` has no equivalent field, so offboarding a therapist has no first-class representation in the schema (only hard delete, which Prisma's default relation behavior will resist while notes/assignments reference the row).
- **Indexes are reasonable for current query patterns.** `SessionLog(user_id, session_started_at desc)`, `Turn(session_id, turn_number)`, `SessionSummary(user_id, created_at desc)`, and `TherapistNote(client_user_id, created_at desc)` all match the queries actually issued against them. Nothing here needs a new index today.
- **`ClinicalConfig.care_plan_id` has no history.** `setCarePlan` (`clients.ts:211-254`) upserts in place — the previous care plan is overwritten with no row-level history of what it changed from, when, or by whom beyond the single updated row. Combined with F-05 and F-06, a care-plan change today leaves no trace at all beyond the new value.

---

## 8. Authentication & Authorization

This is the highest-priority section for a portal handling clinical data. The pattern is sound; one flag can turn it off entirely.

**How it actually works:**

1. **Sign-in** — Google OAuth only (`lib/auth.ts:6-16`). No password is ever handled by this app.
2. **Allowlist check** — The NextAuth `signIn` callback (`auth.ts:20-46`) looks up `Therapist.findUnique({ email })`. No matching row → redirected to `/auth?error=unauthorized`. A Google account alone is never sufficient.
3. **Route guard** — `proxy.ts` redirects any request without a session to `/auth`, for every path except the auth route itself and Next's static assets.
4. **Object-level check, per request** — Every clients/notes procedure re-resolves the therapist from the session email and calls `assertClientAssigned(db, therapistId, clientUserId)` before touching that client's row — this is real authorization, not a UI-only gate. A therapist who is authenticated but not assigned to client 123 gets `FORBIDDEN`, not data.

**The gap: `LOCAL_DEV_BYPASS_AUTH`.** One environment flag, checked independently in three layers, turns all of the above off at once:

- `proxy.ts:15-17` — the route guard returns immediately, no session required, for the entire app.
- `trpc.ts:6-8` — the tRPC context fabricates a session (`{ id: 'mock', email: 'bypass@evia.dev' }`) instead of calling `auth()`.
- `clients.ts:41-43` and `clients.ts:68-70` — `getTherapistId()` returns a fake id instead of throwing when no real therapist matches, and `assertClientAssigned()` returns without checking the assignment at all.

`apps/api` and `apps/worker` both call `checkProductionBypass()` at startup and **refuse to boot** if this flag is true under `NODE_ENV=production` (`apps/api/src/lib/check-production-bypass.ts`, wired in `apps/api/src/server.ts`). Nothing equivalent exists in `apps/therapist-portal` — confirmed by search, no reference to that function or an analogous check anywhere in its source. CI's only related guard (`.github/workflows/ci.yml:122-128`) greps source for the literal string `LOCAL_DEV_BYPASS_AUTH = true`; it cannot catch the flag being set to `"true"` in a deployment platform's environment variables, which is precisely the failure mode this pattern exists to prevent elsewhere in the monorepo. See F-01.

**Role model.** There is exactly one role: a row in `Therapist` is fully privileged over every client assigned to it. There is no admin/clinician distinction, no way to scope a therapist to read-only, and no in-product way to grant or revoke that row (F-07). For the current single-org, small-roster shape this is a reasonable simplification, not a defect — but it means the `Therapist` table itself is the entire access-control system, and nothing currently logs who read from it or when (F-05).

> **F-07 fixed (2026-09-06):** added a `/admin` page and `admin` tRPC router (`server/routers/admin.ts`), gated by an `ADMIN_EMAILS` env allowlist (there is still no role field on `Therapist`, so promoting/demoting an admin is an env-var change — an intentionally small surface for a capability this sensitive). It covers the two operations that previously required a raw CLI script: adding a therapist by email, and assigning a client to a therapist by phone number. A conditional "Admin" link appears in the sidebar for allowlisted emails via a new `admin.amIAdmin` query.

---

## 9. Security & Privacy

Distinguishing confirmed implementation facts from privacy/compliance *concerns* — this audit does not assert a compliance violation, only what the code does.

### F-01 · P0 Critical — Security, access control

**One flag disables authentication and authorization portal-wide, with no production refusal-to-boot.**
Location: `proxy.ts:15-17` · `server/trpc.ts:6-8` · `server/routers/clients.ts:41-43,68-70` · `next.config.ts:5-8`

- **Evidence:** See the three call sites in §8. `next.config.ts` additionally re-exports the flag as `NEXT_PUBLIC_LOCAL_DEV_BYPASS_AUTH`, which Next.js inlines into the client-side JS bundle — if the flag is ever true in a built deployment, that fact is visible in the shipped bundle, not just server-side.
- **Impact:** If this flag is ever `"true"` in a real deployment's environment configuration (e.g. a staging value copied into a production project by mistake), every client's safety state, reasoning notes, session summaries, and therapist notes become reachable to any unauthenticated visitor, with nothing server-side to stop it.
- **Fix:** Add a startup/build-time check in the portal — e.g. in `next.config.ts` or a root `instrumentation.ts` — that throws when `NODE_ENV === 'production' && LOCAL_DEV_BYPASS_AUTH === 'true'`, mirroring `checkProductionBypass()` exactly. Effort: small (< 1 hour).
- **Fixed (2026-09-06):** Added `instrumentation.ts` at the app root exporting `register()` (Next.js's boot hook, runs once per server start in every environment) and `checkProductionBypass()`, ported verbatim from `apps/api`. Also removed the `env` block from `next.config.ts` — both `LOCAL_DEV_BYPASS_AUTH` and its unused `NEXT_PUBLIC_` mirror were being inlined into the client bundle for no reason; server code reads `process.env.LOCAL_DEV_BYPASS_AUTH` directly and never needed that block. Covered by `src/__tests__/production-bypass.test.ts`.

### F-05 · P2 Medium — Privacy, potential compliance concern

**No record of which therapist accessed which client's clinical data.**
Location: `schema.prisma` (no access-log model) · `clients.ts:116-189` (detail) · `notes.ts:58-117` (listNotes)

- **Evidence:** The only history-adjacent table is `GovernanceLog` (`schema.prisma:207-217`), which records AI safety-gate decisions per turn, not human reads. Reads of `SafetyState`, `ClinicalConfig.reasoning_note`, and `SessionSummary` via `clients.detail` leave no trace anywhere.
- **Impact:** If clinical data is ever accessed inappropriately or a breach needs investigating, there is no way to reconstruct who viewed what, when. This is a potential compliance concern for any regime that requires PHI access logging, not a confirmed violation — the repository gives no evidence either way about which regulatory regime applies.
- **Fix:** Add a lightweight `ClinicalAccessLog` table and write to it from `clients.detail` and `notes.listNotes` — therapist id, client id, field category, timestamp. Effort: medium.
- **Fixed (2026-09-06):** Added the `ClinicalAccessLog` model (`packages/prisma/schema.prisma`, migration `20260906000001_add_clinical_access_log`) and a `logClinicalAccess()` helper (`server/trpc.ts`), called from `clients.detail` (`action: "VIEW_CLIENT_DETAIL"`) and `notes.listNotes` (`action: "VIEW_NOTES"`). Logging is best-effort — a write failure is caught and logged server-side rather than blocking the read. Covered by `src/server/__tests__/authorization.test.ts`.

### F-11 · P3 Low — Security, reliability

**No rate limiting on any tRPC procedure.**
Location: `server/trpc.ts` (no rate-limit middleware present anywhere in the router tree)

- **Impact:** A compromised or misbehaving therapist session (or NextAuth itself) has no throttle on note creation, care-plan writes, or list/detail reads. Low likelihood given the small, allowlisted user base, but cheap to close.
- **Fix:** Add per-IP/per-session limits at the edge (Vercel/Next middleware) or a small in-memory/Upstash limiter on mutations first. Effort: small–medium.
- **Fixed (2026-09-06):** Added a per-therapist in-memory limiter (`server/rate-limit.ts`, 20 requests/60s) applied via a `therapistMutation` procedure (`server/trpc.ts`) to `setCarePlan` and `addNote`, and to the new `admin` router's mutations. Documented in-code as best-effort: on a multi-instance serverless deployment each invocation can land on a different instance with its own in-memory state, so this closes the "no limit at all" gap without claiming to be a hard guarantee — a shared store (Upstash/Redis) is the noted upgrade path if abuse becomes a real concern.

**Browser storage & client-side state.** Session-note drafts are kept in `sessionStorage`, keyed `note-draft-${clientId}` (`notes/page.tsx:35,39,58,179`), cleared on successful save. This is a deliberate, reasonable trade-off — sessionStorage (not localStorage) scopes the draft to the tab and clears on close, and losing an in-progress clinical note to an accidental reload is a worse outcome than briefly holding its plaintext client-side. Flagged here as a documented fact for the record, not as a defect: an abandoned draft (started, never saved) does persist in that tab for its lifetime, unencrypted, with the patient's ID visible in the storage key.

**What was checked and found clean:**

- No secrets or `.env` files are committed — verified against git history and `.gitignore`; CI additionally blocks any diff touching a `.env*` or GCP credential file (`ci.yml:107-120`).
- No SQL is hand-built anywhere in the portal — every query goes through Prisma's parameterized query builder.
- No `dangerouslySetInnerHTML`, no raw template concatenation into HTML, in the reviewed source.
- No client-observable role field — the role model (§8) is derived server-side from the DB, never trusted from client input.

---

## 10. UI / UX Audit

Assessed screen by screen, as a therapist would actually move through them.

### F-02 · P1 High — UI architecture, layout defect

**Client detail and notes pages render their navigation shell twice, pushing content ~240px further right.**
Location: `clients/[id]/layout.tsx:22-32` · `components/AuthenticatedShell.tsx:10-18` · `clients/[id]/page.tsx:136` · `clients/[id]/notes/page.tsx:85`

- **Evidence:** `clients/[id]/layout.tsx` — the App Router layout for *every* route under `/clients/[id]` — already renders `<Sidebar/>` and wraps its children in a `div.md:ml-[240px]` plus a `<TopBar/>`. Both `page.tsx` and `notes/page.tsx` then wrap their own content in `<AuthenticatedShell>`, which renders a *second* `<Sidebar/>` and a *second* `div.md:ml-[240px]` — nested inside the first one.
- **Impact:** On desktop, the real page content sits inside two nested 240px left-margins, landing at roughly x=480px instead of x=240px like the dashboard — a large, unexplained blank gutter unique to these two screens. The DOM also gains a second fixed, full-height `<nav>` landmark stacked exactly on top of the first (two unlabeled "sidebar" landmarks for a screen-reader user to navigate between), and a second independent `isPatientsOpen` state and `clients.list` subscription mounted for no reason. The `program` sub-route is a third, different failure mode of the same root cause — see F-04.
- **Fix:** Delete `AuthenticatedShell`'s Sidebar/margin wrapper and have `page.tsx`/`notes/page.tsx` render their content directly — the layout already provides the shell. Effort: small (under an hour; verify against the dashboard route, which correctly uses `AuthenticatedShell` alone with no competing layout).
- **Fixed (2026-09-06):** `clients/[id]/page.tsx` and `clients/[id]/notes/page.tsx` no longer import or wrap in `AuthenticatedShell` — they render their content directly, relying on `clients/[id]/layout.tsx`'s Sidebar/TopBar as the single shell. `AuthenticatedShell` is now used only by the Dashboard route, which has no competing layout.

### F-04 · P2 Medium — UI consistency

**The care-plan ("Program Evia") page is a second, unrelated design system stacked under the shared shell.**
Location: `clients/[id]/program/page.tsx:132-187`

- **Evidence:** Every other screen uses literal Tailwind utility classes and hex colors (`bg-[#1A6B5A]`, `text-gray-500`) inside the shared `Sidebar`/`TopBar`/`AuthenticatedShell` chrome. The program page instead uses a design-token class system (`bg-surface`, `text-on-surface`, `font-display-title`), Material Symbols icons, and hand-rolls its *own* full header — including its own "Dashboard" breadcrumb link and its own notification/settings icon buttons — none of which are wired to anything (no `onClick`). Because this page is still a child of `clients/[id]/layout.tsx`, a therapist opening it sees the shared Sidebar + TopBar from the layout, immediately followed by this second, differently-styled header.
- **Impact:** The single moment where a therapist changes a client's clinical track is the point where the product visibly stops feeling like one product — two navigation bars, two type systems, two icon sets, on one screen.
- **Fix:** Rebuild the page's content inside the shared shell (drop the custom header entirely, matching the pattern already used by the detail and notes pages) and port its content onto the same literal-Tailwind system, or — if the design-token system is meant to be the future direction — migrate the other three screens to it instead. Either is fine; having both is not. Effort: medium.
- **Fixed (2026-09-06):** Rewrote `clients/[id]/program/page.tsx` to drop the custom header, notification/settings buttons, and design-token classes entirely, and rebuilt its content with the same literal-Tailwind cards/breadcrumb pattern used by the detail and notes pages. It now relies solely on `clients/[id]/layout.tsx`'s shared Sidebar/TopBar for navigation chrome.

### F-06 · P2 Medium — UX, destructive-adjacent action

**Care-plan changes commit immediately with no confirmation.**
Location: `clients/[id]/program/page.tsx:90-93,267-278`

- **Evidence:** `handleSave()` fires `setCarePlan.mutate(...)` directly from the Save button's `onClick`. The page's own copy, one line above the selector, reads "This will update their active clinical track" — the product itself flags this as consequential, but the interaction pattern is a single click with no intermediate confirmation.
- **Impact:** A misclick changes which care plan (anxiety, low mood, or stress/burnout) the AI companion follows for that client, with no undo and no history of the prior value once overwritten (§7).
- **Fix:** Add a confirm step before the mutation fires, at minimum when moving a client out of `confirmed` state. Effort: small.
- **Fixed (2026-09-06):** "Save care plan" now opens an inline confirmation ("Change this client's care plan to X? The AI companion will follow this track starting with their next session.") with explicit Confirm/Cancel actions before `setCarePlan` fires, for any change (not only moves out of `confirmed`).

**What works well.** The client detail page reads clearly top-to-bottom: overview, care plan with a plain-language explainer of what "provisional" vs "confirmed" means, a clearly-labeled "therapist only, never shown to the client" reasoning note, latest session summary, and a link out to notes. The notes page's privacy notice ("never read by the AI... this is a deliberate clinical boundary") is exactly the kind of specific, confident copy this kind of product needs at that exact point of use. Empty and loading states exist on every screen reviewed and are not an afterthought.

---

## 11. Accessibility

### F-10 · P3 Low — Accessibility

**Decorative-but-inert buttons and duplicate landmarks reduce trust in interactive affordances.**
Location: `clients/[id]/_components/top-bar.tsx:32-53` · `clients/[id]/program/page.tsx:171-182` · `clients/[id]/_components/sidebar.tsx:160-170`

- **Evidence:** TopBar's notification and settings buttons carry `aria-label="Notifications"`/`"Settings"` and `tabIndex={-1}` — labeled and visible, but neither keyboard-reachable nor wired to any action. The program page's copies of the same buttons have no `onClick` and no `tabIndex` override, so they *are* keyboard-reachable and announced as buttons that do nothing on activation. Sidebar's "Schedule / Safety Reviews / Reports" items (lines 23-53, rendered 160-170) are plain `<div>`s with `cursor-not-allowed` styling and no `aria-disabled` or explanatory text — a screen-reader user hears three inert list entries with no indication they're placeholders for unbuilt features.
- **Impact:** Low severity individually; cumulatively they teach a screen-reader or keyboard user that this app's controls are unreliable.
- **Fix:** Either wire the icon buttons up or remove them until they do something; add `aria-disabled="true"` plus a short label ("Coming soon") to the placeholder nav items. Fixing F-02 removes the duplicate-landmark half of this automatically. Effort: small.
- **Fixed (2026-09-06):** Removed the non-functional notification/settings buttons from `TopBar` entirely (replaced with a working mobile sign-out control, see F-03) and from the rebuilt program page (F-04). Sidebar's placeholder nav items now carry `role="link"`, `aria-disabled="true"`, a `title="Coming soon"`, and a visible "Soon" badge.

**What works well.** The notes form uses `role="alert"`/`aria-live="assertive"` for validation and save errors and `role="status"`/`aria-live="polite"` for the save-success message (`notes/page.tsx:196-222`) — genuinely correct usage, not just present for the sake of it. Form labels use `sr-only` correctly where the visual design omits a visible label (notes textarea, care-plan select).

---

## 12. Responsive Design

### F-03 · P2 Medium — Responsive, functional gap

**No way to sign out on any viewport under 768px.**
Location: `clients/[id]/_components/sidebar.tsx:68,184-195` · `components/SignOutButton.tsx` (unused)

- **Evidence:** The Sidebar's root element is `hidden md:flex` — entirely absent below the `md` breakpoint. Its sign-out button (lines 184-195) is the **only** sign-out control anywhere in the app; a repo-wide search confirms `components/SignOutButton.tsx`, which would otherwise serve this exact purpose, is never imported.
- **Impact:** A therapist on a phone or narrow tablet who signs in has no visible way to sign out again short of manually clearing site data — a real concern on a shared or borrowed device for an app handling clinical data.
- **Fix:** Render the existing (currently orphaned) `SignOutButton` in `TopBar` below the `md` breakpoint, or add a minimal mobile menu. Effort: small.
- **Fixed (2026-09-06):** Added a mobile-only (`md:hidden`) sign-out control to `TopBar` (covers `/clients/[id]` and its sub-routes) and to `AuthenticatedShell` (covers the Dashboard, which had no TopBar at all). Both match the icon+label style already used by Sidebar's sign-out button rather than reusing the old `SignOutButton` component, which was deleted as part of F-09 since its plain-bordered style didn't fit; the underlying `signOut({ callbackUrl: '/auth' })` call is identical.

Elsewhere, responsive handling is genuinely considered rather than an afterthought: the dashboard's caseload table wraps in `overflow-x-auto` rather than clipping or breaking layout on narrow screens, and card-based detail/notes pages reflow to a single column cleanly at mobile widths. The breakpoint choice itself (`md`, 768px) is applied consistently across Sidebar and TopBar. The gap above is the one place that consideration didn't carry all the way through.

---

## 13. Performance

Not a concern yet at pilot scale; one pattern won't scale past it.

- **Unbounded, unpaginated caseload query.** `clients.list` (`clients.ts:79-114`) fetches every `TherapistClient` row for the therapist with a nested `include` of `clinical_config`, `safety_state`, and the latest `session_logs` for each — a wide multi-join with no `take`/`skip`. This same query runs from both the Dashboard and the Sidebar's client sub-list whenever a client page is open. Fine for the caseload sizes a single therapist realistically carries today; will need pagination or a narrower `select` well before a roster grows into the hundreds.
- **F-02's duplicate mount** doubles the number of live component instances (and their independent open/closed nav state) on the two affected screens, though React Query's request deduplication means this is a DOM/state cost more than a network one.
- No code-splitting concerns worth flagging — the app is small enough that Next's default route-based splitting is sufficient.

---

## 14. Error & State Handling

Every screen reviewed (dashboard, client detail, notes, care plan) implements all four states deliberately: a skeleton for loading, a labeled empty state with guidance ("No clients assigned yet... Clients assigned to you will appear here"), a red error card with a working retry button wired to `query.refetch()`, and a visible success acknowledgment (the notes page's "Note saved." toast, the care-plan page's "✓ Care plan saved" toast). This is one of the app's most consistently well-executed dimensions and should be the template for any new screen.

The gap is not in what the user sees, but in what happens after: none of these error paths write anywhere durable (§16, Observability) — a `FORBIDDEN` or `INTERNAL_SERVER_ERROR` shown to a therapist leaves no server-side trace to investigate later.

---

## 15. Testing

### F-12 · P3 Low — Testing

**Zero automated tests for the app that decides who can see clinical data.**
Location: `apps/therapist-portal` (no `*.test.*`/`*.spec.*` files anywhere in the tree) · `.github/workflows/ci.yml:50-51`

- **Evidence:** A repo-wide search for test files under `apps/therapist-portal` returns nothing. CI's only step for this app is `tsc --noEmit` — no lint, no build, no test execution. This contrasts sharply with `apps/api`, which has ~25 test files covering auth, sessions, and rate limiting.
- **Impact:** The authorization logic in §8 — the part of this app doing the actual clinical-data gatekeeping — has no regression protection. A future refactor of `assertClientAssigned()` or the bypass-flag branches could silently reopen access and nothing in CI would catch it.
- **Fix:** Prioritize, in order: (1) an integration test asserting an unassigned therapist gets `FORBIDDEN` from `clients.detail`/`getCarePlan`/`notes.listNotes` for a client they don't own; (2) a test that `signIn` rejects an email with no `Therapist` row; (3) a build-time test/assertion that the bypass flag cannot be true when `NODE_ENV=production` (this doubles as verification for F-01). Effort: medium — `apps/api`'s existing test setup patterns are a reasonable template.
- **Fixed (2026-09-06):** Added Vitest to `apps/therapist-portal` (previously absent) with 14 tests across three files, covering all three priorities above: `src/server/__tests__/authorization.test.ts` (an unassigned therapist gets `FORBIDDEN` from every client/notes procedure; an unknown session email gets `UNAUTHORIZED`; an assigned therapist succeeds and triggers a `ClinicalAccessLog` write), `src/__tests__/auth.test.ts` (the `signIn` allowlist), and `src/__tests__/production-bypass.test.ts` (the new F-01 boot guard). Wired into CI (`.github/workflows/ci.yml`) alongside the existing typecheck step.

---

## 16. Code Quality & Observability

### F-08 · P3 Low — Maintainability, duplication

**Therapist-resolution + assignment-check logic is copy-pasted three times.**
Location: `server/routers/clients.ts:22-76` · `server/routers/notes.ts:14-42,66-93`
Fix: one `therapistProcedure` tRPC middleware resolving `ctx.therapistId` once, reused by every procedure that currently repeats this block. Effort: small.

**Fixed (2026-09-06):** Added `therapistProcedure` (and `therapistMutation`, which layers the F-11 rate limit on top) to `server/trpc.ts`, resolving `ctx.db`/`ctx.therapistId`/`ctx.therapistEmail` once. `clients.ts` and `notes.ts` now build on it instead of each re-implementing the lookup; `assertClientAssigned()` and `logClinicalAccess()` also moved to `trpc.ts` as the single shared implementation.

### F-09 · P3 Low — Maintainability, dead code

**Orphaned components and a scaffold router still ship in production.**
Location: `app/components/ClientList.tsx`, `ClientRow.tsx`, `SignOutButton.tsx` · `server/routers/example.ts` (mounted in `_app.ts:8`)

- **Impact:** `example.ts` mounts a public, unauthenticated `echo` procedure and a `getMe` that returns internal session shape — negligible risk on its own, but unnecessary shipped surface, and easy to mistake for something intentionally in use.
- **Fix:** Delete the three orphaned components (or wire `SignOutButton` in per F-03) and remove `exampleRouter` from `_app.ts`. Effort: trivial.
- **Fixed (2026-09-06):** Deleted `ClientList.tsx`, `ClientRow.tsx`, `SignOutButton.tsx` (F-03 hand-rolled a differently-styled sign-out control instead of reusing it — see that finding's note), and `server/routers/example.ts`; removed `exampleRouter` from `_app.ts`.

**Observability.** No error-tracking integration, structured logger, or request-ID propagation exists anywhere in `apps/therapist-portal` (confirmed by search for Sentry/Datadog/Winston/Pino/OpenTelemetry — none present). The only diagnostic output is a handful of `console.log`/`console.error`/`console.warn` calls inside `lib/auth.ts`'s sign-in callback. On Vercel these land in platform logs with no structure and no alerting — a production incident (e.g. the DB being unreachable, surfaced today only as a generic "Database not configured" `TRPCError`) would currently be discovered by a therapist reporting it, not by monitoring.

---

## 17. Therapist Workflow Analysis

The one real end-to-end journey this product supports today: sign in, find a client, review their standing, read/add a note, adjust their care plan.

1. **Sign in** — One click ("Continue with Google"), one clear rejection message if the account isn't registered. *Clean.*
2. **Dashboard → find a client** — A single sortable-looking (not actually sortable/filterable) table: masked phone number, care plan badge, status, last session, a safety indicator that visually escalates for S3/S4. No search or filter — fine for a small caseload, will need one as rosters grow. *Clear at current scale.*
3. **Open a client** — One click from the table. *Layout bug (F-02)* — content lands ~240px further right than the dashboard, with a duplicated sidebar underneath.
4. **Review standing** — Safety state, care plan with a plain-language state explainer, a clearly-scoped "therapist only" reasoning note, and the latest AI-session summary in one scroll. *Good information architecture.*
5. **Read / add a note** — One click to the notes page, a privacy notice that correctly sets expectations, a form that protects an in-progress draft against reload. *Same layout bug as above.*
6. **Adjust care plan** — One dropdown, one Save. *No confirmation (F-06)* before a change that redirects the AI companion's clinical track, on a page that *looks like a different product (F-04)*.

**Net read:** five short steps, no dead ends, no data loss risk in the happy path. The friction is concentrated entirely in the last two steps of the journey — exactly the steps where a mistake has the most clinical consequence.

---

## 18. Finding Register

| ID | Sev | Category | Location | Finding | Effort |
|---|---|---|---|---|---|
| F-01 | P0 | Security | `proxy.ts`, `trpc.ts`, `clients.ts` | Bypass flag disables auth portal-wide, no prod boot guard | S |
| F-02 | P1 | UI arch. | `clients/[id]/layout.tsx`, `AuthenticatedShell.tsx` | Duplicate Sidebar/shell, content offset ~240px extra | S |
| F-03 | P2 | Responsive | `_components/sidebar.tsx` | No sign-out control below 768px | S |
| F-04 | P2 | UI consistency | `clients/[id]/program/page.tsx` | Care-plan page is a second design system + header | M |
| F-05 | P2 | Privacy | `schema.prisma` | No audit trail of therapist access to clinical data | M |
| F-06 | P2 | UX | `program/page.tsx:90-93` | Care-plan change commits with no confirmation | S |
| F-07 | P2 | Product/Ops | `scripts/seed-*.ts` | No in-product therapist onboarding / assignment flow | L |
| F-08 | P3 | Maintainability | `clients.ts`, `notes.ts` | Auth-resolution logic duplicated 3× | S |
| F-09 | P3 | Dead code | `components/ClientList.tsx`, `example.ts` | Orphaned components + scaffold router still shipped | XS |
| F-10 | P3 | Accessibility | `top-bar.tsx`, `program/page.tsx`, `sidebar.tsx` | Inert icon buttons, unlabeled disabled nav items | S |
| F-11 | P3 | Security | `server/trpc.ts` | No rate limiting on any procedure | M |
| F-12 | P3 | Testing | `apps/therapist-portal` | Zero automated tests; CI runs typecheck only | M |
| F-13 | P3 | Auth hardening | `lib/auth.ts:18-19` | No session idle-timeout tuned for clinical data (default 30-day JWT) | XS |

---

## 19. Risk Matrix

| Priority | Issue | Impact | Likelihood | Effort | Area |
|---|---|---|---|---|---|
| P0 | F-01 Bypass-flag blast radius | Total clinical-data exposure | Low, but catastrophic | S | Security |
| P1 | F-02 Duplicate shell / layout offset | Visible on 2 of 4 core screens | Certain (100%) | S | Frontend |
| P2 | F-05 No PHI access log | Blocks incident forensics | Certain gap today | M | Privacy |
| P2 | F-03 No mobile sign-out | Session persists on shared device | Medium (mobile use) | S | Responsive |
| P2 | F-07 No admin onboarding flow | Blocks scaling the roster | Certain at scale | L | Product/Ops |
| P2 | F-04 Care-plan page inconsistency | Trust/perceived quality | Certain (100%) | M | UI/UX |
| P2 | F-06 No confirm on care-plan change | Misclick changes clinical track | Low–Medium | S | UX |
| P3 | F-12 No tests on authz logic | Silent regression risk | Grows over time | M | Testing |
| P3 | F-11 No rate limiting | Abuse of a compromised session | Low | M | Security |
| P3 | F-08/09 Duplication & dead code | Slower, riskier future changes | Certain | S | Maintainability |

**Must fix before scaling past a small supervised pilot:** F-01, F-05, F-12. Everything else can ship as tracked backlog.

---

## 20. Quick Wins

- **Fix F-02** — delete `AuthenticatedShell`'s Sidebar/margin wrapper, let the route layout own the shell. One file, immediate visible fix on two screens. **Fixed (2026-09-06).**
- **Fix F-03** — render the already-written (just unused) `SignOutButton` in `TopBar` for mobile widths. **Fixed (2026-09-06)** — with a hand-rolled control matching Sidebar's style rather than `SignOutButton`, which was deleted (F-09).
- **Fix F-09** — delete three dead files and one router import; zero behavior change, smaller surface to reason about. **Fixed (2026-09-06).**
- **Fix F-13** — set an explicit, shorter `session.maxAge` in `authConfig` (one line in `auth.ts`). **Fixed (2026-09-06):** set to 12 hours.
- **Fix F-01's static half** — add the boot-guard check; even a same-day fix meaningfully changes the risk profile of every future deploy. **Fixed (2026-09-06)** — plus the runtime half (removing the `next.config.ts` client-bundle leak).
- Remove the stale phone-number comment on `notes.listNotes` (`notes.ts:61`) before it misleads a future change. **Fixed (2026-09-06)** as part of the F-08 rewrite of `notes.ts`.

---

## 21. Recommended Roadmap

**Phase 0 — Critical blockers**
- F-01 — production boot guard for the bypass flag
- F-12 (partial) — authorization regression tests, at minimum the unassigned-therapist case

**Phase 1 — Stabilization**
- F-02 — shell duplication fix
- F-03 — mobile sign-out
- F-05 — clinical-access log table
- F-06 — confirm before care-plan commit

**Phase 2 — UX / UI**
- F-04 — unify the care-plan page onto the shared shell and design language
- F-10 — resolve or remove inert icon buttons and unlabeled placeholder nav
- Add search/filter to the caseload table ahead of roster growth

**Phase 3 — Architecture**
- F-08 — shared `therapistProcedure` middleware
- F-09 — remove dead components and the scaffold router
- F-07 — first-party therapist onboarding / assignment flow

**Phase 4 — Optimization**
- Paginate/narrow `clients.list` ahead of roster growth
- F-11 — rate limiting on mutations
- Wire an error tracker and structured logging (Observability, §16)
- Broaden test coverage beyond the authorization core

---

## 22. Final Assessment

**Is the portal production-ready?** Conditionally — for a small, supervised pilot with a roster an engineering team can watch by hand. Not for unsupervised general release.

**What blocks production at scale?** F-01 (the bypass flag's blast radius and missing boot guard) and F-05 (no record of who accessed a client's clinical data) are the two gaps that matter most for a healthcare-adjacent product handling real patients — one is a defense-in-depth hole, the other is a forensics hole. F-12's absence of tests is what lets either regress unnoticed.

**What can safely ship as-is?** The core data model and its resource-level authorization checks (§8) are sound and don't need to be re-architected. The workflow itself (§17) has no dead ends and no silent data loss.

**What should be fixed immediately?** F-01 (hours of work, closes the single largest exposure) and F-02 (a one-file fix that's visibly broken on two of four screens today).

**What can wait?** F-04's design unification, F-07's admin tooling, and F-11's rate limiting are all real but bounded by the portal's current small, allowlisted user base — track them, don't block on them.

**What should be watched after launch?** Caseload sizes per therapist (performance, §13), any future addition to the tRPC router tree (should use the shared middleware from F-08, not repeat the pattern it replaces), and — until F-05 lands — an operational commitment to review database access logs manually if a data-handling concern is ever raised.
