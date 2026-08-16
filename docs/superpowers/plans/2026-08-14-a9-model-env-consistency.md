# A9 Flash-Lite Model Config Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `GEMINI_FLASH_LITE_MODEL` canonical to `gemini-2.5-flash` everywhere (tests, code defaults, env example) so the API test suite passes deterministically regardless of whether a root `.env` exists.

**Architecture:** The API agent tests are environment-dependent: each agent reads `process.env.GEMINI_FLASH_LITE_MODEL` at module-load time into a top-level `const`. With no repo-root `.env`, the code default `gemini-3.1-flash-lite-preview` wins and contradicts the `a9.test.ts` expectation of `gemini-2.5-flash`. Fix = pin the env var in the Vitest setup file (runs before any test module import), align the sibling `a9-post` test to the same value, and sync the runtime code defaults to match `.env.example`. Model value decision made with the engineer: `gemini-2.5-flash` is canonical (matches `.env.example`, deliberately downgraded in commit `a0567af`).

**Tech Stack:** TypeScript strict mode, Vitest 3, dotenv, pnpm workspace.

## Global Constraints

- Canonical model value: exactly `gemini-2.5-flash` (no other string anywhere for flash-lite).
- Test env must be deterministic — do not rely on a repo-root `.env` file existing (it does not exist in a fresh checkout or CI).
- `.env.example` already sets `GEMINI_FLASH_LITE_MODEL="gemini-2.5-flash"` and `GEMINI_PRO_MODEL="gemini-2.5-flash"` — do not modify `.env.example`.
- `.env.example` comment: "Gemini models (do not change without a full LLM Change Impact Register review)" — the canonical value is being *kept* at 2.5, not changed to a new model, so no LLM review is triggered.
- `apps/worker` tests do not assert any model string — no worker test changes and no worker test setup pin are needed.
- No code comments added (repo convention).

---

### Task 1: Pin `GEMINI_FLASH_LITE_MODEL` in the API test setup

**Files:**
- Modify: `apps/api/src/__tests__/setup.ts` (append after the dotenv `config(...)` call)

**Interfaces:**
- Consumes: n/a (first task)
- Produces: `process.env.GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash'` is guaranteed set before any test module import, so agent module-level `FLASH_LITE_MODEL` consts (in `a9/agent.ts` and `a9-post/agent.ts`) are deterministic.

- [ ] **Step 1: Confirm the failing test (pre-existing)**

Run: `npx vitest run src/__tests__/a9.test.ts`
Expected: FAIL — `AssertionError: expected 'gemini-3.1-flash-lite-preview' to be 'gemini-2.5-flash'` (this is the bug being fixed).

- [ ] **Step 2: Add the pin to `setup.ts`**

Append this final line (after the `config(...)` call):

```ts
process.env.GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash';
```

- [ ] **Step 3: Run a9 test suite to verify it now passes**

Run: `npx vitest run src/__tests__/a9.test.ts src/__tests__/a9-post.test.ts`
Expected: a9 passes (20/20). a9-post is now expected to FAIL its model-selection test (it still asserts `gemini-3.1-flash-lite-preview` while the pinned env provides `gemini-2.5-flash`) — that failing sibling test is fixed in Task 2.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/__tests__/setup.ts
git commit -m "fix(test): pin GEMINI_FLASH_LITE_MODEL in API vitest setup"
```

---

### Task 2: Align the `a9-post` test model expectation

**Files:**
- Modify: `apps/api/src/__tests__/a9-post.test.ts:166`

**Interfaces:**
- Consumes: env pin from Task 1 (runtime value is now `gemini-2.5-flash`)
- Produces: both API flash-lite agent tests (`a9`, `a9-post`) assert the same canonical model string `gemini-2.5-flash`.

- [ ] **Step 1: Confirm the failing test**

Run: `npx vitest run src/__tests__/a9-post.test.ts`
Expected: FAIL — `expected 'gemini-2.5-flash' to be 'gemini-3.1-flash-lite-preview'` at the model-selection test.

- [ ] **Step 2: Update the expectation**

In `apps/api/src/__tests__/a9-post.test.ts`, change line 166 from `expect(callArgs.model).toBe('gemini-3.1-flash-lite-preview')` to `expect(callArgs.model).toBe('gemini-2.5-flash')`.

- [ ] **Step 3: Run both a9 test suites**

Run: `npx vitest run src/__tests__/a9.test.ts src/__tests__/a9-post.test.ts`
Expected: PASS — all tests in both files.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/__tests__/a9-post.test.ts
git commit -m "test(a9): align a9-post model expectation to gemini-2.5-flash"
```

---

### Task 3: Sync flash-lite code defaults and add a regression test

**Files:**
- Modify: `apps/api/src/agents/a9/agent.ts:7-8`
- Modify: `apps/api/src/agents/a9-post/agent.ts:8-9`
- Modify: `apps/worker/src/lib/vertex-ai.ts:21`
- Test: `apps/api/src/__tests__/a9.test.ts` (add one test inside `describe('model selection', ...)`)

**Interfaces:**
- Consumes: env pin from Task 1 (tests run with env set); the regression test intentionally deletes the env var to exercise the code default.
- Produces: runtime (no env var) flash-lite default is `gemini-2.5-flash` in all three locations, matching `.env.example`.

- [ ] **Step 1: Write the failing regression test**

Append this test inside the existing `describe('model selection', ...)` block in `apps/api/src/__tests__/a9.test.ts`, after the existing `calls Gemini Flash-Lite (not Pro)` test:

```ts
    it('defaults to gemini-2.5-flash when GEMINI_FLASH_LITE_MODEL is unset', async () => {
      delete process.env.GEMINI_FLASH_LITE_MODEL;
      vi.resetModules();
      const { classifyGovernance: freshClassify } = await import('../agents/a9/agent.js');

      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({ governanceState: 'Active' }),
        fallbackUsed: false,
      });

      await freshClassify(makeInput());

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.model).toBe('gemini-2.5-flash');
    });
```

- [ ] **Step 2: Run the regression test to verify it fails**

Run: `npx vitest run src/__tests__/a9.test.ts -t "when GEMINI_FLASH_LITE_MODEL is unset"`
Expected: FAIL — `expected 'gemini-3.1-flash-lite-preview' to be 'gemini-2.5-flash'`.

- [ ] **Step 3: Update the three code defaults**

`apps/api/src/agents/a9/agent.ts` lines 7-8:

```ts
const FLASH_LITE_MODEL =
  process.env.GEMINI_FLASH_LITE_MODEL ?? 'gemini-2.5-flash';
```

`apps/api/src/agents/a9-post/agent.ts` lines 8-9:

```ts
const FLASH_LITE_MODEL =
  process.env.GEMINI_FLASH_LITE_MODEL ?? 'gemini-2.5-flash';
```

`apps/worker/src/lib/vertex-ai.ts` line 21:

```ts
  const model = process.env.GEMINI_FLASH_LITE_MODEL ?? 'gemini-2.5-flash';
```

- [ ] **Step 4: Run the regression test to verify it passes**

Run: `npx vitest run src/__tests__/a9.test.ts -t "when GEMINI_FLASH_LITE_MODEL is unset"`
Expected: PASS.

- [ ] **Step 5: Confirm no stale flash-lite string remains**

Run: `git grep "gemini-3.1-flash-lite-preview"`
Expected: no matches (exit code 1 / empty output).

- [ ] **Step 6: Run the two a9 suites in full**

Run: `npx vitest run src/__tests__/a9.test.ts src/__tests__/a9-post.test.ts`
Expected: PASS — all tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/agents/a9/agent.ts apps/api/src/agents/a9-post/agent.ts apps/worker/src/lib/vertex-ai.ts apps/api/src/__tests__/a9.test.ts
git commit -m "refactor(config): sync Gemini flash-lite default to .env.example"
```

---

### Task 4: Sync the `GEMINI_PRO_MODEL` default (parallel config consistency)

**Files:**
- Modify: `apps/api/src/lib/vertex-ai.ts:23`

**Interfaces:**
- Consumes: nothing at runtime (pro model default read at call time, not module-load)
- Produces: `getModelResource`'s no-env pro default matches `.env.example`'s `GEMINI_PRO_MODEL="gemini-2.5-flash"`.

- [ ] **Step 1: Confirm current (stale) default**

Run: `git grep "gemini-3.1-pro-preview"`
Expected: one match at `apps/api/src/lib/vertex-ai.ts:23`.

- [ ] **Step 2: Update the default**

`apps/api/src/lib/vertex-ai.ts` line 23:

```ts
  const model = modelName ?? process.env.GEMINI_PRO_MODEL ?? 'gemini-2.5-flash';
```

- [ ] **Step 3: Confirm no stale pro string remains**

Run: `git grep "gemini-3.1-pro-preview"`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/vertex-ai.ts
git commit -m "chore(config): sync GEMINI_PRO_MODEL default to .env.example"
```

---

### Task 5: Full verification

**Files:**
- None (verification only)

- [ ] **Step 1: API test suite + typecheck**

Run: `pnpm test` then `pnpm typecheck` (in `apps/api`)
Expected: all API tests pass; TypeScript strict mode clean.

- [ ] **Step 2: Worker test suite + typecheck**

Run: `pnpm test` then `pnpm typecheck` (in `apps/worker`)
Expected: all worker tests pass; TypeScript strict mode clean.

- [ ] **Step 3: Final global grep**

Run: `git grep -E "gemini-3\.1-(flash-lite|pro)-preview"` (repo root)
Expected: no matches anywhere.

---

## Self-Review

**Spec coverage:**
- `a9.test.ts:54` failing on model mismatch → fixed by Task 1 (env pin) + Task 3 (default sync); assertion unchanged at `gemini-2.5-flash`.
- Root cause (env var unset, stale code default) → Task 1 + Task 3.
- `.env.example` value `gemini-2.5-flash` reflected in test config → Task 1 (pin = same value).
- Sibling `a9-post.test.ts:166` breakage from the pin → Task 2.
- Worker default with same stale string → Task 3 (line 21).
- Parallel `GEMINI_PRO_MODEL` staleness → Task 4.

**Placeholder scan:** Every step has concrete content/commands; no "TBD" or vague instructions.

**Type/name consistency:** `GEMINI_FLASH_LITE_MODEL` and `gemini-2.5-flash` used verbatim throughout; test names and assertions match; regression test re-imports `classifyGovernance` from the same path (`../agents/a9/agent.js`) the top-level import uses.

**Known tradeoffs:**
- The pin in `setup.ts` forces `gemini-2.5-flash` even if a `.env` intentionally overrides it — deliberate determinism, per the engineer's decision.
- Task 4 is a one-line pro-model sync beyond the reported flash-lite bug; drop it if the team wants strictly minimal scope (Task 3's suite is already green without it).
