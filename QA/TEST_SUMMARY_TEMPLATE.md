# Evia Therapist Portal — Test Summary Template

**How to use:** Fill this in at the end of each test cycle (per sprint / per release / before E12-S05 sign-off and E13-S01 dogfooding week). Copy and complete, replacing placeholders. This is the single source the Lead Developer and Senior Engineer use to assess readiness.

```markdown
# Test Summary — Evia Therapist Portal

## 1. Header

- **Build under test:** <branch> @ <commit or build id>
- **Environment:** <staging / local / prod-like> · Portal URL <url> · API URL <url>
- **Database:** <seed state, e.g. "2 therapists, 3 clients, 1 FAILED summary fixture">
- **Test window:** <start date> → <end date>
- **Tester(s):** <names>
- **Test basis:** TEST_PLAN.md, sprint spec (Sprint 3 E10/E11, Sprint 4 E12/E13)

## 2. Scope

- **In scope:** T-00 login/allowlist, T-01 dashboard, T-02 client overview, T-03 care-plan, T-05 session notes; tRPC API; security; edge cases.
- **Out of scope:** <e.g. mobile app, A2 agent, Fastify API routes>
- **Defect fixes verified this cycle:** <list of fixed issue IDs>

## 3. Results summary

| Test suite | Total | Passed | Failed | Blocked | Not executed | Pass % |
|---|---|---|---|---|---|---|
| Functional (TEST_CASES.md) | | | | | | |
| API (API_TEST_CASES.md) | | | | | | |
| Security (SECURITY_TEST_CASES.md) | | | | | | |
| UI / a11y / responsive (UI_TEST_CASES.md) | | | | | | |
| Edge (EDGE_CASES.md) | | | | | | |
| Smoke (SMOKE_TESTS.md) | | | | | | |
| Regression (REGRESSION_TESTS.md) | | | | | | |
| **Total** | | | | | | |

## 4. Test case detail

### 4.1 Functional
| ID | Title | Result | Bug ID / Notes |
|---|---|---|---|
| F-AUTH-001 | … | PASS / FAIL / BLOCKED | |
| … | | | |

### 4.2 API
| ID | Procedure | Result | Notes |
|---|---|---|---|
| API-001 | example.health | | |
| … | | | |

### 4.3 Security
| ID | Title | Result | Notes |
|---|---|---|---|
| SEC-001 | … | | |
| … | | | |

### 4.4 UI / a11y / responsive
*(same table shape as above, UI-001…)*

### 4.5 Edge cases
*(same table shape as above, EDGE-001…)*

## 5. Bugs found

| Bug ID | Title | Severity | Priority | Status (Open/Fixed/Verified/Deferred) | Linked issue |
|---|---|---|---|---|---|
| BUG-C-1 | T-02 crash on FAILED/SKIPPED_TRIVIAL | Critical | P0 | | |
| … | | | | | |

**Open P0/P1:** <list>
**Deferred with rationale:** <list>

## 6. Known risks / remaining issues

- <e.g. BUG-C-1 not yet reproduced on device; BUG-C-5 audit-trail scope awaiting PM decision>

## 7. Environment & data notes

- **Data prep used:** seed-therapist.ts, fixtures, cross-therapist accounts — see TEST_PLAN.md "Data preparation".
- **Bypass mode caveats:** when `LOCAL_DEV_BYPASS_AUTH=true`, dashboard is empty (BUG-C-3) and Session Notes are unusable (BUG-C-2) — run notes tests with real auth or a seeded therapist.
- **Flaky tests:** <list with links to repro>

## 8. Sign-off

**Ready for release / beta / E12-S05 HALT review?** <YES / NO — conditions below>

| Gate | Condition | Status |
|---|---|---|
| All P0 fixed & verified | no open P0 | ☐ / ☐ |
| All P1 fixed or explicitly deferred with plan | | ☐ / ☐ |
| SEC-013 (bypass guard) & SEC-010 (notes isolation) verified | | ☐ / ☐ |
| Regression suite green | | ☐ / ☐ |
| Accessibility minimum met (UI-007…UI-012) | | ☐ / ☐ |

**Sign-off by:** <QA Lead / Lead Developer / Senior Engineer>
**Date:** <date>
```

---

## Notes for the person filling this in

- Pass % = Passed ÷ (Passed + Failed + Blocked + Not executed) — record **Blocked** separately so blockers stay visible.
- Every FAIL must reference a bug ID from the GitHub Issues log (E13-S01 rule: repro steps mandatory).
- Re-run the **Smoke suite** last and include it in the summary — it is the "did we break anything" check on the build that was actually tested.
- For E13-S01 dogfooding: fill the bug table from the dogfooding issue log (≥1 session/person/day; all bugs have repro steps).
