# Evia Supervised Beta (E13-S03) — Completion Report

> To be filled by the beta coordinator when the supervised beta period ends.
> All sections must be completed before the story is considered done; the
> acceptance-criteria checklist at the bottom is the Definition of Done.
> Version: 1.0 template

## 1. Summary

- Beta start date (IST):
- Beta end date (IST):
- Therapists participating (count / names):
- Client participants (count):
- Total real supervised sessions:

## 2. Verification evidence (from `05-verification-queries.sql`)

### Query 1 — total real sessions (acceptance: ≥ 15)

```
(paste result)
```

### Query 2 — sessions per pair

```
(paste result)
```

### Query 3 — T-03 confirmed care-plan changes (acceptance: ≥ 1)

```
(paste result)
```

Screenshot of T-02 confirmed badge (attach link):

### Query 4 — T-05 session notes (acceptance: ≥ 1)

```
(paste result)
```

Screenshot of the T-05 note (attach link):

### Query 5 — session summary generation status

```
(paste result)
```

Any PENDING/FAILED summaries are forwarded to E13-S04.

## 3. Feedback

Therapist feedback submissions: __ / __ participating therapists (must equal total).
Summary of themes (portal usability, A2 content observations, safety concerns, proposed changes):
- Portal usability: (summarize)
- A2 content quality observations: (summarize)
- Safety concerns raised: (summarize)
- What would change: (summarize)

Client feedback (optional): (summarize)

## 4. Incidents

Incidents logged (from roster §5): __

| Category | Count | All resolved? |
|---|---|---|
| E1 crisis | | ☐ |
| E2 inappropriate A2 content | | ☐ |
| E3 A1 classification failure | | ☐ |
| E4 crash/session failure | | ☐ |

## 5. Data-protection sign-off

Recap the sign-offs recorded in `02-consent-and-data-protection.md` (names + dates).

## 6. Acceptance criteria (Definition of Done)

- [ ] ≥15 real supervised sessions logged (Query 1 ≥ 15)
- [ ] ≥1 therapist used T-03 to change a care plan on a real case (Query 3 non-empty;
      `assignment_state` = confirmed in `clinical_configs`)
- [ ] ≥1 therapist used T-05 to write a session note on a real case (Query 4 non-empty)
- [ ] Structured feedback collected from all participating therapists
- [ ] No unresolved safety incidents

## 7. Sign-off

| Role | Name | Date |
|---|---|---|
| Beta coordinator | | |
| Senior Engineer | | |
| Product PM | | |