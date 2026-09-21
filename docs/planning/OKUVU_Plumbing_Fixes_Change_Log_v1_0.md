# OKUVU — Plumbing Fixes & Rationale v1.0 → Implementation Change Log

**Status: implemented & verified (21 Sep 2026).** This document maps every item from
`OKUVU_Plumbing_Fixes_and_Rationale_v1_0.docx` to the code changes made, and tells you
exactly how to check each one yourself.

---

## 0. Verification status (as of this change log)

| Workspace | Typecheck | Tests |
|---|---|---|
| `apps/api` | ✅ `tsc --noEmit` clean | ✅ 595+ passed — 6 pre-existing Firebase-token tests time out **only** under full-suite parallelism; each passes when run in isolation (environmental, unrelated to these changes) |
| `apps/worker` | ✅ clean | — (typechecked) |
| `apps/test-harness` | ✅ clean | ✅ **267 passed / 270** (3 skipped by design) |

Prisma migrations: 3 new (see B-migrations below).

---

## 1. Item-by-item changes

### A1 — Dead summary/memory worker (was: `WORKER_URL` unset → silent `processed:false`)
| What | Where |
|---|---|
| New `GET /health` route on the worker — returns `{ ok, db }`, probes the DB | `apps/worker/src/routes/health.ts` (new), registered in `apps/worker/src/routes/index.ts` |
| API-side health helper + **startup assertion**: API fails loudly at boot if the worker is unreachable | `apps/api/src/lib/worker-health.ts` (new), wired in `apps/api/src/server.ts` |
| Harness-side health helper (non-throwing, feeds B1) | `apps/test-harness/src/lib/worker-health.ts` (new) |

**How to verify:**
1. Run the worker with `WORKER_URL` unset → start the API → the API logs a loud failure at startup instead of silently degrading all session summaries.
2. `curl http://<worker-host>:<port>/health` → you get `{"ok":true,"db":"ok"}` (or `"db":"unreachable"` if the worker can't reach Postgres — no more guesswork).
3. In the harness, a run with no worker now lands as **`incomplete`** (see B1), never a clean `pass`.

### A2 — History not reaching A2 / reset-on-affirmation
| What | Where |
|---|---|
| **Root cause fixed**: the orchestrator now fetches the current session's turns and passes them to A2 (previously it built history from *past-session summaries only* — with the worker dead, A2 saw zero history and read "okay" as a fresh session) | `apps/api/src/pipeline/orchestrator.ts` |
| New prompt **v2.1** with the continuity rule: a short affirmation ("okay", "hmm", "yeah") is a *continuation*, never a new session — never re-onboard | `apps/api/src/prompts/a2-okuvu-v2.1.txt` (new), registered in `apps/api/src/prompts/index.ts`, shim + hash manifest updated (`apps/test-harness/scripts/generate-prompt-shim.mjs`, `apps/test-harness/src/lib/prompt-hash.ts`) |

**How to verify:** run the new `continuity` persona (see the testing guide) — before this fix the agent re-onboarded after "okay"; now it continues the thread. Prompt provenance on every run now records `a2-okuvu-v2.1`.

### A3 — Ungoverned block-substitute path
| What | Where |
|---|---|
| Rewrote block-substitute copy: warm, holds the thread, no micro-techniques, reviewed contract documented in-code | `apps/api/src/pipeline/fallbacks.ts` |

**⚠️ Needs SME sign-off:** the copy *mechanism* is implemented and governed, but the **wording itself is engineering-authored** — the doc requires clinical/SME approval of block-response copy before beta. Please review `fallbacks.ts`.

### A4 — Telemetry lies on blocks (`fallbackUsed:false`)
| What | Where |
|---|---|
| A9-pre / A9-post block substitutions now set `fallbackUsed: true` (they previously reported clean passes, defeating the harness halt-gate) | `apps/api/src/pipeline/orchestrator.ts` |
| New `fallbackSource` field records **which** mechanism substituted (e.g. `a9_post_blocked`) | `apps/api/src/pipeline/types.ts`, `packages/shared-types/index.ts` |
| Per-turn persistence + surfaced to websocket clients | `packages/prisma/schema.prisma` (`Turn.fallback_source`), `apps/api/src/routes/websocket.ts` |

**How to verify:** `packages/prisma/migrations/20260920130000_add_turn_fallback_source/migration.sql`. Trigger a blocked turn (e.g. the `adversarial` persona) → the assistant `Turn` row has `fallback_source='a9_post_blocked'` and `fallback_used=true`; the websocket frame carries `fallbackSource`.

### A5 — Signal stripper too literal
| What | Where |
|---|---|
| Marker-based stripping: everything from a prose block/machine-signal marker (line-start or mid-line, e.g. `BLOCK 2 — MACHINE SIGNAL`) is stripped before delivery; ordinary prose containing "block" is untouched (case-sensitive markers) | `apps/api/src/agents/a2/agent.ts` |

**How to verify:** unit tests in `apps/api/src/__tests__/a2.test.ts` cover improvised headers, fenced leaks, and the negative case (normal prose survives).

### A6 — `Restricted` has no downstream effect — **NOT IMPLEMENTED (blocked on SME decision)**
The doc presents an either/or that only the SME can decide:
- **(a)** wire Restricted into A8/A2 as a real boundary-hold mode (touches types, agents, prompts, orchestrator), **or**
- **(b)** stop emitting Restricted on benign input (A9 prompt change only).

**Ask your SME to pick (a) or (b)** — then it's a ~0.5–1 day change. Nothing was changed here to avoid guessing wrong.

### A7 — Trace exports drop the user's words
| What | Where |
|---|---|
| Probe/trace exports now include the user turn text | `apps/test-harness/src/lib/pipeline-runner.ts`, `apps/test-harness/src/lib/trace-export.ts` |

### A8 — Latency measured only in aggregate
| What | Where |
|---|---|
| `latency-test` script reports **per-stage** timings (A1 / A2 / A9-post) against per-stage budgets, with pass/fail lines | `apps/api/src/scripts/latency-test.ts` |

**⚠️ Budgets are placeholders** — the doc defers the exact ms budgets to SME sign-off; they're clearly marked constants in the script.

### B1 — Stage failure can still yield a clean run
| What | Where |
|---|---|
| New `'incomplete'` run status; any stage failure / worker no-op → `incomplete` (never `pass`) | `packages/prisma/schema.prisma` (`TestRunStatus`), migration `20260920110000_add_test_run_status_incomplete` |
| Run-creating routers apply the rule (worker probe / `workerStage` outcome folded into status) | `apps/test-harness/src/server/routers/pipeline.ts`, `corpus.ts`, `conversation.ts` |
| Status consumers updated (`incomplete` handled everywhere; scorecard **excludes** incomplete runs from pass-rate) | `apps/test-harness/src/lib/run-status.ts`, `apps/test-harness/src/lib/scorecard.ts` |

**How to verify:** stop the worker, run a persona → run status is `incomplete`, dashboard pass-rate unaffected (run excluded, not scored clean).

### B2 — Results not tied to build/model/prompt
| What | Where |
|---|---|
| Every run now records an identity header: `build_sha`, `corpus_version`, `run_mode` (real vs canned) | `apps/test-harness/src/lib/run-identity.ts` (new), `packages/prisma/schema.prisma`, migration `20260920120000_add_test_run_identity_header` |
| Applied in all run-creating routers | `pipeline.ts`, `corpus.ts`, `conversation.ts` |

**How to verify:** open any new run row → `build_sha` / `corpus_version` / `run_mode` are populated (older rows stay NULL by design).

### B3 — Review artifacts not paired / not enforced
| What | Where |
|---|---|
| Export guard: trace exports fail loudly if stimulus (user turns) are missing | `apps/test-harness/src/server/routers/conversation.ts` (`exportTrace`), `apps/test-harness/src/lib/trace-export.ts` |

### B4 — No regression seeds
| What | Where |
|---|---|
| New `continuity` persona script (short-affirmation → no re-onboarding) + label, selectable in Conversations page, Simulator, and Simulator zod enum | `apps/test-harness/src/lib/persona-scripts.ts`, `PersonaPicker.tsx`, `LeftConfigPanel.tsx`, `simulator.ts` |
| Unit regression seeds: A5 marker stripping, A2 continuity, A4 fallback-provenance assertions | `apps/api/src/__tests__/a2.test.ts`, `orchestrator.testMode.test.ts`, `orchestrator.test.ts` (pre-existing assertions that pinned the *buggy* A4 behavior were flipped to the new contract), `apps/test-harness/src/__tests__/conversation.test.ts` (new B1 worker-probe regression case) |

---

## 2. "How can I check what all is changed?"

### Quick commands
```bash
# Everything changed vs the branch point (files + stats)
git status
git diff --stat

# Review a specific area
git diff apps/api/src/pipeline/orchestrator.ts   # A2 + A4
git diff apps/api/src/pipeline/fallbacks.ts      # A3 copy
git diff apps/api/src/agents/a2/agent.ts         # A5
git diff packages/prisma/schema.prisma           # B1/B2/A4 schema
```

### New files (untracked) — the cleanest review targets
```
apps/api/src/lib/worker-health.ts                      # A1
apps/api/src/prompts/a2-okuvu-v2.1.txt                 # A2 prompt
apps/test-harness/src/lib/worker-health.ts             # A1/B1
apps/test-harness/src/lib/run-identity.ts              # B2
apps/worker/src/routes/health.ts                       # A1
packages/prisma/migrations/2026092011…/                # B1 status
packages/prisma/migrations/2026092012…/                # B2 identity
packages/prisma/migrations/2026092013…/                # A4 fallback_source
```

### Run the verification yourself
```bash
# 1. Schema + client
cd packages/prisma && pnpm exec prisma migrate deploy && pnpm exec prisma generate

# 2. Typechecks
cd apps/api && pnpm exec tsc --noEmit
cd apps/worker && pnpm exec tsc --noEmit
cd apps/test-harness && pnpm exec tsc --noEmit

# 3. Tests
cd apps/api && pnpm exec vitest run
cd apps/test-harness && pnpm exec vitest run

# 4. Per-stage latency budgets (A8) — needs API env + network
cd apps/api && pnpm exec tsx src/scripts/latency-test.ts
```

### Visible in the UI (test harness, `pnpm dev` → port 3002)
- **Conversations page**: new persona **"Continuity / no re-onboarding (B4 regression seed)"** in the picker.
- **Run results / results page**: statuses now include **`incomplete`**; new runs show `build_sha`, `corpus_version`, `run_mode`.
- **Pass-rate on the dashboard**: excludes `incomplete` runs instead of silently counting them.

---

## 3. Open items (need a human, not code)
1. **A6** — SME must choose option (a) or (b) (see §1). Blocking nothing else, but Restricted remains a no-op until then.
2. **A3 copy** — clinical/SME sign-off on the block-response wording in `fallbacks.ts`.
3. **A8 budgets** — exact per-stage ms budgets to replace the placeholder constants in `latency-test.ts`.
4. **Deploy** — the harness Firebase Hosting pipeline (`evia-test-harness` project, web-frameworks) is configured but never deploy-verified; budget ~0.5–1 day with friction expected on the custom domain + `webframeworks` experiment steps.
