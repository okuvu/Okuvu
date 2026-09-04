# Evia Supervised Beta (E13-S03) — Informed Consent & Data Protection Gate

> **This gate must be satisfied BEFORE any client participant uses the product.**
> Version: 1.0 · Owner: Beta coordinator · Applies to: evia-beta only
>
> This is a human legal/clinical gate. The coordinator must complete it with
> legal/clinical review and record the sign-off below before onboarding starts.

---

## 1. Informed consent

Every client participant must give informed consent **before their first session**.
The consent brief is read aloud / shared in writing and a signed or recorded record is
kept (template at the end of this document).

### What is logged and reviewed

- Full session turn text exchanged with the AI agent (A2).
- Safety classifications produced by the safety agent (A1).
- Auto-generated session summaries (created after each session).
- Assigned care plan and its state (`provisional` → `confirmed`).
- Session metadata (timestamps, turn counts).
- Therapist-written session notes (T-05) and care-plan changes (T-03).

### Purpose

- Validate Evia in real supervised clinical use during the supervised beta.
- Let the supervising therapist review the client's sessions, summaries, and care plan.
- Generate real data the engineering and clinical teams review to finalize the product.

### How data is stored and protected

- evia-beta: GCP project `evia-500215`, PostgreSQL (Neon), backend on Cloud Run.
- Encryption in transit (TLS) for all API/WebSocket traffic.
- Emergency contact data encrypted at rest (AES-256-GCM) per product security rules.
- Therapist session notes are stored separately and are **never** ingested by any AI agent.

### Who has access

- The supervising therapist.
- The beta coordinator.
- Evia engineers (for instrumentation/monitoring and platform operations).
- Senior clinical reviewers handling safety escalations.

### Retention and withdrawal

- Participant data is retained while the supervised beta and MVP sign-off require it.
- A participant may **withdraw at any time**, for any reason, with no downside.
- Withdrawal process:
  1. Coordinator stops the participant's sessions and notifies the supervising therapist.
  2. Coordinator logs a data-deletion request in the participant roster.
  3. Senior Engineer deletes the participant's logged data (sessions, summaries,
     clinical config, notes) and records completion in the roster.

### Informed consent record template

```
Participant name:
Phone number:
Date:
I consent to Evia logging and reviewing my sessions, summaries, and care plan as
described above during the supervised beta. I understand I may withdraw at any time.
Consent given: □ Yes  □ No
Participant signature / confirmation:
Coordinator (witness) name + signature:
```

---

## 2. DPDP / data-handling confirmation (human gate)

Complete before onboarding. Each line requires sign-off (name + date).

| Check | Status | Sign-off |
|---|---|---|
| evia-beta data handling confirmed DPDP compliant by legal/clinical review | ☐ | name/date |
| `LOCAL_DEV_BYPASS_AUTH` is NOT `true` in evia-beta (Cloud Run env vars inspected) | ☐ | name/date |
| No participant email or phone number appears in any repository file or README | ☐ | name/date |
| Emergency-contact handling remains AES-256-GCM encrypted (no plaintext storage) | ☐ | name/date |
| Therapist session notes remain excluded from all agent context bundles | ☐ | name/date |
| Escalation plan (`01-escalation-plan.md`) reviewed and contacts filled | ☐ | name/date |

---

## 3. Consent tracking

Consent status per client participant is tracked in the participant roster
(`03-participant-roster.md`). No session may be scheduled for a client whose consent
row is not complete.