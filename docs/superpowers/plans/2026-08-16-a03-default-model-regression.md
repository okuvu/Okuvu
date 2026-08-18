# A-03 Default Pro Model Regression Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "uses default Pro model" test deterministically assert the exact canonical model, independent of any local `.env`, so a regression to a stale model string fails loudly.

**Architecture:** The A-03 bug's root cause is already fixed — `apps/api/src/lib/vertex-ai.ts:23` falls back to `gemini-2.5-flash` and `apps/api/src/__tests__/setup.ts:10` pins `VERTEX_AI_PROJECT_ID='evia-500215'`. The remaining gap is the test assertion: it only checks a prefix regex, so the actual model value silently depends on `GEMINI_PRO_MODEL` (from a local `.env` if present). Fix = delete the env var in the test, assert the full model path exactly, restore env afterward. `getModelResource` reads env at call time (not module-load), so no `vi.resetModules()` is needed.

**Tech Stack:** TypeScript strict mode, Vitest 3.

## Global Constraints

- Canonical Pro model value: exactly `gemini-2.5-flash` (matches `.env.example`).
- Do not modify `apps/api/src/__tests__/setup.ts` — scope is the test file only.
- No code comments added (repo convention).
- Env vars touched by the test must be restored in a `finally` block.

---

### Task 1: Strengthen the default-model assertion

**Files:**
- Modify: `apps/api/src/__tests__/vertex-ai.test.ts:129-139`

**Interfaces:**
- Consumes: `generateContent` from `../lib/vertex-ai.js`; `mockGenerateContent` mock.
- Produces: a deterministic regression guard asserting `projects/evia-500215/locations/asia-south1/publishers/google/models/gemini-2.5-flash` when no `model` param and no `GEMINI_PRO_MODEL` env var.

- [x] **Step 1: Replace the prefix-regex assertion**

The `uses default Pro model when no model param provided` test now deletes `process.env.GEMINI_PRO_MODEL`, asserts the exact model path, and restores env in a `finally` block:

```ts
    it('uses default Pro model when no model param provided', async () => {
      const prevModel = process.env.GEMINI_PRO_MODEL;
      delete process.env.GEMINI_PRO_MODEL;

      try {
        await generateContent({
          systemInstruction: 'test',
          contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        });

        const actualModel = mockGenerateContent.mock.calls[0][0].model;
        expect(actualModel).toBe(
          'projects/evia-500215/locations/asia-south1/publishers/google/models/gemini-2.5-flash',
        );
      } finally {
        if (prevModel === undefined) {
          delete process.env.GEMINI_PRO_MODEL;
        } else {
          process.env.GEMINI_PRO_MODEL = prevModel;
        }
      }
    });
```

- [x] **Step 2: Verify the test passes**

Run: `npx vitest run src/__tests__/vertex-ai.test.ts` (in `apps/api`)
Expected: PASS — all 6 tests.

- [x] **Step 3: Verify no regression to the stale string**

Run: `git grep "gemini-3.1-pro-preview"` (repo root)
Expected: no matches in code (docs references are historical).

- [x] **Step 4: Commit**

```bash
git add apps/api/src/__tests__/vertex-ai.test.ts
git commit -m "test(A-03): assert exact default Pro model in vertex-ai test"
```

---

## Self-Review

**Spec coverage:** The reported A-03 failure (test expected a pro model, received a stale `gemini-3.1-pro-preview`) is guarded: if the code fallback ever diverges from `gemini-2.5-flash`, the exact-match assertion fails.

**Placeholder scan:** No placeholders; all steps have concrete content and were executed.

**Type/name consistency:** `GEMINI_PRO_MODEL`, `gemini-2.5-flash`, and the full resource path are used verbatim; env is restored to its prior state to avoid cross-test leakage.

**Known tradeoffs:** Scope deliberately excludes pinning `GEMINI_PRO_MODEL` in `setup.ts` (open bug A-06) per user choice — the test deletes the var itself, so it is deterministic regardless of `.env`.