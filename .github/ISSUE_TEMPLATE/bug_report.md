---
name: Bug report
about: Something is broken or behaving incorrectly (EVIA mobile app)
title: '[BUG] '
labels: bug
assignees: ''
---

## Summary

**Short, descriptive title** — e.g. "Crisis screen crashes when tapping Vandrevala helpline on Android 13"

---

## Environment

| Field | Value |
|-------|-------|
| **Build/Version** | (from splash screen or Settings → About) |
| **Device Model** | (e.g. Pixel 6a, Samsung Galaxy M32) |
| **Android Version** | (e.g. Android 13, API 33) |
| **App Flavor** | dev / beta |
| **Backend Environment** | local / evia-beta |
| **Network Type** | WiFi / Mobile Data / Airplane Mode |
| **App Install Type** | Fresh install / Upgrade from previous version |
| **Session ID** (if applicable) | |

---

## Priority & Severity

- **Priority:** ☐ P0 (Must fix before beta) / ☐ P1 (Fix if time allows) / ☐ P2 (Nice to have)
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
| HTTP Status Code (if API) | | |
| WebSocket Frame | | |
| Error Message | | |
| UI State | | |

---

## Screenshots / Screen Recording

- Screenshot(s):
- Screen recording:
- Logcat output (if crash):

---

## Network Logs (if applicable)

```
[paste relevant dio interceptor logs, WebSocket frame logs, or backend request logs here]
```

---

## Steps Taken Already

- [ ] Cleared app cache
- [ ] Reinstalled app
- [ ] Switched network (WiFi → mobile data)
- [ ] Tried on a different device
- [ ] Checked backend logs
- [ ] Reproduced more than once (if yes, how many times out of attempts?)

---

## Additional Context

| Field | Value |
|-------|-------|
| **First observed** | (date/time and timezone) |
| **Frequency** | Every time / Intermittent (X out of Y) / Once |
| **Related Issue(s)** | |
| **Spec Reference** | (e.g. E4-S03, E6-S02) |
| **Test Case ID** | (e.g. CHAT-007, R6.5) |

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
