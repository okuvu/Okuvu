# EVIA Smoke Test Checklist

## Critical-Path Smoke Test — 10–15 Minutes

| | |
|---|---|
| **Application** | EVIA Mobile Application (Android) |
| **Estimated Duration** | 10–15 minutes |
| **Frequency** | Every deployment, before demos, after configuration changes |
| **Environment** | evia-beta (or local dev with bypass) |
| **Requires** | A test phone number that can receive OTP, network connectivity |

---

### Purpose

Verify the absolute minimum critical path is functional. This is **not** a comprehensive regression — it is a fast check that the app starts, a user can complete a basic session, and the crisis safety net is intact. Run this before any demo, release, or after any deployment.

---

### Pre-flight Checks (1 minute)

| # | Check | Pass/Fail |
|---|-------|-----------|
| S1 | Backend responds: `curl https://[evia-beta-url]/health` returns 200 | ☐ |
| S2 | App launches on test device without crash | ☐ |
| S3 | Version/build number visible on splash or settings screen | ☐ |

---

### Critical Path — Happy Flow (5–7 minutes)

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| S4 | Launch app → enter test phone number → tap "Send OTP" | OTP sent successfully | ☐ |
| S5 | Enter correct OTP → tap "Verify OTP" | Navigates to Consent Screen | ☐ |
| S6 | Verify 4 consent items visible, item 1 pre-checked and non-uncheckable | Items all visible, item 1 locked | ☐ |
| S7 | Check items 2–4 optionally → tap Continue | POST /users/me/consent called, navigates to intake | ☐ |
| S8 | Observe A2 opening message on intake screen | Opening message visible immediately | ☐ |
| S9 | Send a chat message → observe A2 reply | AGENT_TURN received, response rendered | ☐ |
| S10 | Send 2 more messages (3 turns total) → observe auto-navigation to Home Screen | Home Screen loads after 3rd AGENT_TURN | ☐ |
| S11 | Tap Check In on Home Screen | Chat session opens, SESSION_OPEN_CONFIRMED received | ☐ |
| S12 | Send a message → observe reply | Full turn pipeline works | ☐ |
| S13 | Complete 10 turns → observe SRS modal | Session closes at 10 turns, SRS modal appears | ☐ |
| S14 | Dismiss SRS modal → verify landing on Home Screen | Home Screen is the landing destination | ☐ |

---

### Crisis Safety Net (2–3 minutes)

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| S15 | Send an explicit crisis message (e.g. "I want to harm myself") | A1 classifies S4, crisis screen triggered | ☐ |
| S16 | Verify crisis screen renders all 5 resources (iCall, Vandrevala, NIMHANS, Snehi, 112) | All 5 resources visible with phone numbers | ☐ |
| S17 | Verify no dismiss option on crisis screen | User cannot dismiss the screen | ☐ |
| S18 | Enable airplane mode → tap a resource | Phone dialer launches (or system prompt appears) | ☐ |

---

### Rate Limiter (1 minute)

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| S19 | From Home Screen, tap Check In again immediately after a session | Rate limit rejection with clear "come back tomorrow" message | ☐ |

---

### Settings Check (30 seconds)

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| S20 | Navigate to Settings → verify voice toggle, emergency contact, account deletion entries visible | All 3 entries present | ☐ |

---

### Results

| Item | Count |
|------|-------|
| **Total Steps** | 20 |
| **Passed** | |
| **Failed** | |
| **Not Tested** | |

---

### Verdict

| Decision | Criteria | Check |
|----------|----------|-------|
| **PASS** | All P0 steps (S1–S17) pass; no step above S17 has a critical (blocking) failure | ☐ |
| **FAIL** | Any P0 step fails — do not proceed with demo/release | ☐ |

---

### Tester Information

| Field | Value |
|-------|-------|
| **Tester Name** | |
| **Date** | |
| **Build/Version** | |
| **Device Model** | |
| **Android Version** | |
| **Backend URL** | |
| **Notes** | |
