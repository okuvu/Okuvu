# ADR-012: Test Harness Config Drift Monitoring

**Status:** Accepted
**Date:** 2026-08-19
**Driver:** TH-S01 — Test Harness Implementation Plan §12 Open Question 3

---

## Context

The Test Harness pins model configurations (model version, temperature, prompt hash) per environment via `ModelConfigPin` (TH-S08). Over time, the pinned configuration in sandbox/staging may diverge from the production configuration. The question is how to alert stakeholders when config drift occurs between environments.

Options considered:

1. **Full alerting infrastructure** — Cloud Monitoring alerts, Slack/PagerDuty integration, automated drift detection jobs.
2. **Read-only config drift warning banner** — compare pinned config against prod config on the TH-01 Dashboard and show a warning when they differ.
3. **No monitoring** — rely on manual PI review during gate sign-off.

## Decision

Defer alerting infrastructure. TH-01 Dashboard shows a read-only "config drift" warning banner only.

The dashboard compares the latest `ModelConfigPin` for each environment against the current production `GEMINI_PRO_MODEL` and temperature defaults. When the pinned config in staging differs from production, a non-blocking amber banner appears on the Dashboard: "⚠️ Config drift detected: Staging model config differs from production."

No automated alerts, no Slack integration, no Cloud Monitoring jobs.

## Alternatives Considered

### Full alerting infrastructure (Cloud Monitoring + Slack)
- Would provide real-time notification when config drifts.
- Requires Cloud Monitoring alerting policies, Slack webhook integration, and a drift-detection cron job.
- Overkill for a 32-story implementation plan with 3 environments; the harness is still in active development and configs change frequently.
- Defer to post-MVP when the harness stabilizes and the ethics committee review (TH-S31) is complete.

### No monitoring
- Zero effort, but config drift between staging and prod could go unnoticed until PI gate sign-off.
- Reject: the Dashboard already queries `ModelConfigPin` — adding a comparison is trivial.

## Consequences

**Positive:**
- Minimal implementation effort — one comparison query on the Dashboard.
- No infrastructure overhead (no Cloud Monitoring policies, no Slack webhooks).
- Config drift is visible to PI/raters/engineers every time they visit the Dashboard.
- Non-blocking — does not prevent sign-off or test execution.

**Negative:**
- No automated alerting — drift is only noticed when someone visits the Dashboard.
- Banner can be ignored — no enforcement mechanism.

**Risks:**
- Config drift in production-adjacent environments could cause misleading test results — mitigated by the banner being prominently placed on the Dashboard (TH-06) and by the PI gate sign-off process requiring review of config state.
