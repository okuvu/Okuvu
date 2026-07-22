# EVIA Bug Report Template

Use this template when filing a bug in GitHub Issues. Every field is required unless marked optional. Bugs without reproduction steps will be returned to the author for clarification.

---

## Bug Report

### Summary

**Short, descriptive title** — e.g. "Crisis screen crashes when tapping Vandrevala helpline on Android 13"

---

### Environment

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

### Priority & Severity

| Field | Options | Selected |
|-------|---------|----------|
| **Priority** | P0 (Must fix before beta) / P1 (Fix if time allows) / P2 (Nice to have) | |
| **Severity** | Critical / Major / Minor / Trivial | |
| **HALT** | Yes / No (Is this a HALT-level safety issue?) | |

**Priority definitions:**
- **P0**: Release blocker — crash, data loss, safety failure, broken critical path. Must be fixed before any build can ship.
- **P1**: Major functional or UX issue — workaround exists but causes significant friction. Should fix before beta if time permits.
- **P2**: Cosmetic, enhancement, or low-impact edge case. Track for future sprints.

**Severity definitions:**
- **Critical**: App crash, data corruption, safety system failure, non-functional crisis screen, broken auth.
- **Major**: Feature unusable, wrong behavior, significant UX regression, rate limiter wrong.
- **Minor**: Cosmetic issue, wrong label, minor misalignment, non-breaking edge case.
- **Trivial**: Typo, spacing, colour off by a shade, suggestions.

---

### Description

**What were you doing?**

(Be specific. Include the exact screen, the exact action you took, and what happened before the bug.)

> Example: I was on the Chat Screen after sending 3 messages. I tapped "End Session" in the top-right menu. The session did not close. I waited 30 seconds and nothing happened. I force-closed the app.

---

**What did you expect to happen?**

> Example: The session should have closed immediately, the SRS modal should have appeared, and I should have been returned to the Home Screen.

---

**What actually happened?**

> Example: The session remained open. The "End Session" button appeared to be tapped (touch feedback played) but no SESSION_CLOSED frame was sent. The app stayed on the Chat Screen with the input field still active. After 15 minutes, the idle timeout did close the session, but the A10A summary was never generated.

---

### Reproduction Steps

(Must be numbered, unambiguous, and reproducible by another tester.)

1.
2.
3.
4.
5.

> Example:
> 1. Launch app on Pixel 6a (Android 13), beta flavor.
> 2. Log in with test phone +91-9999999999.
> 3. Complete consent and 3-turn onboarding.
> 4. On Home Screen, tap Check In.
> 5. Send 3 messages (normal conversation, not crisis).
> 6. Tap the three-dot menu in top-right corner.
> 7. Tap "End Session".
> 8. **Bug**: Nothing happens. Session remains open.

---

### Expected vs Actual (Technical)

| Aspect | Expected | Actual |
|--------|----------|--------|
| HTTP Status Code (if API) | | |
| WebSocket Frame | SESSION_CLOSED received | No frame received |
| Error Message | | |
| UI State | Input disabled, modal visible | Input still active, no modal |

---

### Screenshots / Screen Recording

(Attach or link — highly recommended for UI bugs.)

- Screenshot(s):
- Screen recording:
- Logcat output (if crash):

---

### Network Logs (if applicable)

```
[Paste relevant dio interceptor logs, WebSocket frame logs, or backend request logs here]
```

---

### Steps Taken Already

(What have you tried to work around or diagnose the issue?)

- [ ] Cleared app cache
- [ ] Reinstalled app
- [ ] Switched network (WiFi → mobile data)
- [ ] Tried on a different device
- [ ] Checked backend logs
- [ ] Reproduced more than once (if yes, how many times out of attempts?)

---

### Additional Context

| Field | Value |
|-------|-------|
| **First observed** | (date/time and timezone, e.g. 2026-07-20 14:30 IST) |
| **Frequency** | Every time / Intermittent (roughly X out of Y attempts) / Once |
| **Related Issue(s)** | (Link to related GitHub Issues, if any) |
| **Spec Reference** | (Which sprint spec / story does this relate to? e.g. E4-S03, E6-S02) |

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
