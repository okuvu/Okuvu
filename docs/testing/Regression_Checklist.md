# EVIA Regression Checklist

## Comprehensive Regression Verification — All Sprints 1–4

| | |
|---|---|
| **Application** | EVIA Mobile Application (Android) + Therapist Portal |
| **Document Version** | 1.0 |
| **Sprint Coverage** | Sprints 1–4 |
| **Prepared By** | QA Team |
| **Purpose** | Verify that existing functionality remains intact after changes, deployments, or configuration updates |

---

### Instructions

1. Run this checklist against **evia-beta** after every significant deployment, configuration change, or before any release.
2. Mark each item **PASS (✓)** or **FAIL (✗)**. For any FAIL, record a GitHub Issue with reproduction steps and link it in the Notes column.
3. P0 (Critical) items must all pass before proceeding. Any P0 failure is a release blocker.
4. Estimated full run time: **2–4 hours** with a single tester.

---

### Section 1: Authentication & Session (AUTH)

**Priority Legend:** P0 = Critical (release blocker), P1 = Major, P2 = Minor

| # | Test Item | Priority | Pass/Fail | Tester | Build/Date | Notes/Issue Link |
|---|-----------|----------|-----------|--------|------------|------------------|
| R1.1 | OTP login screen loads correctly with phone number input and country code picker | P0 | ☐ | | | |
| R1.2 | Sending OTP to a valid phone number succeeds | P0 | ☐ | | | |
| R1.3 | Correct OTP verification navigates to Consent Screen | P0 | ☐ | | | |
| R1.4 | Invalid phone number displays clear error, no OTP sent | P1 | ☐ | | | |
| R1.5 | Wrong OTP displays clear error, user can retry | P1 | ☐ | | | |
| R1.6 | Network failure during OTP send shows error state, retry available | P1 | ☐ | | | |
| R1.7 | Network failure during OTP verify shows error state, retry available | P1 | ☐ | | | |
| R1.8 | Returning user logs in successfully without duplicate account | P2 | ☐ | | | |
| R1.9 | LOCAL_DEV_BYPASS_AUTH works in dev mode, disabled in production | P2 | ☐ | | | |
| R1.10 | POST /auth/verify-otp returns 200 for valid token, 401 for invalid | P0 | ☐ | | | |

---

### Section 2: Consent (CONS)

| # | Test Item | Priority | Pass/Fail | Tester | Build/Date | Notes/Issue Link |
|---|-----------|----------|-----------|--------|------------|------------------|
| R2.1 | All 4 consent items displayed with clear labels | P0 | ☐ | | | |
| R2.2 | Item 1 (safety monitoring) is pre-checked and cannot be unchecked | P0 | ☐ | | | |
| R2.3 | Items 2–4 can be independently checked/unchecked | P1 | ☐ | | | |
| R2.4 | Submit/Continue button disabled unless item 1 is checked | P0 | ☐ | | | |
| R2.5 | Consent submission persists all 4 values correctly, returns 200 | P0 | ☐ | | | |
| R2.6 | Backend rejects safety_monitoring=false with 400 | P1 | ☐ | | | |
| R2.7 | Network failure during consent submit shows error, state preserved | P2 | ☐ | | | |

---

### Section 3: Onboarding / Intake (ONBD)

| # | Test Item | Priority | Pass/Fail | Tester | Build/Date | Notes/Issue Link |
|---|-----------|----------|-----------|--------|------------|------------------|
| R3.1 | A2 opening message displayed immediately on intake screen load | P0 | ☐ | | | |
| R3.2 | First message sends USER_TURN, receives AGENT_TURN | P1 | ☐ | | | |
| R3.3 | Completing 3 turns auto-navigates to Home Screen | P0 | ☐ | | | |
| R3.4 | Navigation works for both provisional and confirmed assignment | P0 | ☐ | | | |
| R3.5 | 4th turn prevented/ignored gracefully after Turn 3 | P1 | ☐ | | | |
| R3.6 | Low-effort responses complete normally, no stuck state | P1 | ☐ | | | |
| R3.7 | No clinical labels, care plan names, or scores visible to user | P0 | ☐ | | | |
| R3.8 | Reconnect indicator appears if connection drops mid-onboarding | P2 | ☐ | | | |
| R3.9 | Scoring produces valid 0.0–1.0 scores matching schema | P1 | ☐ | | | |
| R3.10 | Confirmed assignment with >= 0.70 confidence and 3+ turns | P1 | ☐ | | | |
| R3.11 | Provisional assignment with low confidence or fewer turns | P1 | ☐ | | | |
| R3.12 | Fallback rule (default CP1, provisional) fires correctly | P1 | ☐ | | | |
| R3.13 | reasoning_note captured in DB, never shown in mobile UI | P2 | ☐ | | | |
| R3.14 | Tie-breaking for near-equal scores is deterministic | P2 | ☐ | | | |

---

### Section 4: Home Screen (HOME)

| # | Test Item | Priority | Pass/Fail | Tester | Build/Date | Notes/Issue Link |
|---|-----------|----------|-----------|--------|------------|------------------|
| R4.1 | Check In CTA opens a new chat session | P0 | ☐ | | | |
| R4.2 | Progress navigates to Progress Screen with 14-day mood chart | P0 | ☐ | | | |
| R4.3 | Settings navigates to Settings Screen | P0 | ☐ | | | |
| R4.4 | Mood check-in affordance present and functional | P1 | ☐ | | | |
| R4.5 | A10B insight slot always renders a non-clinical message | P1 | ☐ | | | |
| R4.6 | Home Screen renders cleanly for brand-new user | P0 | ☐ | | | |
| R4.7 | Returns to Home Screen (not chat) after session ends | P1 | ☐ | | | |

---

### Section 5: Chat Session (CHAT)

| # | Test Item | Priority | Pass/Fail | Tester | Build/Date | Notes/Issue Link |
|---|-----------|----------|-----------|--------|------------|------------------|
| R5.1 | WebSocket session opens successfully from Check In | P0 | ☐ | | | |
| R5.2 | SESSION_OPEN_CONFIRMED received | P0 | ☐ | | | |
| R5.3 | Rate limit: second daily session rejected with clear message | P0 | ☐ | | | |
| R5.4 | Crisis bypass (S4): session opens despite daily limit, count not decremented | P0 | ☐ | | | |
| R5.5 | Concurrent SESSION_OPEN: exactly one success, one rejection | P1 | ☐ | | | |
| R5.6 | Full turn pipeline: USER_TURN → A1+A9 → A8 → A2 → A12 → AGENT_TURN | P0 | ☐ | | | |
| R5.7 | p50 turn latency < 2s in local testing | P0 | ☐ | | | |
| R5.8 | AGENT_TURN text renders immediately in chat bubble | P0 | ☐ | | | |
| R5.9 | Session auto-closes at 10 turns, SRS modal appears | P0 | ☐ | | | |
| R5.10 | 11th turn prevented (input disabled) | P0 | ☐ | | | |
| R5.11 | 15-minute idle timeout closes session | P1 | ☐ | | | |
| R5.12 | Explicit session close works immediately | P1 | ☐ | | | |
| R5.13 | All 3 close paths trigger exactly one A10A enqueue | P1 | ☐ | | | |
| R5.14 | Network reconnect mid-turn resolves cleanly | P1 | ☐ | | | |
| R5.15 | Reconnect banner appears/disappears correctly | P1 | ☐ | | | |
| R5.16 | Connection failure shows visible error, not silent hang | P1 | ☐ | | | |
| R5.17 | Rate limit error distinct from connection error | P1 | ☐ | | | |
| R5.18 | Voice toggle: OFF by default, persists across restarts | P1 | ☐ | | | |
| R5.19 | TTS plays when voice ON, silent fallback when OFF or unavailable | P1 | ☐ | | | |

---

### Section 6: Safety & Crisis (CRIS)

| # | Test Item | Priority | Pass/Fail | Tester | Build/Date | Notes/Issue Link |
|---|-----------|----------|-----------|--------|------------|------------------|
| R6.1 | A1 classifies explicit crisis message as S4 (no false negative) | P0 | ☐ | | | |
| R6.2 | A1 does NOT classify non-crisis distress as S4 (no false positive) | P0 | ☐ | | | |
| R6.3 | A1 handles borderline distress with sensible S0–S3 grade | P1 | ☐ | | | |
| R6.4 | A1 timeout fallback: safe holding response, never silent fail | P1 | ☐ | | | |
| R6.5 | S4 crisis screen: hardcoded, zero network calls, renders in airplane mode | P0 | ☐ | | | |
| R6.6 | All 5 resources visible with phone numbers | P0 | ☐ | | | |
| R6.7 | One-tap call launches phone dialer immediately | P1 | ☐ | | | |
| R6.8 | No dismiss option at S4 | P0 | ☐ | | | |
| R6.9 | S3 suppression: A2 grounding-only mode, no exploratory content | P1 | ☐ | | | |
| R6.10 | A9 pre-gate: Active/Restricted/Blocked output correctly gates A2 access | P1 | ☐ | | | |
| R6.11 | Pipeline short-circuits on Gate 1 (crisis) — A2/A12 skipped | P1 | ☐ | | | |

---

### Section 7: Progress Screen (PROG)

| # | Test Item | Priority | Pass/Fail | Tester | Build/Date | Notes/Issue Link |
|---|-----------|----------|-----------|--------|------------|------------------|
| R7.1 | 14-day mood chart renders correctly | P0 | ☐ | | | |
| R7.2 | POST /progress/mood/checkin persists mood value | P1 | ☐ | | | |
| R7.3 | Second daily check-in updates entry, no duplicate | P1 | ☐ | | | |
| R7.4 | GET /progress/mood returns correct entries for window | P1 | ☐ | | | |
| R7.5 | Empty/sparse check-in history shows clean gap visualization | P1 | ☐ | | | |
| R7.6 | No care-phase or milestone UI present | P1 | ☐ | | | |

---

### Section 8: Settings & Privacy (SET)

| # | Test Item | Priority | Pass/Fail | Tester | Build/Date | Notes/Issue Link |
|---|-----------|----------|-----------|--------|------------|------------------|
| R8.1 | Settings screen surfaces voice toggle, emergency contact, account deletion | P0 | ☐ | | | |
| R8.2 | Voice toggle state consistent between Settings and Chat screens | P1 | ☐ | | | |
| R8.3 | Emergency contact field is optional, no friction | P0 | ☐ | | | |
| R8.4 | Emergency contact encrypted with AES-256-GCM at rest | P1 | ☐ | | | |
| R8.5 | User can view, update, and clear emergency contact | P1 | ☐ | | | |
| R8.6 | Account deletion requires explicit confirmation | P0 | ☐ | | | |
| R8.7 | Deletion correctly removes/anonymizes user data | P1 | ☐ | | | |
| R8.8 | Active session blocks deletion with clear 409 message | P1 | ☐ | | | |
| R8.9 | No plaintext emergency contact data in logs | P1 | ☐ | | | |

---

### Section 9: Memory Pipeline (A10A)

| # | Test Item | Priority | Pass/Fail | Tester | Build/Date | Notes/Issue Link |
|---|-----------|----------|-----------|--------|------------|------------------|
| R9.1 | SESSION_CLOSED enqueues exactly one Cloud Task | P1 | ☐ | | | |
| R9.2 | A10A generates summary within 10s of session close | P1 | ☐ | | | |
| R9.3 | Summary upsert is idempotent (retry safe) | P1 | ☐ | | | |
| R9.4 | A8 fallback: prior 6 turns used if summary not ready | P1 | ☐ | | | |
| R9.5 | evia-worker is isolated from evia-api (no latency impact) | P1 | ☐ | | | |
| R9.6 | Daily session_limits cleanup removes rows older than 7 days | P2 | ☐ | | | |

---

### Section 10: Therapist Portal (TP)

| # | Test Item | Priority | Pass/Fail | Tester | Build/Date | Notes/Issue Link |
|---|-----------|----------|-----------|--------|------------|------------------|
| R10.1 | T-00: Google OAuth login works | P0 | ☐ | | | |
| R10.2 | T-01: Dashboard shows assigned client list | P0 | ☐ | | | |
| R10.3 | T-01: S3/S4 safety badges render correctly | P1 | ☐ | | | |
| R10.4 | T-02: Client overview shows A10A summary, safety state, mood trend | P0 | ☐ | | | |
| R10.5 | T-02: assignment_state (provisional/confirmed) shown correctly | P1 | ☐ | | | |
| R10.6 | T-02: reasoning_note visible to therapist | P1 | ☐ | | | |
| R10.7 | T-03: Care plan dropdown shows CP1/CP2/CP3 only | P1 | ☐ | | | |
| R10.8 | T-03: Therapist override sets assignment_state to confirmed | P1 | ☐ | | | |
| R10.9 | T-03: Rejects care plan outside CP1–CP3 range | P1 | ☐ | | | |
| R10.10 | T-05: Free-text notes persist and display in chronological order | P1 | ☐ | | | |
| R10.11 | T-05: Notes are NOT ingested by any agent | P0 | ☐ | | | |
| R10.12 | tRPC type changes produce immediate TS error in portal | P2 | ☐ | | | |

---

### Section 11: Infrastructure & Deployment (INFRA)

| # | Test Item | Priority | Pass/Fail | Tester | Build/Date | Notes/Issue Link |
|---|-----------|----------|-----------|--------|------------|------------------|
| R11.1 | Dev flavor points to localhost:8080 | P0 | ☐ | | | |
| R11.2 | Beta flavor points to evia-beta Cloud Run URL | P0 | ☐ | | | |
| R11.3 | GET /health returns 200 with no auth | P0 | ☐ | | | |
| R11.4 | prisma migrate deploy succeeds | P0 | ☐ | | | |
| R11.5 | Cloud Run min-instances=1, max-instances=4 | P2 | ☐ | | | |
| R11.6 | Scripts/deploy-beta.sh deploys successfully | P1 | ☐ | | | |
| R11.7 | Secret Manager has all 3 secrets (GOOGLE_APPLICATION_CREDENTIALS, SARVAM_API_KEY, DATABASE_URL) | P1 | ☐ | | | |
| R11.8 | Cloud SQL automated daily backups enabled | P2 | ☐ | | | |

---

### Section 12: Testing & HALT (TEST)

| # | Test Item | Priority | Pass/Fail | Tester | Build/Date | Notes/Issue Link |
|---|-----------|----------|-----------|--------|------------|------------------|
| R12.1 | Vitest suite: rate limiter concurrency test passes 20/20 | P1 | ☐ | | | |
| R12.2 | Vitest suite: all 4 A8 router gates tested | P1 | ☐ | | | |
| R12.3 | Vitest suite: JWT middleware all 5 token cases | P1 | ☐ | | | |
| R12.4 | Flutter widget tests: crisis screen with no network mocks | P1 | ☐ | | | |
| R12.5 | Flutter widget tests: chat turn-cap state | P1 | ☐ | | | |
| R12.6 | Flutter widget tests: onboarding intake rendering | P1 | ☐ | | | |
| R12.7 | Flutter widget tests: voice toggle OFF-by-default | P1 | ☐ | | | |
| R12.8 | Patrol E2E: OTP login on real device | P1 | ☐ | | | |
| R12.9 | Patrol E2E: full onboarding on real device | P1 | ☐ | | | |
| R12.10 | Patrol E2E: crisis screen in airplane mode | P0 | ☐ | | | |
| R12.11 | Patrol E2E: session turn cap on real device | P1 | ☐ | | | |
| R12.12 | Load test: 50 concurrent WebSockets, p50 ≤ 3s, error rate < 0.1% | P1 | ☐ | | | |
| R12.13 | HALT sign-off record complete with Senior Engineer + Lead Developer sign-off | P0 | ☐ | | | |

---

### Section 13: Dogfooding & Beta (DOG)

| # | Test Item | Priority | Pass/Fail | Tester | Build/Date | Notes/Issue Link |
|---|-----------|----------|-----------|--------|------------|------------------|
| R13.1 | 50+ sessions logged across dogfooding week (≥1/person/day) | P1 | ☐ | | | |
| R13.2 | All bugs logged with reproduction steps in GitHub Issues | P1 | ☐ | | | |
| R13.3 | P0 bugs resolved or documented before MVP sign-off | P0 | ☐ | | | |
| R13.4 | Therapists completed portal walkthrough (T-01/T-02/T-03/T-05) | P1 | ☐ | | | |
| R13.5 | 15+ real supervised sessions logged in TL-mode beta | P1 | ☐ | | | |
| R13.6 | At least 1 therapist used T-03 and T-05 on a real case | P1 | ☐ | | | |

---

### Summary

| Section | Total Items | Passed | Failed | Not Tested | Release Blockers? |
|---------|-------------|--------|--------|------------|-------------------|
| R1 — Authentication | 10 | | | | |
| R2 — Consent | 7 | | | | |
| R3 — Onboarding | 14 | | | | |
| R4 — Home | 7 | | | | |
| R5 — Chat | 19 | | | | |
| R6 — Safety & Crisis | 11 | | | | |
| R7 — Progress | 6 | | | | |
| R8 — Settings & Privacy | 9 | | | | |
| R9 — Memory Pipeline | 6 | | | | |
| R10 — Therapist Portal | 12 | | | | |
| R11 — Infrastructure | 8 | | | | |
| R12 — Testing & HALT | 13 | | | | |
| R13 — Dogfooding & Beta | 6 | | | | |
| **TOTAL** | **128** | | | | |

---

### Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | | | |
| Senior Engineer | | | |
| Lead Developer | | | |
| Product Lead | | | |
