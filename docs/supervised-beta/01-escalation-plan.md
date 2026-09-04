# Evia Supervised Beta (E13-S03) — Safety Escalation Plan

> **Mandatory reading for every participant before the supervised beta begins.**
> This document defines the escalation path for safety incidents. It is NOT a
> bug report flow. Any incident covered here is an immediate escalation to a
> named human, not a GitHub issue.
>
> Version: 1.0 · Owner: Beta coordinator · Applies to: evia-beta only

---

## 1. Incident categories and thresholds

### E1 — Client in active crisis during a session

- **Expected pathway:** A1 → A2 → S4 safety state → crisis screen with helpline call.
- **Escalate as P0 if:** the crisis screen does not render, the helpline call does not
  complete, or the safety classification clearly missed the client's distress.
- **Action:**
  1. Supervising therapist is reachable by phone during every scheduled session
     (contact list recorded in the participant roster).
  2. Coordinator calls the supervising therapist immediately.
  3. Therapist follows their own clinical protocol with the client.
  4. Do not route the client to a bot ticket or an async channel.
- **Recording:** log in the participant roster incident log with timestamp and outcome.

### E2 — A2 produces clinically inappropriate content

- **Definition:** any A2 turn that is clinically inappropriate, unsafe, or clearly
  off-target for the client's stated concern (requesting or encouraging harm,
  dismissing distress, fabricating a clinical instruction, etc.).
- **Action:**
  1. **Stop that pair's sessions immediately.** Do not run further sessions until cleared.
  2. Escalate **IMMEDIATELY (same day)** to the **Senior Engineer** and **Product PM**.
  3. Record the offending turn (session id, turn number, content quote) in the incident log.
- **Status:** this is a clinical safety concern, **not** a normal bug report.

### E3 — A1 safety-classification failure

- **False negative:** explicit self-harm statement not classified into a crisis state (S4).
- **False positive:** benign content classified as S4.
- **Action:** pause the affected pair. Escalate immediately to the Senior Engineer.
  A1 is the safety gate; any failure is a stop-ship condition for that participant.

### E4 — App crash / session failure / WebSocket drop / turn loss

- **Definition:** any failure that interrupts the core session flow (Check In → session →
  session close) for a participant.
- **Action (per NFR Reliability):** file a P0 GitHub issue with the mandatory bug fields
  (summary, environment/beta build, device, steps to reproduce, expected/actual,
  severity, screenshot/recording). The Senior Engineer fixes and redeploys to evia-beta
  **before further beta sessions run for the affected pair**.

---

## 2. Contact chain

Fill actual names before the beta begins. Coordinator owns this list.

| Role | Responsibility | Name | Contact |
|---|---|---|---|
| Beta coordinator | First call for all incidents; owns roster; decides pair-level pauses | — | — |
| Supervising therapist | On-call during their client's sessions (E1 clinical responsibility) | — | — |
| Senior Engineer | E2/E3/E4 technical + platform intervention; Neon + Cloud Run access | — | — |
| Lead Developer | Portal/mobile intervention; APK rebuilds | — | — |
| Product PM | Clinical-safety authority; co-owns E2 with Senior Engineer | — | — |

---

## 3. Manual intervention access

| Who | Access | What they can do |
|---|---|---|
| Senior Engineer | Neon DB (evia-beta), Cloud Run, GCP Error Reporting | Reset `SafetyState`, edit `clinical_configs`, end/delete stuck sessions, adjust `SessionLimit`, redeploy backend, review error metrics |
| Beta coordinator | Roster + communication channels | Directs every intervention; no direct DB access |
| Supervising therapist | No DB access | Intervention happens through the client and the coordinator |

- Every manual intervention must be recorded in the participant roster with timestamp,
  actor, reason, and outcome.
- Account-level interventions (e.g., removing a participant from a session) are performed
  by the Senior Engineer on explicit coordinator request.

---

## 4. Threshold for pausing the beta entirely

**Pause on ANY of:**

- an E1 incident that was mishandled (therapist or product unreachable, pathway failed);
- any E2 incident (A2 clinically inappropriate content);
- any E3 A1 false negative;
- an unresolved E4 P0 affecting the core session flow.

**Resume only when ALL of the following hold:**

1. Root cause identified and fixed;
2. Fix deployed to evia-beta and verified;
3. All participating pairs re-briefed on the change;
4. Coordinator sign-off recorded in the participant roster.

---

## 5. Incident log format

Record every incident in the participant roster's incident log:

```
Date/time (IST):
Pair (therapist — client):
Category (E1/E2/E3/E4):
Description:
Escalated to:
Action taken:
Outcome:
Resolved? (Y/N):
```