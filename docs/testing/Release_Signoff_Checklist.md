# EVIA Release Sign-off Checklist

## Release Readiness Verification

| | |
|---|---|
| **Application** | EVIA Mobile Application (Android) + Therapist Portal |
| **Release Version** | |
| **Build Number** | |
| **Release Type** | ☐ MVP Beta / ☐ Internal Dogfooding / ☐ Hotfix / ☐ Other |
| **Target Date** | |
| **Release Engineer** | |

---

### Instructions

1. Complete every section below. Each item must be **checked (✓)** or marked **N/A** with a reason.
2. Any item left unchecked blocks the release.
3. All three signatories (Senior Engineer, Lead Developer, Product Lead) must sign before release proceeds.
4. Attach evidence (test reports, screenshots, log links) where indicated.

---

### Section 1: Code & Build

| # | Item | Criteria | Status | Evidence |
|---|------|----------|--------|----------|
| 1.1 | All PRs merged to target branch | No open PRs targeting this release branch | ☐ | Link to PR list: |
| 1.2 | Branch is `develop` (not `main`) | Release target is develop for MVP | ☐ | |
| 1.3 | Build succeeds | `flutter build apk --flavor beta` succeeds with zero errors | ☐ | Build log: |
| 1.4 | Version number bumped | Version incremented per semantic versioning convention | ☐ | Version: |
| 1.5 | No debug / temporary code committed | No `print()`, `console.log`, `TODO`, or `FIXME` in release code | ☐ | |
| 1.6 | No credentials committed | `git diff --name-only` shows no `.env` files, service account JSONs, or secrets | ☐ | |
| 1.7 | LOCAL_DEV_BYPASS_AUTH is false | Confirmed `LOCAL_DEV_BYPASS_AUTH` is not `true` in any beta/prod code path | ☐ | |
| 1.8 | Lint passes | `flutter analyze` produces zero errors (warnings acceptable if documented) | ☐ | Lint log: |
| 1.9 | TypeScript strict mode passes | `tsc --noEmit` in apps/api and apps/therapist-portal passes | ☐ | |

---

### Section 2: Automated Tests

| # | Item | Criteria | Status | Evidence |
|---|------|----------|--------|----------|
| 2.1 | Vitest backend suite passes | All tests green on latest commit | ☐ | Test report: |
| 2.2 | Rate limiter concurrency test passes | 20/20 runs pass | ☐ | Run log: |
| 2.3 | A8 router — all 4 gates tested | Each gate has a passing test case | ☐ | |
| 2.4 | JWT middleware — all 5 token cases covered | Valid, expired, malformed, missing, wrong signature | ☐ | |
| 2.5 | Flutter widget tests pass | Crisis screen (no network mocks), chat turn-cap, onboarding intake, voice toggle | ☐ | Test report: |
| 2.6 | Crisis screen widget test passes with no HTTP mocks | Confirmed test runs without mock HTTP client setup | ☐ | |
| 2.7 | Patrol E2E tests pass on real device | All 4 E2E tests (OTP login, onboarding, crisis offline, session cap) pass on a real mid-range Android device | ☐ | Test report: |
| 2.8 | Crisis offline E2E test in actual airplane mode | Confirmed test ran in airplane mode, not simulated offline | ☐ | Evidence: |
| 2.9 | E2E tests pass 3/3 consecutive runs | No flakes across 3 back-to-back runs | ☐ | |

---

### Section 3: Manual Testing

| # | Item | Criteria | Status | Evidence |
|---|------|----------|--------|----------|
| 3.1 | Smoke test passed | All 20 smoke test steps pass | ☐ | Smoke report: |
| 3.2 | Regression test passed | All 128 regression items pass; any failures documented and triaged | ☐ | Regression report: |
| 3.3 | HALT sign-off complete | All HALT-severity test cases run and recorded; no outstanding P0 failures | ☐ | HALT record: |
| 3.4 | A1 safety gate verified (true positive) | Explicit crisis message correctly classified as S4 | ☐ | Test case: |
| 3.5 | A1 safety gate verified (false positive avoidance) | Non-crisis distress message NOT classified as S4 | ☐ | Test case: |
| 3.6 | Crisis screen offline verified | Full crisis screen render and one-tap call in actual airplane mode on real device | ☐ | Evidence: |
| 3.7 | Rate limiter verified | Non-crisis user blocked from second daily session | ☐ | |
| 3.8 | Crisis bypass verified | S4 user can open session despite daily limit | ☐ | |
| 3.9 | Audio/voice toggle tested | TTS plays when ON, silent fallback when OFF or unavailable | ☐ | |
| 3.10 | Account deletion tested | Full deletion flow works, active session handled gracefully | ☐ | |
| 3.11 | Emergency contact encryption verified | Stored value inspected in DB — confirmed ciphertext, not plaintext | ☐ | DB query evidence: |

---

### Section 4: Performance & Load

| # | Item | Criteria | Status | Evidence |
|---|------|----------|--------|----------|
| 4.1 | p50 turn latency < 3s | Measured across 20+ turns at 50 concurrent WebSocket sessions | ☐ | Load test report: |
| 4.2 | Error rate < 0.1% at 50 concurrent WebSockets | Measured during load test | ☐ | |
| 4.3 | Cloud Run autoscaling verified | Instance count increase observed in Cloud Monitoring during load test | ☐ | Monitoring screenshot: |
| 4.4 | p50 < 2s in local testing | Versus local Neon, no concurrency | ☐ | |

---

### Section 5: Safety & Compliance

| # | Item | Criteria | Status | Evidence |
|---|------|----------|--------|----------|
| 5.1 | Crisis screen — zero network calls | Confirmed crisis screen renders entirely from local/hardcoded data | ☐ | Verified in airplane mode |
| 5.2 | Crisis screen — no dismiss at S4 | User cannot dismiss crisis screen when safety_state is S4 | ☐ | |
| 5.3 | A1 timeout — never silent fail | A1 timeout produces safe holding response, never silently defaults to S0 | ☐ | |
| 5.4 | S3 suppression — A2 grounding-only | S3-triggered A2 responses are grounding-focused, not exploratory | ☐ | |
| 5.5 | Emergency contact — AES-256-GCM | Confirmed via stored data inspection | ☐ | |
| 5.6 | Emergency contact — never logged in plaintext | Audited log statements — no plaintext in any log path | ☐ | |
| 5.7 | Therapist notes — not ingested by agents | Confirmed no agent reads therapist_notes table | ☐ | Code review evidence: |
| 5.8 | LOCAL_DEV_BYPASS_AUTH disabled in production | Confirmed NODE_ENV=production check exists and throws on startup | ☐ | |

---

### Section 6: Dogfooding & Beta Readiness

| # | Item | Criteria | Status | Evidence |
|---|------|----------|--------|----------|
| 6.1 | Internal dogfooding complete | 50+ sessions logged across 5 days, ≥1 per person per day | ☐ | Session log count: |
| 6.2 | All bugs logged with reproduction steps | Bug log reviewed — no entries missing reproduction steps | ☐ | Bug log link: |
| 6.3 | P0 bugs resolved | All P0 bugs from dogfooding resolved or triaged with documented deferral reason | ☐ | |
| 6.4 | P1 bugs documented | All P1 bugs have engineering decision (fix before beta or defer) | ☐ | |
| 6.5 | Therapist portal walkthrough completed | Each participating therapist completed a guided walkthrough of T-01/T-02/T-03/T-05 | ☐ | Walkthrough notes: |
| 6.6 | Therapist walkthrough feedback incorporated | Critical feedback from walkthroughs addressed before beta | ☐ | |
| 6.7 | Supervised beta accounts provisioned | Test accounts created for participating therapists and clients | ☐ | |
| 6.8 | Beta test plan documented | Test plan for TL-mode beta distributed to all participants | ☐ | |
| 6.9 | A1/crisis-screen P0 issues resolved | No unresolved P0 A1 or crisis-screen issues from any source | ☐ | |

---

### Section 7: Documentation

| # | Item | Criteria | Status | Evidence |
|---|------|----------|--------|----------|
| 7.1 | .env.example updated | Any new environment variables documented in .env.example | ☐ | |
| 7.2 | QA Test Cases updated | Any new test cases added for new features since last release | ☐ | |
| 7.3 | Release notes drafted | Release notes prepared for stakeholders | ☐ | Notes link: |
| 7.4 | Known issues documented | Any deferred bugs or known limitations documented in release notes | ☐ | |

---

### Section 8: Infrastructure & Deployment

| # | Item | Criteria | Status | Evidence |
|---|------|----------|--------|----------|
| 8.1 | evia-api deployed to Cloud Run | Latest build deployed and /health returns 200 | ☐ | Health check: |
| 8.2 | evia-worker deployed to Cloud Run | Worker service running and isolated from API | ☐ | |
| 8.3 | Database migration run | `prisma migrate deploy` executed successfully | ☐ | Migrate log: |
| 8.4 | Cloud Tasks queue configured | post-session-queue exists and accepts tasks | ☐ | |
| 8.5 | Cloud Scheduler job configured | Daily session_limits cleanup job scheduled at 02:00 IST | ☐ | |
| 8.6 | Secret Manager secrets in place | All 3 secrets (GOOGLE_APPLICATION_CREDENTIALS, SARVAM_API_KEY, DATABASE_URL) present | ☐ | |
| 8.7 | Load test run against deployed environment | Confirmed production-equivalent environment handles 50 concurrent sessions | ☐ | |

---

### Section 9: Rollback Plan

| # | Item | Criteria | Status |
|---|------|----------|--------|
| 9.1 | Previous build artifact available | Previous working APK and Cloud Run revision can be redeployed | ☐ |
| 9.2 | Database migration reversible | Last migration can be rolled back if needed | ☐ |
| 9.3 | Rollback procedure documented | Steps to revert this release documented in release notes | ☐ |
| 9.4 | Rollback tested | Rollback procedure verified in a dry run | ☐ |

---

### Section 10: Final Verdict

| Criteria | Met? |
|----------|------|
| All P0 and P1 automated tests pass | ☐ Yes / ☐ No |
| All HALT test cases pass and signed off | ☐ Yes / ☐ No |
| No outstanding P0 bugs | ☐ Yes / ☐ No |
| Crisis screen offline verified on real device | ☐ Yes / ☐ No |
| A1 safety gate verified (true positive + false positive avoidance) | ☐ Yes / ☐ No |
| Load test meets thresholds (p50 ≤ 3s, error rate < 0.1%) | ☐ Yes / ☐ No |
| Dogfooding completed with ≥ 50 sessions | ☐ Yes / ☐ No |
| Therapist portal walkthrough completed | ☐ Yes / ☐ No |
| Rollback plan documented and tested | ☐ Yes / ☐ No |

**Release Verdict:** ☐ **GO** / ☐ **NO-GO** / ☐ **GO with exceptions** (list below)

**Exceptions (if GO with exceptions):**
1.
2.
3.

---

### Sign-off

| Role | Name | Signature | Date | Decision |
|------|------|-----------|------|----------|
| Senior Engineer | | | | ☐ Approve / ☐ Reject |
| Lead Developer | | | | ☐ Approve / ☐ Reject |
| Product Lead | | | | ☐ Approve / ☐ Reject |
| QA Lead | | | | ☐ Approve / ☐ Reject |
| Release Engineer | | | | |

---

### Post-Release Checklist (Complete within 24 hours of release)

| # | Item | Status |
|---|------|--------|
| P1 | Monitor error rates in Cloud Monitoring for first 24 hours | ☐ |
| P2 | Confirm no unexpected error spike in first hour post-release | ☐ |
| P3 | Check session success rate > 95% on first day | ☐ |
| P4 | Review and respond to any beta user issues | ☐ |
| P5 | Update known issues document with any post-release discoveries | ☐ |
