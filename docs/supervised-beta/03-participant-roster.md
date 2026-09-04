# Evia Supervised Beta (E13-S03) — Participant Roster

> Live tracker owned by the beta coordinator. Updated after every session and incident.
> Version: 1.0 · Status: ⬜ not started / 🟡 in progress / 🟢 complete

## 1. Escalation contacts (transcribe from `01-escalation-plan.md`)

| Role | Name | Contact |
|---|---|---|
| Beta coordinator | | |
| Senior Engineer | | |
| Lead Developer | | |
| Product PM | | |

## 2. Data-protection sign-off (transcribe from `02-consent-and-data-protection.md`)

| Check | Status | Signed-off by / date |
|---|---|---|
| DPDP compliance confirmed | ☐ | |
| `LOCAL_DEV_BYPASS_AUTH` false on evia-beta | ☐ | |
| No participant contacts in repo | ☐ | |
| Escalation contacts above are complete | ☐ | |

## 3. Therapist–client pairs

Use one row per client participant. Consensus: min 15 real sessions total across rows;
each therapist supervises 2–3 clients; each client runs 2–3 sessions.

| # | Therapist email | Clearance (beta-clearance-checklist) | Client name | Client phone | Client user_id | Consent (from §2 doc) | Paired via seed script | Sessions planned | Sessions done (turn_count>0) | T-03 used | T-05 used | Feedback submitted | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | ☐ | | | | ☐ | ☐ | | | ☐ | ☐ | ☐ | |
| 2 | | ☐ | | | | ☐ | ☐ | | | ☐ | ☐ | ☐ | |
| … | | ☐ | | | | ☐ | ☐ | | | ☐ | ☐ | ☐ | |

**Targets recap:** ≥15 real sessions · ≥1 confirmed T-03 change · ≥1 T-05 note ·
therapist feedback from all participating therapists.

## 4. Session schedule

| Date (IST) | Time | Pair (#) | Client flow completed (Check In → session → close) | Therapist reviewed on T-02 | Session id (from session_logs) |
|---|---|---|---|---|---|
| | | | ☐ | ☐ | |

## 5. Incident log (format per `01-escalation-plan.md`)

| Date/time (IST) | Pair | Category (E1/E2/E3/E4) | Description | Escalated to | Action taken | Outcome | Resolved? |
|---|---|---|---|---|---|---|---|
| | | | | | | | ☐ |

## 6. Monitoring log (Senior Engineer, daily)

| Date | Error rate / 5xx | Latency p50 | WS failures | Actions | Sign-off |
|---|---|---|---|---|---|
| | | | | | |

## 7. Acceptance criteria tracker

- [ ] ≥15 real supervised sessions (verified via `05-verification-queries.sql` Q1)
- [ ] ≥1 T-03 care-plan change confirmed in `clinical_configs` (Q3)
- [ ] ≥1 T-05 session note on a real case (Q4)
- [ ] Therapist feedback collected from all participating therapists
- [ ] No unresolved safety incidents