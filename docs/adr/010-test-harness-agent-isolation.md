# ADR-010: Test Harness Agent Isolation Seam

**Status:** Accepted
**Date:** 2026-08-19
**Driver:** TH-S01 — Test Harness Implementation Plan §12 Open Question 1

---

## Context

The Test Harness needs to invoke individual agents (A1, A2, A8, A9-pre, A9-post) in isolation for deterministic testing, fault injection, and sampling. The agents are tightly coupled inside `apps/api/src/pipeline/orchestrator.ts` — `processTurn` runs the full pipeline (A1 → A9-pre → A8 → A2 → A9-post) in sequence, with no seam to call a single agent or inject canned state.

Options considered:

1. **Separate test orchestrator** — duplicate `processTurn` logic in a test-specific file.
2. **Direct agent imports** — import agent functions directly from `apps/api/src/agents/` into the harness.
3. **Optional `testHooks` parameter on `processTurn`** — extend the existing function with an opt-in `opts` parameter.

## Decision

Add an optional `testHooks` parameter to `processTurn` in `apps/api/src/pipeline/orchestrator.ts`:

```typescript
processTurn(uid, sessionId, message, perceivedIntensity?, opts?: {
  testMode?: {
    injectA1?: SafetyState;
    injectA9?: GovernanceState;
    injectRouter?: RouterDecision;
    injectRetrievedContext?: string;
    signalOverride?: { boundary: string; payload: PipelineSignal };
    captureSignalBus?: boolean;
    faults?: Array<{ boundary: string; faultType: 'timeout' | '5xx' | 'malformed_json' | 'signal_drop' }>;
    useCanned?: boolean;
  }
})
```

When `opts` is undefined, `processTurn` behaves byte-for-byte identically to today. All existing tests pass untouched. When `opts.testMode` is provided, the function branches at each agent boundary to either skip execution and inject the canned value, override signals, record the signal bus, or inject faults.

No separate `testOrchestrator` — one code path, one set of tests.

## Alternatives Considered

### Separate test orchestrator (`testOrchestrator.ts`)
- Duplicates the orchestration logic, creating a maintenance burden when the real pipeline changes.
- Reject: divergence risk is high with a 32-story implementation plan touching the same files.

### Direct agent imports into the harness
- Works for A1, A2, A8, A9-pre, A9-post (they live in `apps/api/src/agents/`).
- Breaks for A13/A15 (they live in `apps/worker/` and require HTTP calls).
- Pulls `@google-cloud/aiplatform` and Fastify-adjacent libs into the Next.js bundle.
- Acceptable as a fallback if the `testHooks` approach causes build issues — documented in TH-S09 AI Coding Notes.

## Consequences

**Positive:**
- Single code path means the harness tests the real production code, not a fork.
- No regression risk when `processTurn` evolves — both prod and test paths share the same logic.
- `captureSignalBus` and `signalOverride` are naturally composable on the existing `Promise.allSettled` flow.
- Existing tests are unaffected — the `opts` parameter defaults to `undefined`.

**Negative:**
- `orchestrator.ts` becomes slightly more complex (conditional branches per agent boundary).
- Risk of test-only code paths becoming stale if the real pipeline changes — mitigated by requiring the existing test suite to pass with `opts` undefined.

**Risks:**
- Build breakage if direct agent imports pull incompatible dependencies into Next.js — mitigated by TH-S09's fallback to HTTP calls.
