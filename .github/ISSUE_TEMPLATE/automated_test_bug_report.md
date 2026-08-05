---
name: Automated test bug report
about: Failure found in an automated test suite (Vitest, Flutter widget, Patrol E2E, or load)
title: '[TEST BUG] '
labels: bug, automated-test
assignees: ''
---

## Summary

**Short, descriptive title** — e.g. "`clients.setCarePlan` test fails intermittently in CI — 'expected confirmed, got provisional'"

---

## Environment

| Field | Value |
|-------|-------|
| **Build/Version** | (Git branch + commit, e.g. `story/PortalTesting` @ `a1b2c3d`) |
| **Test Suite** | evia-api / evia-worker / therapist-portal / mobile (widget) / mobile (Patrol E2E) / load (k6) |
| **Test Framework** | Vitest / Flutter test / Patrol / k6 |
| **Test File** | (path, e.g. `apps/therapist-portal/src/server/routers/__tests__/clients.add.test.ts`) |
| **Test Case ID** | (describe/it name, or R12.x / TP-xxx where applicable) |
| **Command Used** | (see Reproduction Steps) |
| **CI vs Local** | CI (pipeline + run URL) / Local |
| **Node.js Version** | (e.g. 20.11) |
| **Flutter Version** | (e.g. 3.24, only for mobile suites) |
| **Database** | local Neon branch / CI ephemeral / evia-beta |
| **LOCAL_DEV_BYPASS_AUTH** | `false` / `true` |
| **Device** (Patrol E2E only) | (e.g. Pixel 6a, Android 13) |

---

## Priority & Severity

- **Priority:** ☐ P0 (Release blocker) / ☐ P1 (Should fix before beta) / ☐ P2 (Nice to have)
- **Severity:** ☐ Critical / ☐ Major / ☐ Minor / ☐ Trivial
- **HALT:** ☐ Yes / ☐ No (Does the failing test cover a HALT-level safety feature?)

**Failure classification:** ☐ Product bug / ☐ Test bug / ☐ Flake

---

## Description

**What was the test verifying?**

> 

**What did it expect?**

> 

**What actually happened?**

> 

---

## Reproduction Steps

1. Check out the exact branch/commit from Environment.
2. Run the exact test command (below).
3. (For flakes) repeat the command N times and record pass/fail per run.

**Common commands:**
- API: `cd apps/api && pnpm test`
- Worker: `cd apps/worker && pnpm test`
- Portal: `cd apps/therapist-portal && pnpm vitest run` (or a single file, e.g. `pnpm vitest run src/server/routers/__tests__/<file>.test.ts`)
- Flutter widget: `cd apps/mobile && flutter test`
- Patrol E2E: `pnpm e2e:login` / `pnpm e2e:onboarding` / `pnpm e2e:crisis` / `pnpm e2e:session` / `pnpm e2e:all` (repo root, real device, beta flavor)
- Load: `cd apps/api && pnpm test:load` (k6 WebSocket load)

---

## Expected vs Actual (Technical)

| Aspect | Expected | Actual |
|--------|----------|--------|
| Test exit code | 0 (pass) | 1 (fail) |
| Assertion (failing line) | | |
| Error / Stack trace | | |
| Failure count | 0/N | X out of N runs |

---

## Evidence

- **Test output / CI log link:**
- **Failure stack trace:**
- **Screenshot (E2E / widget):**
- **Relevant code under test** (file + line):
- **CI artifact link (if any):**

---

## Steps Taken Already

- [ ] Re-ran the exact command locally
- [ ] Ran it N times (how many?) to check for flake
- [ ] Ran the single test file in isolation (`vitest run <file>`)
- [ ] Ran the full suite (does it fail elsewhere?)
- [ ] Ran with a clean DB / migrated schema
- [ ] Re-ran on a different environment (CI vs local, different device for E2E)
- [ ] Confirmed the test passes on the previous commit (bisect candidate?)
- [ ] Confirmed test-order dependency (passes alone, fails in suite?)

---

## Additional Context

| Field | Value |
|-------|-------|
| **First observed** | (date/time and timezone) |
| **Frequency** | Every time / Intermittent (X out of Y runs) / Once |
| **Related Issue(s)** | |
| **Spec Reference** | (e.g. E11-S03, R12.1) |
| **Regression?** | Did this test pass in a previous build? Which commit last passed? |

---

## Bug Triage (For Engineering Team Use Only)

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
