# EVIA Therapist Portal Bug Report Template

Adapted from `Bug_Report_Template.md` for the web-based therapist portal
(`apps/therapist-portal`). Use this when filing a portal bug in GitHub Issues.
Every field is required unless marked optional. Bugs without reproduction steps
will be returned to the author for clarification.

---

## Bug Report

### Summary

**Short, descriptive title** — e.g. "T-03: Care plan change shows success toast but assignment_state stays provisional"

---

### Environment

| Field | Value |
|-------|-------|
| **Build/Version** | (Git branch + commit, e.g. `story/PortalTesting` @ `a1b2c3d`) |
| **Browser** | (e.g. Chrome 126 / Firefox 127 / Edge 126) |
| **OS** | (e.g. Windows 11 / macOS 14 / Linux) |
| **Portal URL** | local (`http://localhost:3001`) / dev / beta |
| **Backend Environment** | local Neon branch / evia-beta |
| **Network Type** | WiFi / Wired / Mobile Data |
| **LOCAL_DEV_BYPASS_AUTH** | `false` / `true` (note if enabled — several procedures return mock data in bypass mode) |
| **Session ID** (if applicable) | |

---

### Priority & Severity

| Field | Options | Selected |
|-------|---------|----------|
| **Priority** | P0 (Release blocker) / P1 (Should fix before beta) / P2 (Nice to have) | |
| **Severity** | Critical / Major / Minor / Trivial | |
| **HALT** | Yes / No (Is this a HALT-level safety issue?) | |

**Priority definitions:**
- **P0**: Release blocker — broken auth/authorization, cross-therapist data exposure, notes ingested by an agent, care plan saved but not applied, critical path broken.
- **P1**: Major functional or UX issue — workaround exists but causes significant friction (wrong badge, missing empty state, save failure not communicated).
- **P2**: Cosmetic, enhancement, or low-impact edge case.

**Severity definitions:**
- **Critical**: Auth failure, data leak, care plan data corruption, critical-path break.
- **Major**: Feature unusable, wrong behavior, significant UX regression.
- **Minor**: Cosmetic issue, wrong label, misalignment, non-breaking edge case.
- **Trivial**: Typo, spacing, colour off by a shade.

---

### Description

**What were you doing?**

(Be specific. Include the exact screen, the exact action you took, and what happened before the bug.)

> Example: I was on the T-03 Care Plan screen (`/clients/[id]/program`) for client B. I changed the care plan from CP1 to CP2 and clicked "Save care plan". The success toast appeared.

---

**What did you expect to happen?**

> Example: The care plan should have updated to CP2 and the assignment state should have become Confirmed, reflected back on T-02.

---

**What actually happened?**

> Example: The toast said "✓ Care plan saved" but on T-02 the client still showed CP1 with a Provisional badge. Refreshing did not help.

---

### Reproduction Steps

(Must be numbered, unambiguous, and reproducible by another tester.)

1.
2.
3.
4.
5.

> Example:
> 1. Sign in to `http://localhost:3001` as `tester1@example.com` (seeded, `LOCAL_DEV_BYPASS_AUTH=false`).
> 2. Open the dashboard and click a client that is currently on CP1 (Provisional).
> 3. On T-02, click "Manage" to open `/clients/[id]/program`.
> 4. Select "Low Mood & Depression (CP2)" from the dropdown.
> 5. Click "Save care plan".
> 6. **Bug**: Success toast shows, but T-02 still shows CP1 / Provisional.

---

### Expected vs Actual (Technical)

| Aspect | Expected | Actual |
|--------|----------|--------|
| tRPC Procedure | `clients.setCarePlan` returns `{ success: true, carePlanId: "CP2", assignmentState: "confirmed" }` | (paste response) |
| HTTP Status Code | 200 | |
| Error Message | | |
| UI State | Success toast; dropdown reflects CP2; T-02 shows Confirmed | |
| DB State (via `clinicalConfig` row) | `care_plan_id=CP2`, `assignment_state=confirmed` | |

---

### Screenshots / Screen Recording

(Attach or link — highly recommended for UI bugs.)

- Screenshot(s):
- Screen recording:
- DevTools Console output (if error):

---

### Network Logs (if applicable)

```
[Paste the failed `/_trpc/...` request + response from the Browser Network tab,
 or `apps/therapist-portal` terminal output here]
```

---

### Steps Taken Already

(What have you tried to work around or diagnose the issue?)

- [ ] Hard-refreshed the page (Ctrl/Cmd + Shift + R)
- [ ] Signed out and signed back in
- [ ] Cleared browser cache / used an incognito window
- [ ] Tried a different browser
- [ ] Verified the DB state directly (`clinicalConfig`, `therapistNote`, `therapistClient`)
- [ ] Checked `apps/therapist-portal` terminal logs
- [ ] Reproduced more than once (if yes, how many times out of attempts?)

---

### Additional Context

| Field | Value |
|-------|-------|
| **First observed** | (date/time and timezone, e.g. 2026-08-02 14:30 IST) |
| **Frequency** | Every time / Intermittent (roughly X out of Y attempts) / Once |
| **Related Issue(s)** | (Link to related GitHub Issues, if any) |
| **Spec Reference** | (Which story does this relate to? e.g. E10-S05, E11-S03) |
| **Test Case ID** | (e.g. TP-013, R10.8 — from `docs/testing/QA_Test_Cases.md` or the portal runbook) |

---

### Bug Triage (For Engineering Team Use Only)

| Field | Value |
|-------|-------|
| **Triaged By** | |
| **Triage Date** | |
| **Triage Outcome** | Confirmed / Cannot Reproduce / Expected Behaviour / Deferred |
| **Assigned To** | |
| **Milestone** | MVP Beta / Post-MVP / Future |
| **Fix Branch** | |
| **Fix PR** | |
| **Fix Verified By** | |
| **Fix Verification Date** | |
| **Resolution** | Fixed / Won't Fix / Duplicate / Not Reproducible |
