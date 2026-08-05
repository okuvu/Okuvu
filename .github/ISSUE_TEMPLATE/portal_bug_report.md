---
name: Portal bug report
about: Something is broken or behaving incorrectly (therapist portal, web)
title: '[PORTAL BUG] '
labels: bug, portal
assignees: ''
---

## Summary

**Short, descriptive title** — e.g. "T-03: Care plan change shows success toast but assignment_state stays provisional"

---

## Environment

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

## Priority & Severity

- **Priority:** ☐ P0 (Release blocker) / ☐ P1 (Should fix before beta) / ☐ P2 (Nice to have)
- **Severity:** ☐ Critical / ☐ Major / ☐ Minor / ☐ Trivial
- **HALT:** ☐ Yes / ☐ No (Is this a HALT-level safety issue?)

---

## Description

**What were you doing?**

> (Be specific. Include the exact screen, the exact action you took, and what happened before the bug.)

**What did you expect to happen?**

> 

**What actually happened?**

> 

---

## Reproduction Steps

(Must be numbered, unambiguous, and reproducible by another tester.)

1.
2.
3.
4.
5.

---

## Expected vs Actual (Technical)

| Aspect | Expected | Actual |
|--------|----------|--------|
| tRPC Procedure | | |
| HTTP Status Code | | |
| Error Message | | |
| UI State | | |
| DB State (if applicable) | | |

---

## Screenshots / Screen Recording

- Screenshot(s):
- Screen recording:
- DevTools Console output (if error):

---

## Network Logs (if applicable)

```
[paste the failed /_trpc/... request + response from the Browser Network tab,
 or apps/therapist-portal terminal output here]
```

---

## Steps Taken Already

- [ ] Hard-refreshed the page (Ctrl/Cmd + Shift + R)
- [ ] Signed out and signed back in
- [ ] Cleared browser cache / used an incognito window
- [ ] Tried a different browser
- [ ] Verified the DB state directly (`clinicalConfig`, `therapistNote`, `therapistClient`)
- [ ] Checked `apps/therapist-portal` terminal logs
- [ ] Reproduced more than once (if yes, how many times out of attempts?)

---

## Additional Context

| Field | Value |
|-------|-------|
| **First observed** | (date/time and timezone) |
| **Frequency** | Every time / Intermittent (X out of Y) / Once |
| **Related Issue(s)** | |
| **Spec Reference** | (e.g. E10-S05, E11-S03) |
| **Test Case ID** | (e.g. TP-013, R10.8) |
| **TPT** | TPT-01 Functional / TPT-02 Smoke / TPT-03 Regression / TPT-04 UI-UX / TPT-05 Security / TPT-06 API-tRPC / TPT-07 Edge Cases |

---

## Bug Triage (For Engineering Team Use Only)

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
