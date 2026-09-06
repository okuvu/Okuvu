# Test Harness UI — Implementation Plan

**For:** Evia Engineering Team
**Scope:** Web-based test environment for SME access per OKUVU Test Environment Specification
**Date:** 2026-08-16

---

## Executive Summary

Build a **Next.js web application** (following the Therapist Portal architecture) that provides a web-based UI for the three testing altitudes (Sandbox/Staging/Beta). The UI will be hosted separately for SME access and will follow the existing Therapist Portal design system for consistency.

---

## 1. Architecture & Tech Stack

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Framework** | Next.js 15 (App Router) | Same as therapist-portal; reuse tRPC, auth, design tokens |
| **Auth** | NextAuth + Google OAuth (therapist accounts) | Consistent with portal; restrict to PI/raters |
| **API Layer** | tRPC (in-process via shared packages) | Type-safe, reuses existing routers; no Fastify proxy needed |
| **State Management** | TanStack Query + React Context | Already in portal dependencies |
| **Styling** | Tailwind CSS v4 + Design Tokens | Matches portal design system exactly |
| **Deployment** | Firebase Hosting (separate project: `evia-test-harness`) | Isolated from prod; easy SSL/custom domain |
| **Database** | Same Neon branch (staging) | Read-only access for traces/results; write for corpus/runs |

**New App Location:** `apps/test-harness/`

---

## 2. Environment Topology (Per Spec §1)

| Environment | Purpose | Models | Data | Access |
|-------------|---------|--------|------|--------|
| **Sandbox** | Unit tests (Altitude 1) | Pinned, mocked | Synthetic only | Engineers + PI |
| **Staging** | Integration + System (Altitudes 2-3) | Prod-parity, mocked externals | Synthetic + paraphrased | PI + Raters |
| **Supervised Beta** | Live sampling (post-staging) | Real prod models | Real users (S3/S4 captured) | PI + Ethics committee |

**Implementation:** Single Next.js app with **environment selector** in header. Each environment connects to its own API endpoint (configurable via env vars).

---

## 3. Core Screens (MVP Build List)

Following the Therapist Portal pattern (T-00 through T-07), the test harness needs:

| Screen | Spec Reference | Purpose |
|--------|----------------|---------|
| **TH-00** | Auth | Secure login (Google OAuth, restricted emails) |
| **TH-01** | Dashboard | Environment status, recent runs, gate summaries |
| **TH-02** | Model Config Registry | Pin model versions, temperature, safety settings, prompt hashes |
| **TH-03** | Single Agent Invocation | Call A1/A2/A8/A9/A10A/A13/A15 in isolation with mocked inputs; **auto-activates upstream dependencies with inline explanation** |
| **TH-04** | Determinism Harness | N-run + restart testing for A8/A9-pre; state-space enumeration |
| **TH-05** | Stochastic Sampling Runner | N≥200 runs with Wilson CI, cost estimator, budget cap |
| **TH-06** | Fault Injection Console | Force timeouts/errors at model-call & signal boundaries |
| **TH-07** | Pipeline Runner | Full A1→A9→A8→A2→A13→A15 with signal override & capture; **visual pipeline with dependency-aware agent toggles** |
| **TH-08** | Conversation Driver | Scripted persona multi-turn with per-turn trace export |
| **TH-09** | Blinded Review Tool | Rater interface with κ support, randomised presentation |
| **TH-10** | Trace & Results Viewer | Frozen-triple metadata, per-turn observability, diffable runs |
| **TH-11** | Corpus Manager | Versioned test cases (safety, fidelity, adversarial, personas) |
| **TH-12** | CI Regression Status | Gate status, HALT failures, release block indicator |

---

## 3.5 Agent Pipeline Dependency Graph & Auto-Activation Rules

### Pipeline Order (from orchestrator.ts)
```
A1 (Safety) → A9-pre (Governance) → A8 (Router) → A2 (Therapy) → A9-post (Review) → A13 (Summary) → A15 (Memory)
```

### Hard Dependencies (cannot run without upstream)

| Agent | Requires | Reason |
|-------|----------|--------|
| **A9-pre** | A1 | Needs `safetyState` for governance decision |
| **A8** | A1 + A9-pre | Routes based on `safety_state` + `governance_state` |
| **A2** | A1 + A9-pre + A8 | Needs safety, governance, router decision (mode), retrieved context |
| **A9-post** | A2 | Reviews A2's output |
| **A13** | A2 | Summarizes session |
| **A15** | A2 + A13 | Memory extraction from conversation |

### Auto-Activation Behavior

**When user toggles an agent ON:**
1. System computes transitive closure of all upstream dependencies
2. All required agents auto-enable
3. **Inline toast/banner appears:** *"Activated A1, A9-pre, A8 — A2 requires safety classification, governance check, and routing decision"*
4. User can see which agents are "manually selected" vs "auto-activated for dependency"

**When user toggles an agent OFF:**
1. System checks if any *other active agent* depends on it
2. If yes → **block with explanation:** *"Cannot disable A1 — A2 and A8 require safety classification"*
3. If no → disable normally

### Visual Indicators in UI

| State | Visual |
|-------|--------|
| Manual toggle ON | Solid teal toggle, label "Selected" |
| Auto-activated | Teal toggle with link icon, label "Auto (required by A2)" |
| Blocked (cannot disable) | Disabled toggle with lock icon, tooltip explains why |
| Downstream inactive | Grayed out, shows "Enable A1 first" on hover |

### Mock Injection for Skipped Agents (Optional Advanced)

If user *only* wants to test A2 with specific inputs:
- Allow "Mock Mode" where user provides: `safetyState`, `governanceState`, `routerDecision`, `retrievedContext`
- This bypasses A1/A9/A8 execution but still runs A2
- Clearly labeled: **"Running in Mock Mode — upstream agents bypassed"**

---

## 4. Backend Integration (tRPC Routers to Add)

Extend `apps/therapist-portal/src/server/routers/` with new routers in `apps/test-harness/src/server/routers/`:

| Router | Procedures | Notes |
|--------|------------|-------|
| `testConfig` | `pinModelVersion`, `getPromptRegistry`, `setTemperature`, `getFrozenTripleMetadata` | Wraps existing vertex-ai config + adds versioning |
| `singleAgent` | `invokeAgent`, `mockSessionContext`, `getAgentSchema` | Reuses orchestrator's agent imports directly |
| `determinism` | `runNtimes`, `runAcrossRestarts`, `enumerateA8StateSpace` | New logic; uses existing agents |
| `stochastic` | `runSampling`, `computeWilsonCI`, `estimateCost`, `checkBudget` | New; integrates with Vertex AI pricing |
| `faultInjection` | `injectModelFailure`, `injectSignalFailure`, `verifyFailSafe` | Hooks into llm-provider & orchestrator |
| `pipeline` | `runFullPipeline`, `overrideSignal`, `captureSignalBus`, `validateSilencePath` | Extends orchestrator with test hooks |
| `conversation` | `runPersonaScript`, `getPerTurnTrace`, `exportTrace` | Multi-turn driver using session handler |
| `review` | `getBlindedItems`, `submitRating`, `computeKappa`, `unblindResults` | Blinding + IRR |
| `corpus` | `listCases`, `createCase`, `versionCase`, `exportPairedComparison` | Git-style versioning |
| `results` | `archiveRun`, `getRun`, `compareRuns`, `getAuditArtifact` | Append-only immutable store |
| `ci` | `getGateStatus`, `triggerRegression`, `getHaltFailures` | Reads from CI system (GitHub Actions) |

**Key Integration Points:**
- Import agents directly from `apps/api/src/agents/` (same process via tRPC)
- Use existing `vertex-ai.ts` with `USE_CANNED_LLM_RESPONSE` for sandbox
- Add test hooks to `orchestrator.ts` (signal override, fault injection) behind feature flags

---

## 5. Design System Implementation

**Reuse Therapist Portal Tokens Exactly:**
- Colors: `color.portal.bg`, `color.portal.surface`, `color.brand.primary`, badge colors
- Typography: Manrope + IBM Plex Mono
- Spacing: 8pt grid, `radius.sm=4px`, `radius.md=8px`
- Components: `ClinicalNoticePanel` (left-border), `BadgeChip`, `DashboardRow`, `PreviewModal`

**Test Harness Specific Additions:**
- **Environment Selector** — Top-right dropdown (Sandbox/Staging/Beta) with color coding
- **Run Status Badges** — Green (PASS), Red (HALT), Amber (WARNING), Blue (RUNNING)
- **Trace Viewer** — Monospace (Plex Mono) for signal payloads, collapsible JSON
- **Cost Estimator Card** — Shows estimated ₹ cost before N-run execution

---

## 6. Data Models (Extend shared-types)

Add to `packages/shared-types/index.ts`:

```typescript
// Test Harness Types
export type TestEnvironment = 'sandbox' | 'staging' | 'beta';

export interface FrozenTripleMetadata {
  modelVersion: string;
  promptHash: string;
  temperature: number;
  safetySettings: string;
  suiteVersion: string;
  inputId: string;
  timestamp: string;
  rawOutput: string;
}

export interface TestRun {
  id: string;
  environment: TestEnvironment;
  altitude: 1 | 2 | 3;
  agent?: 'A1' | 'A2' | 'A8' | 'A9-pre' | 'A9-post' | 'A10A' | 'A13' | 'A15';
  status: 'running' | 'pass' | 'halt' | 'warning' | 'error';
  frozenTriple: FrozenTripleMetadata;
  results: TestResult[];
  createdAt: string;
  completedAt?: string;
  activatedAgents: string[];           // All agents that ran (manual + auto)
  manuallySelectedAgents: string[];    // Only what user explicitly toggled
  dependencyGraph: AgentDependency[];  // For trace reproducibility
}

export interface AgentDependency {
  agent: string;
  requiredBy: string[];
  autoActivated: boolean;
  mockMode?: boolean;
}

export interface BlindedReviewItem {
  id: string;
  runId: string;
  output: string;
  rubricScores: Record<string, number>;
  raterId?: string;
  unblinded?: boolean;
}

export interface CorpusCase {
  id: string;
  type: 'safety' | 'fidelity' | 'adversarial' | 'persona';
  version: number;
  input: string;
  expectedOutput?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Create `apps/test-harness/` with Next.js + tRPC + Tailwind setup
- [ ] Configure Firebase Auth (restricted email domain)
- [ ] Set up tRPC client/server with shared-types
- [ ] Implement `TH-00` (Auth) + `TH-01` (Dashboard skeleton)
- [ ] Add environment selector + config switching
- [ ] Deploy to Firebase Hosting (test-harness.evia.ai)

### Phase 2: Core Harness (Week 3-4)
- [ ] `TH-02` Model Config Registry (prompt versioning, hashing, pinning)
- [ ] `TH-03` Single Agent Invocation (all 8 agents, mock context)
- [ ] Add test hooks to `orchestrator.ts` (signal override, fault injection)
- [ ] `TH-06` Fault Injection Console (model-call + signal boundaries)
- [ ] Unit tests for new tRPC procedures

### Phase 3: Determinism & Sampling (Week 5-6)
- [ ] `TH-04` Determinism Harness (N-run, restart, A8 state-space 15 cells)
- [ ] `TH-05` Stochastic Sampling (N≥200, Wilson CI, cost estimator, budget cap)
- [ ] Integrate with Vertex AI pricing API for cost estimates
- [ ] Add canned response mode for free sandbox runs

### Phase 4: Pipeline & Conversations (Week 7-8)
- [ ] `TH-07` Pipeline Runner (full pipeline, signal bus capture, silence validation)
- [ ] **Dependency-aware agent toggles** with auto-activation + inline explanation toasts
- [ ] **Visual pipeline diagram** showing data flow between agents (green=running, blue=completed, gray=skipped)
- [ ] **Per-agent expandable trace panel** showing input → output → latency → signals
- [ ] **Mock mode toggle** for testing downstream agents with injected upstream outputs
- [ ] `TH-08` Conversation Driver (persona scripts, per-turn trace export)
- [ ] SRS modal reuse from mobile design for session close simulation

### Phase 5: Review & Storage (Week 9-10)
- [ ] `TH-09` Blinded Review Tool (κ support, randomised presentation)
- [ ] `TH-10` Trace & Results Viewer (frozen-triple, diffable runs)
- [ ] `TH-11` Corpus Manager (versioned, diffable, paired-comparison export)
- [ ] `TH-12` CI Regression Status (GitHub Actions integration)

### Phase 6: Polish & Handoff (Week 11-12)
- [ ] Accessibility audit (WCAG AA, colorblind labels on panels)
- [ ] Performance optimization (lazy load traces, virtualized lists)
- [ ] Documentation: user guide for PI, rater guide, engineer runbook
- [ ] Staging deployment + PI walkthrough
- [ ] Beta environment config + ethics committee review prep

---

## 8. Key Technical Decisions Needed

| Decision | Options | Recommendation |
|----------|---------|----------------|
| **Agent isolation** | Direct import vs separate process | Direct import via tRPC (same process, faster, uses existing mocks) |
| **Session state injection** | Redis snapshot vs DB snapshot | Prisma transaction + in-memory context bundle (simpler, matches orchestrator) |
| **Prompt registry storage** | Git repo vs DB | DB (Prisma) with git-style versioning; export to Git for audit |
| **Blinding implementation** | Server-side strip vs client-side | Server-side: tRPC `review.getBlindedItems` returns stripped metadata |
| **Cost estimation** | Static prices vs Vertex AI API | Static fallback + Vertex AI Pricing API when available |
| **CI integration** | GitHub Actions API vs webhook | GitHub Actions API (read workflow runs, gate status) |

---

## 9. Security & Compliance

- **Auth:** Restrict to `@evia.ai` + PI-approved emails only
- **Data:** 
  - Sandbox/Staging: Synthetic only (enforced by corpus manager)
  - Beta: S3/S4 isolation via separate DB schema + RLS policies
  - DPDP: Consent capture UI in corpus manager for beta data
- **Audit:** All runs immutable; PI can sign off gates via `TH-01` dashboard
- **Secrets:** Vertex AI keys via Secret Manager (not env); `LOCAL_DEV_BYPASS_AUTH=false`

---

## 10. Estimated Effort

| Component | Estimate |
|-----------|----------|
| Foundation (setup, auth, dashboard) | 2 weeks |
| Core harness (config, single-agent, fault) | 2 weeks |
| Determinism & sampling | 2 weeks |
| Pipeline & conversations | 2 weeks |
| Review & storage | 2 weeks |
| Polish, docs, handoff | 2 weeks |
| **Total** | **~12 weeks (1 engineer)** |

**Parallelizable:** Phase 2-3 can overlap; Phase 4-5 can overlap.

---

## 11. Acceptance Criteria (Per Spec §5)

| Deliverable | Verification |
|-------------|--------------|
| Three isolated environments | Deploy sandbox/staging/beta; verify no cross-traffic |
| Model-config pinning + prompt registry | UI shows version/hash; run records capture all 7 metadata fields |
| Single-agent invocation | Each agent callable with mocked session context |
| Determinism harness | A8 15-cell enumeration passes; restart test passes |
| Stochastic N-sampling | N=200 completes <30min; Wilson CI lower bound gating works |
| Fault injection | All 3 fail-safe assertions verifiable in UI |
| Pipeline harness | Signal override + silence path validation demonstrated |
| Conversation driver | Per-turn trace export matches clinician review format |
| Blinded review | κ ≥ 0.8 achievable; metadata stripped in API response |
| Versioned corpus + results store | Git-style diff works; paired-comparison export for McNemar |
| Observability | Per-turn trace reconstructable from stored data |
| CI regression job | GitHub Action blocks on HALT; triggers on prompt/config change |
| Beta data pipeline | S3/S4 100% capture; consent/retention/access documented |

---

## 12. Open Questions for Team

| # | Question | Resolved | ADR |
|---|---|---|---|
| 1 | **Agent isolation seam** — The orchestrator couples agents via `Promise.allSettled`. Do you want me to add a `testMode` flag to `processTurn` that allows injecting mock results for A1/A9/A8, or create a separate `testOrchestrator`? | Optional `testHooks` parameter on `processTurn` — one code path, existing tests unaffected. | [`ADR-010`](../adr/010-test-harness-agent-isolation.md) |
| 2 | **Session state injection** — Session state lives in Redis (rate limits) + Prisma (turns, safety). Should `mockSessionContext` write to a test Redis namespace, or use in-memory fakes? | In-memory context bundle + synthetic Prisma users (`test-user-*` prefix). No Redis namespace. | [`ADR-011`](../adr/011-test-harness-session-injection.md) |
| 3 | **Staging ↔ Prod parity alerts** — Should the test harness poll prod config (model version, safety settings) and alert on drift, or is that a separate infra concern? | Defer alerting infra. Dashboard shows read-only "config drift" warning banner only. | [`ADR-012`](../adr/012-test-harness-config-drift.md) |
| 4 | **Beta S3/S4 retention** — What retention period does the ethics committee require? (Impacts DB schema + cleanup jobs) | 90-day default, configurable via `BETA_RETENTION_DAYS` env. Document for ethics committee. | [`ADR-013`](../adr/013-test-harness-beta-retention.md) |
| 5 | **Hosting domain** — Preferred subdomain: `test-harness.evia.ai`, `harness.evia.ai`, or separate `evia-test.com`? | `test-harness.evia.ai` | [`ADR-014`](../adr/014-test-harness-hosting-domain.md) |

---

## 13. Key UX Flow Summary

### Agent Toggle Interaction

```
User clicks [A2] toggle ON
        │
        ▼
System computes: A2 needs A8, A8 needs A9-pre, A9-pre needs A1
        │
        ▼
Auto-enables: [A1] [A9-pre] [A8] [A2]
        │
        ▼
Shows toast: "🔗 Activated A1, A9-pre, A8 — A2 requires safety classification (A1), governance check (A9-pre), and routing decision (A8)"
        │
        ▼
Pipeline diagram updates: A1→A9→A8→A2 all highlighted teal
        │
        ▼
User clicks [Run Pipeline]
        │
        ▼
Visual trace shows each agent executing in order with inputs/outputs
```

### Disable Protection

```
User clicks [A1] toggle OFF (while A2 is active)
        │
        ▼
System checks: A2 and A8 depend on A1
        │
        ▼
Blocks with tooltip: "🔒 Cannot disable A1 — A2 and A8 require safety classification"
        │
        ▼
A1 toggle shows lock icon, remains enabled
```

### Mock Mode (Optional)

```
User enables "Mock Mode" for A2
        │
        ▼
UI shows mock input panels for: safetyState, governanceState, routerDecision, retrievedContext
        │
        ▼
User fills values → clicks Run
        │
        ▼
Pipeline runs: [A1: SKIPPED] → [A9-pre: SKIPPED] → [A8: SKIPPED] → [A2: EXECUTES with mock inputs]
        │
        ▼
Banner: "⚠️ Running in Mock Mode — upstream agents bypassed"
```

---

## Next Steps

Once open questions are resolved:
1. Create the `apps/test-harness/` scaffold with Next.js + tRPC + Tailwind
2. Implement Phase 1 (Foundation) with auth and dashboard
3. Add the first tRPC routers (`testConfig`, `singleAgent`)
4. Build `TH-02` and `TH-03` screens