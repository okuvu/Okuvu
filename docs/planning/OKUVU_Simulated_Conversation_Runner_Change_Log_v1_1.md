# OKUVU — Simulated-Conversation Runner · Change Log v1.1

**Spec:** `OKUVU_Simulated_Conversation_Runner_Spec_v1_1.docx` (22 Sep 2026)
**Scope:** `apps/test-harness` only — no changes to `apps/api`'s pipeline logic, the app, or the portal.
**Status:** All seven stories implemented (TH-S32…TH-S38) + MVP nav prune (§2). Typecheck clean on all workspaces; test suites green (harness 302/302 incl. 35 new tests, api 602/602).

---

## What was built, story by story

### TH-S32 — Persona bank on CorpusCase (data-driven personas)
| File | Change |
|---|---|
| `packages/prisma/schema.prisma` | `CorpusCase` gains two nullable Json columns: **`turns`** (ordered seed script `[{role:'user', text, expected?}]`) and **`persona_meta`** (the persona-library block) |
| `packages/prisma/migrations/20260922080000_add_conversation_runner/` | Additive migration (nullable columns + new table + nullable TestRun telemetry — nothing existing breaks) |
| `apps/test-harness/src/server/routers/corpus.ts` | New procedures: **`createPersona`**, **`bulkImportPersonas`** (per-row rejection, same contract as `bulkImportCases`), **`listPersonas`** (latest-version persona rows incl. turns + meta) |
| `apps/test-harness/scripts/seed-persona-bank.mjs` | Idempotent seed: the 5 built-in personas + spec §6.1 P01, as `type='persona'` rows. **Run: `node --env-file=.env.local scripts/seed-persona-bank.mjs`** |

Accept met: a persona is created/imported/versioned via the existing corpus path with **no code edit**; `personaId` + `personaVersion` are carried into every run. `persona-scripts.ts` is demoted to seed data (its content now lives in the bank; the file stays for the static conversation-driver path).

### TH-S33 — User-simulator agent
| File | Change |
|---|---|
| `apps/test-harness/src/lib/user-simulator.ts` (new) | LLM-driven client: one in-character turn from (persona_meta, history, gap, sessionIndex). Temp 0 + seed, `cleanSimulatorMessage` strips role labels/quotes/narration, secrets withheld until asked well, usage returned for cost tracking |

**No self-play guard (spec-critical):** the simulator resolves `TEST_HARNESS_SIMULATOR_MODEL` → default `google/gemini-2.0-flash-001` (a different family from A2's Llama-3.1-8B) and **throws** if it ever resolves to A2's model. Sandbox runs without an API key get a deterministic canned turn (zero spend, same philosophy as the pipeline's canned mode).

### TH-S34 — Multi-session orchestrator (one continuous thread)
| File | Change |
|---|---|
| `apps/test-harness/src/lib/pipeline-runner.ts` | `setupSyntheticSession` split into **`createSyntheticThread()`** (user, persistent across sessions) + **`openSyntheticSession(uid)`** (per-session SessionLog) — the original function still works (composes the two) |
| `apps/test-harness/src/lib/conversation-runner.ts` (new) | The N-session loop: simulator turn → `processTurn` → per-turn trace → session `closeSession` + worker summary/memory → next session. Gap injected as `gap_before_ms`; every turn trace carries `sessionIndex`, `turnInSession`, `gapBeforeMs` (also persisted as TestRun columns) |

### TH-S35 — Scheduler + run-batch trigger (resumable, idempotent)
| File | Change |
|---|---|
| `apps/test-harness/src/app/api/run-batch/route.ts` (new) | **`POST /api/run-batch`** — machine-triggerable: `{ environment, personaIds, sessions, turnsPerSession, gapMode, gapPlanMs, costCeilingUsd, dryRun, idempotencyKey }` → `202 { runGroupId, plannedTurns, estimatedCostUsd }`. `dryRun:true` returns the plan + cost with **zero LLM calls**. Header-token auth (`RUN_BATCH_TOKEN`, `AUDIT_BYPASS_TOKEN` also honored — spec decision #6 left open) |
| `apps/test-harness/src/app/api/run-batch/[id]/route.ts` (new) | **`GET /api/run-batch/{id}`** → `{ status, progress, costSoFar, resultsRef }`; **`POST …/{id}`** → advance one step |
| `apps/test-harness/src/app/api/run-batch/[id]/advance/route.ts` (new) | Spec-exact **`POST /api/run-batch/{id}/advance`** (re-exports the same handler) |
| `apps/test-harness/src/lib/conversation-runner.ts` | `reconstructStateFromRuns()` — any tick rebuilds thread identity + full history **purely from durable TestRun rows** (a crash loses at most one turn) |

**Idempotency:** unique `idempotency_key` on `ConversationRun` — a re-POST returns the existing group (Cloud-Tasks retry = no-op); a tick on a non-running group is a no-op. **Story-time vs wall-clock:** story-time (default) runs back-to-back with the gap injected as telemetry; wall-clock is accepted and stored for the Cloud-Tasks ops wiring (oku-owned, spec §5 Ops) — the engine pattern is `apps/api/src/lib/summary-enqueue.ts`.

### TH-S36 — Continuity & suppression asserts (C1–C5)
| File | Change |
|---|---|
| `apps/test-harness/src/lib/continuity-asserts.ts` (new) | **C1** memory written (summary+memory rows must exist) · **C2** planted-fact recall (deterministic content-word match ≥60%, LLM-judge/human-sample hook point documented) · **C3** no reset-on-affirmation (session-boundary form of the B4 seed) · **C4** no trait drift (temporary cues must not appear in stable memory fields) · **C5** suppression (S4⇒silence, S3⇒deterministic-grounding) |
| `apps/test-harness/src/lib/session-close-runner.ts` (new) | Session close that verifies summary/memory **from durable DB rows**, not the HTTP verdict — the 20 Sep worker failure mode is now a C1 **fail**, never a silent pass |

The per-turn C5 verdict folds into the turn's invariant violations; per-session C1–C5 rollups persist on the session's TestRun row and on `ConversationRun.sessions`.

### TH-S37 — Run group, pinning, cost ceiling, rails
| File | Change |
|---|---|
| `packages/prisma/schema.prisma` | New **`ConversationRun`** model (§6.4 contract: persona pin, scheduler_mode, gap plan, seed, cost ceiling/estimate/spend, status, `next_step` resume pointer, sessions rollup, run_ids, unique idempotency_key) + nullable TestRun telemetry columns (`persona_id`, `persona_version`, `simulator_model`, `session_index`, `turn_in_session`, `gap_before_ms`) |
| `apps/test-harness/src/lib/conversation-runner.ts` | Rails enforced inline: **cost ceiling** (hard stop before spending → group `incomplete`, never passed) · **staging-only** (beta/production refused; sandbox for dry-runs) · **canned refusal** (`USE_CANNED_LLM_RESPONSE` set outside sandbox refuses) · synthetic-only (personas come only from the synthetic persona bank) · crisis turns route to the existing review surfaces |

### TH-S38 — Bulk output export (.xlsx)
| File | Change |
|---|---|
| `apps/test-harness/src/lib/workbook-export.ts` (new) | One workbook, three sheets — **Summary** (1 row/run), **Turns** (1 row/turn: userMessage, okuvuResponse, safetyState, latency, fallback, invariants, gap — *the flat table that replaces hand-copying*), **Sessions** (1 row/session with C1–C5). Built on the repo's existing `xlsx` dependency — no new package. Bounded at `MAX_EXPORT_ROWS = 20_000` runs |
| `apps/test-harness/src/server/routers/results-export.ts` (new) | **`resultsExport.exportRuns`** tRPC mutation — scope by run group / persona / date range / environment; `dryRun:true` previews the row count before generating; returns base64 xlsx + sheet counts. Wired into `_app.ts` |

Per-run JSON/CSV export is unchanged.

### §2 — MVP nav prune (14 screens → 5, nothing deleted)
| File | Change |
|---|---|
| `apps/test-harness/src/app/dashboard/_components/ScreensNav.tsx` | Rewritten as the MVP information architecture: **Chat / Agent / Pipeline / Personas / Results** + the **safety exception** (Fault Injection stays reachable — "prove the fail-safe fires" must be defensible day one). Deferred screens (Stochastic Sampling, CI Regression, Review Results, Determinism panels, Beta Status, Corpus, Blinded Review, Model Config) remain reachable **by URL** and reappear in the nav with `NEXT_PUBLIC_HARNESS_FULL_NAV=1` or in dev. Fully reversible |

---

## Verification (what's green right now)

| Check | Result |
|---|---|
| `tsc --noEmit` — test-harness / api / worker | ✅ clean, all three |
| test-harness vitest | ✅ **302 passed** (267 existing + 35 new), 3 skipped by design |
| apps/api vitest | ✅ **602 passed** |
| Migration on `test_harness` Neon branch | ✅ `20260922080000_add_conversation_runner` applied; `prisma migrate deploy` reports up to date |
| Persona bank seed | ✅ 6 personas created (P-anxious, P-crisis-escalating, P-fidelity, P-adversarial, P-continuity, P01) |
| New unit tests | `user-simulator.test.ts` (message cleaning, canned determinism, no-self-play guard) · `continuity-asserts.test.ts` (C2/C3/C5 semantics, deterministic turn planner) · `workbook-export.test.ts` (3 sheets, fallback honesty, row bounding) |

**Not yet exercised end-to-end (needs the 3 dev servers + OPENROUTER_API_KEY):** a real staging run-batch (POST → advance ticks → C1–C5 verdicts on real turns) and the wall-clock scheduler (oku's ops item). The sandbox dry-run path (`dryRun:true`, zero LLM calls) and all unit paths are covered.

---

## How to try it (quick start)

```bash
# 0. migration already applied to the test_harness branch; seed already run.
#    Re-run any time — it's idempotent:
cd apps/test-harness && node --env-file=.env.local scripts/seed-persona-bank.mjs

# 1. three terminals (worker → api → harness)
cd apps/worker && pnpm dev            # port 3303 (per root .env)
cd apps/api && pnpm dev
cd apps/test-harness && pnpm dev      # port 3002

# 2. dry-run the trigger (zero LLM calls) — plan + cost only:
curl -X POST http://localhost:3002/api/run-batch \
  -H "content-type: application/json" -H "x-run-batch-token: $RUN_BATCH_TOKEN" \
  -d '{"environment":"sandbox","dryRun":true,"personaIds":["<persona-case-id>"],"sessions":2,"idempotencyKey":"trial-1"}'

# 3. real run: same without dryRun, then tick:
#    POST /api/run-batch/{id}/advance   (repeat until done:true)
#    GET  /api/run-batch/{id}           (status, progress, costSoFar)

# 4. persona case ids: corpus.listPersonas in the UI, or Prisma Studio →
#    CorpusCase (type='persona').
```

UI: dashboard nav now shows the 5 MVP screens; **Personas** → Conversation Driver; bulk export appears under Results via `resultsExport.exportRuns`.

---

## Open items (spec Table 7 — unchanged, decisions needed from the named owners)

1. Which 10 personas (Shubhangi) — import path ready via `corpus.bulkImportPersonas`
2. Cost ceiling per run/day (Shubhangi + Rajwant) — default $25/group, configurable per POST
3. Simulator model pin (Shubham/Yash) — set `TEST_HARNESS_SIMULATOR_MODEL`; default is a non-Llama family
4. Wall-clock scope (Shubhangi) — mode is accepted; Cloud-Tasks ops wiring is the oku-owned item
5. Judge + human sample rate for C2/C4 (Shubhangi) — deterministic structural check ships now
6. Scheduler auth token (Shubham/Yash) — currently `RUN_BATCH_TOKEN` (AUDIT_BYPASS_TOKEN honored)
7. Export bounds (Shubham/Yash) — 20k-run cap, date-range scoping shipped; stream-vs-blob can revisit if exports grow

## Deployment note for your Sr

One more **additive** migration (`20260922080000_add_conversation_runner`) must be applied to **main** before deploying this code — same procedure as last time (`prisma migrate deploy` on the main branch URL). No other new env vars are mandatory; `TEST_HARNESS_SIMULATOR_MODEL` and `RUN_BATCH_TOKEN` are optional but recommended.
