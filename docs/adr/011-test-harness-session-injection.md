# ADR-011: Test Harness Session State Injection

**Status:** Accepted
**Date:** 2026-08-19
**Driver:** TH-S01 — Test Harness Implementation Plan §12 Open Question 2

---

## Context

The Test Harness needs to run agents against controlled, reproducible session states. The production pipeline reads session state from Prisma (`SessionLog`, `Turn`, `SafetyState`, `GovernanceLog`) and caches some context in Redis (`retrieved-context-cache`, `tool-result-store`). For deterministic testing, the harness must:

1. Create synthetic users and sessions without affecting real user data.
2. Inject specific safety states, governance states, and router decisions.
3. Reset state between sampling runs (N=200 samples must be independent).
4. Avoid requiring Redis for sandbox/staging test environments.

Options considered:

1. **Redis namespace** — prefix all test keys with `test-harness:` and isolate via namespace.
2. **In-memory context bundle + synthetic Prisma users** — create `test-user-*` rows in Prisma, build context in memory.
3. **Dedicated test database** — separate Neon branch for test harness data.

## Decision

Use in-memory context bundle + synthetic Prisma users with `firebase_uid` prefix `test-user-*`, mirroring the `load-test-vu-` bypass pattern already established in `apps/api/src/lib/session-handler.ts`.

Concretely:
- Synthetic users have `firebase_uid` starting with `test-user-` (e.g. `test-user-sampling-001`).
- The session handler's existing `uid.startsWith('load-test-vu-')` bypass is extended to also bypass rate limits for `test-user-*`.
- Mock session context is built in-memory (`mockSessionContext` in TH-S09) and passed to agents via `testHooks` (ADR-010).
- No Redis dependency — sandbox/staging environments run without Redis for test harness operations.

## Alternatives Considered

### Redis namespace
- Would require Redis to be running in sandbox/staging — adds infrastructure dependency.
- State reset between samples requires `KEYS test-harness:*` + `DEL` — slow and racy under concurrent loads.
- Redis state is not visible in Prisma queries, making audit trails incomplete.
- Reject: adds complexity without solving the determinism problem (Redis caches can still drift).

### Dedicated test database
- Provides complete isolation at the database level.
- Requires a separate Neon branch, Prisma client, and connection string — significant operational overhead for MVP.
- The staging DB already has no production data (per plan §1); isolation via `test-user-*` prefix is sufficient.
- Reject for MVP; revisit with TH-S31 if beta environment isolation requires it.

## Consequences

**Positive:**
- Zero infrastructure changes — uses existing Prisma models and the established `load-test-vu-` bypass pattern.
- `mockSessionContext` is pure and deterministic — no external dependencies.
- Test data is visible in Prisma for debugging and audit.
- Reuses the proven session-handler bypass logic.

**Negative:**
- Synthetic users share the same Prisma tables as real users — mitigated by the `test-user-*` prefix convention and the harness's restricted auth (TH-S04).
- In-memory context means test state is lost on server restart — acceptable for sandbox/staging; `TestRun` rows persist results.

**Risks:**
- A future developer might accidentally query `test-user-*` rows in production queries — mitigated by adding a `WHERE firebase_uid NOT LIKE 'test-user-%'` guard in any production-facing dashboard queries.
