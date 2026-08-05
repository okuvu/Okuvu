# EVIA Automated Test Bug Report Template

Adapted from `Bug_Report_Template.md` for failures found in **automated tests** —
Vitest suites (API, Worker, Therapist Portal), Flutter widget tests, Patrol E2E,
and load tests. Use this when filing a GitHub Issue for a failing/flaky test in
CI or locally. Every field is required unless marked optional. Bugs without a
reproduction command will be returned to the author for clarification.

---

## Bug Report

### Summary

**Short, descriptive title** — e.g. "`clients.setCarePlan` test fails intermittently in CI — 'expected confirmed, got provisional'"

---

### Environment

| Field | Value |
|-------|-------|
| **Build/Version** | (Git branch + commit, e.g. `story/PortalTesting` @ `a1b2c3d`) |
| **Test Suite** | evia-api / evia-worker / therapist-portal / mobile (widget) / mobile (Patrol E2E) / load (k6) |
| **Test Framework** | Vitest / Flutter test / Patrol / k6 |
| **Test File** | (path, e.g. `apps/therapist-portal/src/server/routers/__tests__/clients.add.test.ts`) |
| **Test Case ID** | (describe/it name, or R12.x / TP-xxx where applicable) |
| **Command Used** | (see [Reproduction Commands](#reproduction-commands)) |
| **CI vs Local** | CI (pipeline name + run URL) / Local |
| **Node.js Version** | (e.g. 20.11) |
| **Flutter Version** | (e.g. 3.24, only for mobile suites) |
| **Database** | local Neon branch / CI ephemeral / evia-beta |
| **LOCAL_DEV_BYPASS_AUTH** | `false` / `true` |
| **Device** (Patrol E2E only) | (e.g. Pixel 6a, Android 13) |

---

### Priority & Severity

| Field | Options | Selected |
|-------|---------|----------|
| **Priority** | P0 (Release blocker) / P1 (Should fix before beta) / P2 (Nice to have) | |
| **Severity** | Critical / Major / Minor / Trivial | |
| **HALT** | Yes / No (Does the failing test cover a HALT-level safety feature?) | |

**Failure classification** (pick the most likely):

| Type | Meaning |
|------|---------|
| **Product bug** | The test is correct; the code under test is wrong |
| **Test bug** | The test itself is wrong (bad assertion, wrong mock, race in test setup) |
| **Flake** | Test passes most runs but fails intermittently for no code change |

**Priority definitions:**
- **P0**: Release blocker — test covers a safety feature (crisis screen, A1 gate, auth), test fails consistently, or a critical path is broken.
- **P1**: Test fails intermittently (flake), covers a major feature, or blocks CI frequently.
- **P2**: Cosmetic test issue, slow test, minor coverage gap.

---

### Description

**What was the test verifying?**

> Example: The `clients.add` test verifies that adding the same phone number twice
> creates one `User` and upserts (rather than duplicates) the `therapistClient` assignment.

---

**What did it expect?**

> Example: `user.create` is called exactly once; `therapistClient.upsert` is called twice (idempotent).

---

**What actually happened?**

> Example: On the 3rd CI run in a row, the test failed with
> `expect(prisma.user.create).not.toHaveBeenCalled()` — create was called on the
> second `clients.add` call. It passes when run in isolation locally.

---

### Reproduction Steps

(Must include the exact command and be reproducible by another engineer.)

1. Check out the exact branch/commit from Environment.
2. Run the command from [Reproduction Commands](#reproduction-commands).
3. (For flakes) repeat the command N times and record pass/fail per run.

> Example:
> 1. `git checkout story/PortalTesting && pnpm install`
> 2. `cd apps/therapist-portal`
> 3. `pnpm vitest run src/server/routers/__tests__/clients.add.test.ts`
> 4. **Bug**: Fails ~1 in 3 runs (run 10×: 7 pass, 3 fail). Fails every time in CI.

---

### Reproduction Commands

| Suite | Command |
|-------|---------|
| API Vitest | `cd apps/api && pnpm test` |
| Worker Vitest | `cd apps/worker && pnpm test` |
| Portal Vitest | `cd apps/therapist-portal && pnpm vitest run` (or single file, e.g. `pnpm vitest run src/server/routers/__tests__/<file>.test.ts`) |
| Flutter widget tests | `cd apps/mobile && flutter test` |
| Patrol E2E | `pnpm e2e:login` / `pnpm e2e:onboarding` / `pnpm e2e:crisis` / `pnpm e2e:session` / `pnpm e2e:all` (from repo root, real device, beta flavor) |
| Load test | `cd apps/api && pnpm test:load` (k6 WebSocket load) |

---

### Expected vs Actual (Technical)

| Aspect | Expected | Actual |
|--------|----------|--------|
| Test exit code | 0 (pass) | 1 (fail) |
| Assertion (failing line) | (paste the assertion + expected value) | (paste actual value from failure output) |
| Error / Stack trace | | |
| Failure count | 0/N | X out of N runs (paste run log) |
| UI/Screenshot (E2E only) | Expected screen state | (attach failure screenshot) |

---

### Evidence

- **Test output / CI log link:** (paste or link)
- **Failure stack trace:**
- **Screenshot (E2E / widget):**
- **Relevant code under test** (file + line):
- **CI artifact link (if any):**

---

### Steps Taken Already

(What have you tried to diagnose the issue?)

- [ ] Re-ran the exact command locally
- [ ] Ran it N times (how many?) to check for flake
- [ ] Ran the single test file in isolation (`vitest run <file>`)
- [ ] Ran the full suite (does it fail elsewhere?)
- [ ] Ran with a clean DB / migrated schema
- [ ] Re-ran on a different environment (CI vs local, different device for E2E)
- [ ] Checked whether the test passes on the previous commit (git bisect candidate?)
- [ ] Confirmed test order dependency (does it pass alone, fail in suite?)

---

### Additional Context

| Field | Value |
|-------|-------|
| **First observed** | (date/time and timezone, e.g. 2026-08-02 09:15 IST) |
| **Frequency** | Every time / Intermittent (roughly X out of Y runs) / Once |
| **Related Issue(s)** | (Link to related GitHub Issues, if any) |
| **Spec Reference** | (Which story/test does this cover? e.g. E11-S03, R12.1) |
| **Regression?** | Did this test pass in a previous build? Which commit last passed? |

---

### Bug Triage (For Engineering Team Use Only)

| Field | Value |
|-------|-------|
| **Triaged By** | |
| **Triage Date** | |
| **Triage Outcome** | Confirmed / Cannot Reproduce / Expected Behaviour / Deferred / Flake |
| **Failure Classification** | Product bug / Test bug / Flake |
| **Assigned To** | |
| **Milestone** | MVP Beta / Post-MVP / Future |
| **Fix Branch** | |
| **Fix PR** | |
| **Fix Verified By** | |
| **Fix Verification Date** | |
| **Resolution** | Fixed / Won't Fix / Duplicate / Not Reproducible |
