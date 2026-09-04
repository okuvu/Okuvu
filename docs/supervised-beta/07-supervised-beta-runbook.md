# Evia Supervised Beta (E13-S03) — Operations Runbook

> This runbook chains together the supervised-beta instrument files into one
> executable sequence. It is the single playbook the **beta coordinator** follows
> from pre-beta readiness through live sessions, safety monitoring, feedback, and
> closeout.
>
> Version: 1.0 · Owner: Beta coordinator · Applies to: evia-beta only

## How to use this document

Each phase below maps to one or more instrument files in this directory and, where
relevant, an existing seed script in `apps/therapist-portal`. Complete the phases in
order. Phases 0–3 are live operations; Phase 4 (closeout/verification) may only be
finalised **after** real sessions exist — never fill it from fabricated data.

### Instrument index

| # | File | Purpose | Used in phase |
|---|---|---|---|
| 01 | `01-escalation-plan.md` | Safety escalation path, contacts, pause thresholds | 0, 2 |
| 02 | `02-consent-and-data-protection.md` | Informed consent + DPDP gate | 0 |
| 03 | `03-participant-roster.md` | Live tracker: pairs, schedule, incidents, monitoring, acceptance | 0, 1, 2, 4 |
| 04 | `04-feedback-forms.md` | Therapist (mandatory) + client (optional) feedback forms | 0, 3 |
| 05 | `05-verification-queries.sql` | Acceptance verification SQL (run at closeout) | 4 |
| 06 | `06-completion-report.md` | Final completion report + sign-off | 4 |
| 07 | this file | The runbook you are reading | all |

### Script index

| # | Script | Purpose | Used in phase |
|---|---|---|---|
| S1 | `apps/therapist-portal/src/scripts/seed-therapists-batch.ts` | Add therapist emails to the `Therapist` allowlist | 0 |
| S2 | `apps/therapist-portal/src/scripts/seed-client-assignments.ts` | Create therapist↔client pairings in `TherapistClient` | 0 |

---

## Phase 0 — Pre-beta readiness

Executable before any session runs. All items must be complete before the Go/No-Go.

### 0.1 Data-protection gate (`02` §2)

Confirm and sign off every line, with names + dates, in `02-consent-and-data-protection.md` §2:

- [ ] evia-beta data handling confirmed **DPDP compliant** by legal/clinical review
- [ ] `LOCAL_DEV_BYPASS_AUTH` is **NOT** `true` in evia-beta (inspect Cloud Run env vars)
- [ ] No participant email/phone number appears in any repository file or README
- [ ] Emergency-contact handling remains **AES-256-GCM encrypted** (no plaintext storage)
- [ ] Therapist session notes remain **excluded from all agent context bundles**
- [ ] Escalation plan (`01`) reviewed and contacts filled (see 0.2)

### 0.2 Escalation contacts (`01` §2)

Fill real names and contacts in `01-escalation-plan.md` §2 for:

- [ ] Beta coordinator (first call for all incidents; owns roster)
- [ ] Supervising therapist (on-call during their client's sessions — E1 clinical responsibility)
- [ ] Senior Engineer (E2/E3/E4 technical + platform intervention)
- [ ] Lead Developer (portal/mobile intervention; APK rebuilds)
- [ ] Product PM (clinical-safety authority; co-owns E2)

Transcribe these into `03-participant-roster.md` §1.

### 0.3 Recruitment + informed consent (`02` §1)

- [ ] Recruit 5–10 therapists, each taking on 2–3 client participants
- [ ] Recruit the corresponding clients (each runs 2–3 sessions)
- [ ] Collect signed/recorded **informed consent** for **every** client **before** their first
      session, using the template at the end of `02` §1
- [ ] No session may be scheduled for a client whose consent row is not complete

### 0.4 Feedback forms (`04`)

- [ ] Create the **therapist** Google Form from the question set in `04` §1 (verbatim
      questions; ratings 1–5)
- [ ] Create the **client** Google Form from `04` §2
- [ ] Paste both links into `04` where indicated
- [ ] Note: the therapist form is **mandatory** for every participating therapist; the
      client form is optional

### 0.5 Itinerary scripts S1 (therapist seed)

From `apps/therapist-portal`:

```bash
cd apps/therapist-portal
npx tsx src/scripts/seed-therapists-batch.ts \
  therapist1@example.com \
  therapist2@example.com \
  therapist3@example.com
```

- [ ] Every participating therapist email is seeded in the `Therapist` table
- [ ] Each therapist can sign in successfully with their authorized account
      (Google OAuth primary, phone OTP fallback — see `therapist-seed-guide.md`)

### 0.6 Itinerary script S2 (client pairing)

From `apps/therapist-portal`, one argument per therapist, comma-separated client user ids:

```bash
npx tsx src/scripts/seed-client-assignments.ts \
  therapist1@example.com=clientUserIdA,clientUserIdB \
  therapist2@example.com=clientUserIdC,clientUserIdD,clientUserIdE
```

- [ ] Each therapist has 2–3 clients paired via `TherapistClient`
- [ ] Pairing count planned to meet the ≥15-session target (2–3 sessions × enough pairs)

### 0.7 Therapist clearance (E13-S02 prerequisite)

For each therapist, complete `docs/therapist-onboarding/beta-clearance-checklist.md`:

- [ ] Account & access checks
- [ ] Full walkthrough attendance (T-01, T-02, T-03, T-05) and notes recorded
- [ ] Concept understanding (provisional vs confirmed, `reasoning_note`, notes-not-read-by-AI)
- [ ] Unaided navigation task
- [ ] Final clearance checked and **Cleared for supervised beta (E13-S03)**

### 0.8 Populate the participant roster (`03`)

- [ ] §1 escalation contacts (transcribed from 0.2)
- [ ] §2 data-protection sign-offs (transcribed from 0.1)
- [ ] §3 therapist–client pairs with planned session counts and consent checked
- [ ] §4 initial session schedule (dates, times, pairs)

### 0.9 Go / No-Go

- [ ] **Go decision** recorded in the roster after 0.1–0.8 all pass
- [ ] If any gate (consent, clearance, DPDP, contacts) is incomplete → **No-Go**: do
      not start sessions until the blocking item is resolved

---

## Phase 1 — Run the beta

Coordinator-led, day to day. Use the session schedule in roster §4.

### 1.1 Client session flow

For each scheduled client session, the client completes:

1. Login
2. Home
3. **Check In**
4. Real session with **A2**
5. Session close
6. Home (optionally a post-session mood check-in)

### 1.2 Therapist supervision

- [ ] After each client session, the supervising therapist reviews the client on **T-02**
      (session summary + safety indicator + `reasoning_note`)
- [ ] Over the beta, ensure **at least one** therapist uses **T-03** to change a client's care
      plan (`provisional` → `confirmed`) on a real case
- [ ] Ensure **at least one** therapist uses **T-05** to write a session note on a real case

### 1.3 Session logging

- [ ] Log every completed session (session id, `turn_count > 0`) in roster §4 schedule rows
- [ ] Sessions are flagged as supervised-beta by membership in a `TherapistClient` pair
      (there is no dedicated flag column — see `05`)

---

## Phase 2 — Safety monitoring & escalation

### 2.1 Daily monitoring (Senior Engineer)

- [ ] Each day, record in roster §6: error rate / 5xx, latency p50, WS failures, actions
- [ ] During the supervised beta, the Senior Engineer monitors evia-beta error rates daily

### 2.2 Incident handling (`01`)

Use `01` verbatim. Any incident is an **immediate escalation to a named human**, not a
normal bug report. Categories:

- **E1** — client in active crisis during a session
  - Supervising therapist is reachable by phone during every scheduled session; coordinator
    calls them immediately; therapist follows their own clinical protocol. Log in roster §5.
- **E2** — A2 produces clinically inappropriate content
  - **Stop that pair's sessions immediately.** Escalate **IMMEDIATELY (same day)** to Senior
    Engineer + Product PM. Record the offending turn. This is a clinical safety concern, not a bug.
- **E3** — A1 safety-classification failure (false negative/positive)
  - Pause the affected pair; escalate to Senior Engineer. A1 is the safety gate; any failure
    is a stop-ship condition for that participant.
- **E4** — app crash / session failure / WS drop / turn loss
  - File a **P0** GitHub issue with the mandatory bug fields; Senior Engineer fixes and
    redeploys to evia-beta **before** further beta sessions run for the affected pair.

### 2.3 Pause / resume (`01` §4)

- **Pause the beta entirely on ANY of:** an E1 that was mishandled; any E2; any E3 false
  negative; an unresolved E4 P0 affecting the core session flow.
- **Resume only when ALL hold:** root cause identified and fixed; fix deployed to evia-beta
  and verified; all participating pairs re-briefed; coordinator sign-off recorded in roster §5.

### 2.4 Incident log

- [ ] Record every incident in roster §5 using the format from `01` §5
- [ ] Record every manual intervention in roster §5 (timestamp, actor, reason, outcome)

---

## Phase 3 — Feedback collection

- [ ] Collect the **therapist** feedback form from **every** participating therapist
      (mandatory; confirm coverage in roster §3)
- [ ] Collect **client** feedback forms opportunistically
- [ ] A2 content quality comments feed **E13-S04** triage; anything clinically inappropriate
      was an **E2** escalation already handled in Phase 2, not a normal bug report

---

## Phase 4 — Closeout & verification

**Only finalise after real sessions exist.** Do not fabricate results.

### 4.1 Run acceptance verification (`05`)

Edit `beta_start` in `docs/supervised-beta/05-verification-queries.sql` to the first day of
the beta period (IST), then run against evia-beta (project `evia-500215`, Neon):

```bash
psql "DATABASE_URL" -f docs/supervised-beta/05-verification-queries.sql
```

Capture results for:

- **Q1** — total beta sessions (acceptance: ≥ 15)
- **Q2** — sessions per pair (planning / debugging view)
- **Q3** — T-03 confirmed care-plan changes (acceptance: ≥ 1)
  - QA edge case: confirm `assignment_state = 'confirmed'` directly in `clinical_configs`
- **Q4** — T-05 session notes on paired clients (acceptance: ≥ 1)
- **Q5** — session-summary generation status (any PENDING/FAILED → forward to E13-S04)

### 4.2 Reconcile acceptance criteria (roster §7)

- [ ] ≥15 real supervised sessions (Q1)
- [ ] ≥1 T-03 care-plan change confirmed in `clinical_configs` (Q3)
- [ ] ≥1 T-05 session note on a real case (Q4)
- [ ] Therapist feedback collected from all participating therapists
- [ ] No unresolved safety incidents

### 4.3 Fill the completion report (`06`)

- [ ] Fill every section of `06-completion-report.md` from the Q1–Q5 results, the feedback
      summary (`04` §3), and the incidents table (roster §5)
- [ ] Get sign-off from Beta coordinator, Senior Engineer, Product PM (`06` §7)

### 4.4 Route post-beta findings

- [ ] Bugs / UX issues / session-latency observations discovered during the beta are logged
      to **E13-S04** (bug fixes following the supervised beta)
- [ ] Anything clinically inappropriate was already escalated as an E2, not logged as a normal bug

---

## Definition of Done (all must hold)

- [ ] ≥15 real supervised sessions logged
- [ ] ≥1 T-03 care-plan change on a real case (verified in `clinical_configs`)
- [ ] ≥1 T-05 session note written on a real case
- [ ] Structured therapist feedback collected from **all** participating therapists
- [ ] No unresolved safety incidents from the supervised beta
