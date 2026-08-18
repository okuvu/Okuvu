# A-06 Test-env Vertex/Gemini Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the API test environment fully deterministic for Vertex AI / Gemini by pinning all four config env vars in the Vitest setup, so no test depends on a repo-root `.env`.

**Architecture:** `apps/api/src/__tests__/setup.ts` runs before any test import (via `vitest.config.ts` `setupFiles`). It already loads `.env` via dotenv then pins `VERTEX_AI_PROJECT_ID` + `GEMINI_FLASH_LITE_MODEL`. Add the two missing pins **after** the `config()` call so they override `.env` values. The in-test delete/restore regression guards (`a9.test.ts:57-81`, `vertex-ai.test.ts:129-149`) remain compatible — they explicitly delete the env var before importing/calling.

**Tech Stack:** TypeScript strict mode, Vitest 3, dotenv, pnpm workspace.

## Global Constraints

- Pinned values verbatim from `.env.example`: `VERTEX_AI_PROJECT_ID="evia-500215"`, `VERTEX_AI_LOCATION="asia-south1"`, `GEMINI_PRO_MODEL="gemini-2.5-flash"`, `GEMINI_FLASH_LITE_MODEL="gemini-2.5-flash"`.
- Do not modify `.env.example`.
- Keep the `config()` call — other tests (e.g. `rate-limiter-concurrency.test.ts` reads `DATABASE_URL`) rely on `.env` seeding.
- Do not touch code defaults in `apps/api/src/lib/vertex-ai.ts` or agents (already canonical at `gemini-2.5-flash`).
- No code comments added (repo convention).

---

### Task 1: Pin `GEMINI_PRO_MODEL` and `VERTEX_AI_LOCATION` in setup

**Files:**
- Modify: `apps/api/src/__tests__/setup.ts:10-11`

**Interfaces:**
- Consumes: existing pins (`VERTEX_AI_PROJECT_ID`, `GEMINI_FLASH_LITE_MODEL`).
- Produces: `process.env.GEMINI_PRO_MODEL = 'gemini-2.5-flash'` and `process.env.VERTEX_AI_LOCATION = 'asia-south1'` guaranteed set before any test module import, so `getModelResource()` in `lib/vertex-ai.ts` and the `a9`/`a9-post` agent model consts are deterministic.

- [ ] **Step 1: Append the two missing pins**

After line 11, add:

```ts
process.env.GEMINI_PRO_MODEL = 'gemini-2.5-flash';
process.env.VERTEX_AI_LOCATION = 'asia-south1';
```

- [ ] **Step 2: Run the affected suites**

Run: `npx vitest run src/__tests__/a9.test.ts src/__tests__/a9-post.test.ts src/__tests__/vertex-ai.test.ts src/__tests__/orchestrator-latency.test.ts` (in `apps/api`)
Expected: all pass (a9 20 + a9-post 26 + vertex-ai 6 + orchestrator-latency).

- [ ] **Step 3: Confirm `.env`-independent determinism**

Run: `Test-Path -LiteralPath ".env"` (repo root)
Expected: `False` (no `.env` locally) — the Step 2 run already exercised the CI-equivalent no-`.env` path.

- [ ] **Step 4: Full API suite + typecheck**

Run: `pnpm test; if ($?) { pnpm typecheck }` (in `apps/api`)
Expected: all API tests pass; TypeScript strict mode clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/__tests__/setup.ts
git commit -m "fix(A-06): pin GEMINI_PRO_MODEL and VERTEX_AI_LOCATION in API vitest setup"
```

---

### Task 2: Mark A-06 fixed in the QA report

**Files:**
- Modify: `docs/testing/Consolidated_Test_Report.md:113`

**Interfaces:**
- Consumes: Task 1 (the pins that resolve the bug).
- Produces: A-06 row marked `Fixed` with a Details section mirroring A-01/A-03.

- [ ] **Step 1: Update the A-06 status cell**

Change row 113 status from `Open` to `Fixed`:

```
| A-06 | Test env missing Vertex/Gemini overrides — model & project assertions depend on `.env` values | Minor | P2 | setup.ts | Fixed |
```

- [ ] **Step 2: Add an A-06 Details section** (after the A-02/A-03 block, mirroring its format)

```markdown
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
  (6) + `orchestrator-latency.test.ts` pass with no repo-root `.env`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/testing/Consolidated_Test_Report.md
git commit -m "docs(A-06): mark test-env Vertex/Gemini overrides as fixed"
```

---

## Self-Review

**Spec coverage:**
- Fix approach #1 (add env vars to Vitest setup) → Task 1.
- Fix approach #2 (set `VERTEX_AI_PROJECT_ID`, `GEMINI_FLASH_LITE_MODEL`, `GEMINI_PRO_MODEL`) → Task 1 (first two already pinned; `GEMINI_PRO_MODEL` added; `VERTEX_AI_LOCATION` added for full path determinism, per engineer decision).
- Fix approach #3 (use `.env.example` values) → Task 1 uses exact `.env.example` values.
- Fix approach #4 (don't rely on external `.env`) → pins are applied after `config()`, overriding any `.env`; Step 3 confirms no `.env` locally.

**Placeholder scan:** No placeholders; every step has concrete content and commands.

**Type/name consistency:** `GEMINI_PRO_MODEL`, `VERTEX_AI_LOCATION`, `gemini-2.5-flash`, `asia-south1` used verbatim throughout; test names/commands match existing repo patterns.

**Known tradeoffs:**
- `orchestrator-latency.test.ts` is fully mocked and has no env dependency — listed in the bug report but needs no change.
- The dotenv `config()` call is retained (not removed) so `.env`-seeded vars used by other tests (`DATABASE_URL`, etc.) keep working.