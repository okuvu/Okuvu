# EVIA Mobile Application

## Quality Assurance & User Acceptance Testing Manual

---

| | |
|---|---|
| **Application** | EVIA Mobile Application (Android) |
| **Document Version** | 1.0 |
| **Sprint Coverage** | Sprint 1 — Foundation / Sprint 2 — Core Features / Sprint 3 — Integrations / Sprint 4 — Testing & Launch Readiness |
| **MVP Scope** | Corrected MVP: 5 LLM agents (A1, A2, A9, A10A, A12), 3 care plans (CP1/CP2/CP3), 4-gate A8 router, 4-screen therapist portal (T-01/T-02/T-03/T-05), provisional/confirmed care plan inference, 2-environment setup (Neon local + Cloud SQL evia-beta) |
| **Prepared By** | QA & Release Management Team |
| **Document Type** | Internal QA / UAT / Dogfooding Manual |

---

### Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | July 2026 | QA Team | Initial release for MVP testing |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Product Overview](#2-product-overview)
3. [Testing Strategy](#3-testing-strategy)
4. [Test Environment](#4-test-environment)
5. [Complete User Journey](#5-complete-user-journey)
6. [Screen-by-Screen Testing Guide](#6-screen-by-screen-testing-guide)
7. [Detailed Test Cases](#7-detailed-test-cases)
8. [Feature Testing](#8-feature-testing)
9. [End-to-End User Flow Testing](#9-end-to-end-user-flow-testing)
10. [Network & Offline Testing](#10-network--offline-testing)
11. [Regression Checklist](#11-regression-checklist)
12. [Smoke Test Checklist](#12-smoke-test-checklist)
13. [Acceptance Criteria](#13-acceptance-criteria)
14. [Bug Reporting Guide](#14-bug-reporting-guide)
15. [Release Sign-off](#15-release-sign-off)

---

## 1. Introduction

### 1.1 Purpose

This document serves as the official Quality Assurance (QA), User Acceptance Testing (UAT), and Internal Dogfooding Manual for the EVIA Mobile Application MVP. It provides a comprehensive, structured approach to testing every feature implemented across Sprints 1 through 4. The manual is designed to be used by internal QA testers, dogfooding participants, and anyone involved in verifying the application before clinical beta launch.

### 1.2 Objectives

- Verify that every feature specified in the sprint implementation specifications functions correctly
- Validate that the application meets all documented acceptance criteria
- Identify defects, usability issues, and edge cases before real users encounter them
- Confirm safety-critical features (crisis screen, A1 safety gate, rate limiter) meet their non-negotiable reliability requirements
- Provide documented evidence of testing for release sign-off
- Ensure the therapist portal (T-00 through T-05) is functional and clinically useful
- Generate real session data through dogfooding and supervised beta to surface issues automation cannot catch

### 1.3 Scope

**In Scope (MVP):**
- Phone OTP Authentication via Firebase
- Consent screen with 4 consent items (1 non-declinable)
- 3-turn onboarding intake with care plan inference
- Home screen with Check In, Progress, and Settings entry points
- Mood Check-In (daily, user-initiated)
- 14-day mood progress chart
- WebSocket-based chat sessions with A2 therapeutic agent
- 10-turn session cap with SRS (Session Rating) modal
- 15-minute idle session timeout
- Voice toggle (Text-to-Speech, OFF by default)
- Reconnect indicator for network drops
- A1 Safety Gate (S0-S4 classification on every turn)
- A9 pre-gate governance check
- A8 4-gate routing (crisis, S3 grounding, default, alliance-building)
- S3 grounding-only chat mode
- S4 crisis screen (fully offline, 5 resources, one-tap calling)
- Settings (voice preference, emergency contact, account deletion)
- Emergency contact (AES-256-GCM encrypted storage)
- Account deletion (DPDP-compliant)
- A10A session summary generation (Flash-Lite)
- A10B static home screen insight stub
- Session rate limiter (SD=1/day with crisis bypass)
- Therapist Portal: T-00 (Google OAuth login), T-01 (Dashboard), T-02 (Client Overview), T-03 (Care Plan Change), T-05 (Session Notes)

**Out of Scope (Deferred):**
- A3-A7 agents — deferred until therapist feedback identifies real need
- 5 vernacular languages — English-only at MVP
- Full WebSocket TURN_REPLAY protocol — basic reconnect sufficient
- RLS database policies, Cloud Armor, multi-zone Cloud SQL — correctly deferred
- Full A10B home insight generation — static stub only
- Care phase and milestone indicators on progress screen
- 5-badge system on therapist dashboard
- Rupture, stage-avoidance, peer-concern panels on T-02

### 1.4 Audience

- Internal QA team members executing test cases
- All 10 team members participating in structured dogfooding (E13-S01)
- Lead Developer and Senior Engineer performing HALT verification (E12-S05)
- Product Lead and therapists participating in supervised beta (E13-S03)
- Anyone involved in release readiness assessment

### 1.5 Definitions

| Term | Definition |
|------|------------|
| A1 | Safety gate agent — classifies user messages as S0-S4 using Gemini Pro |
| A2 | Emotion regulation agent — sole therapeutic agent at MVP, handles all 3 care plans |
| A8 | Router — 4-gate deterministic routing function |
| A9 | Pre-gate governance check (Flash-Lite) |
| A10A | Session summary generator (Flash-Lite, runs on evia-worker) |
| A10B | Home insight (static stub at MVP) |
| A12 | Rendering agent — Gemini fallback for conversational output |
| AGENT_TURN | WebSocket frame sent from server to client containing A2's response |
| CP1/CP2/CP3 | Care Plan 1 (Anxiety), Care Plan 2 (Depression), Care Plan 3 (Stress) |
| DPDP | Digital Personal Data Protection (India) |
| HALT | Highest severity test classification — failure blocks launch |
| IST | India Standard Time — used for all date-keyed operations |
| S0-S4 | Safety classifications: S0 (safe), S1 (low concern), S2 (moderate), S3 (elevated distress), S4 (crisis) |
| SD=1/day | Standard daily session cap of 1 session per user per day |
| SRS | Session Rating Scale — lightweight post-session feedback modal |
| T-00 through T-05 | Therapist portal screens: Login, Dashboard, Client Overview, Care Plan, Notes |
| TL Mode | Therapist-Led mode — therapist assigns care plan, system reads it |
| tRPC | Type-safe RPC framework used for therapist portal API |
| USER_TURN | WebSocket frame sent from client to server containing user's message |

### 1.6 References

| Reference | Source |
|-----------|--------|
| EVIA MVP Story Breakdown v1.0 | Sprint 1 Implementation Specifications |
| EVIA Sprint 2 Implementation Specs v1.0 | Sprint 2 Implementation Specifications |
| EVIA Sprint 3 Implementation Specs v1.0 | Sprint 3 Implementation Specifications |
| EVIA Sprint 4 Implementation Specs v1.0 | Sprint 4 Implementation Specifications |
| CONTRIBUTING.md | Repository contributing guide |
| PULL_REQUEST_TEMPLATE.md | GitHub PR template |

---

## 2. Product Overview

### 2.1 Product Purpose

EVIA is an AI-assisted mental wellness companion mobile application designed to provide accessible, conversational support for individuals experiencing anxiety, depression, or stress. The application uses a pipeline of LLM-based agents to deliver safe, context-aware therapeutic conversations while maintaining clinical safety through a multi-layered safety architecture. EVIA operates under therapist supervision in TL (Therapist-Led) mode, where licensed therapists oversee client care plans and can adjust treatment pathways through a dedicated web portal.

### 2.2 Core Features

**Conversational AI Therapy:**
EVIA's core offering is a structured, bounded chat session with an AI therapeutic agent (A2). Each session is limited to 10 conversational turns to keep interactions focused. Every user message passes through a safety pipeline: the A1 safety gate classifies the message severity (S0-S4), the A9 pre-gate performs a governance check, and the A8 router determines the appropriate therapeutic mode. A2 then generates a response tailored to the user's care plan and current safety state.

**Safety Architecture:**
Safety is embedded at every layer. The A1 safety gate runs on every single turn, classifying messages on a scale from S0 (safe) to S4 (crisis). If S4 is detected, the conversation is interrupted and a fully offline crisis screen is displayed, listing 5 Indian crisis helplines with one-tap calling. At S3 (elevated distress), A2 switches to grounding-only mode. The system also includes a daily session rate limiter (SD=1/day) with an automatic crisis bypass that never denies access during a crisis.

**Onboarding & Care Plan Inference:**
New users complete a 3-turn conversational intake rather than a clinical form. During these 3 turns, A2 operates in a special scoring mode that produces explainable anxiety, depression, and stress scores. Application-level logic applies threshold rules to determine a care plan assignment, which can be either provisional (low confidence) or confirmed (high confidence). This assignment is never shown to the user but is visible to their supervising therapist.

**Progress Tracking:**
Users can log a daily mood check-in on the home screen and view a 14-day mood chart on the progress screen. Static (non-LLM) insight messages appear on the home screen as a placeholder for future personalized insights.

**Emergency Preparedness:**
Users can optionally store an emergency contact, encrypted at rest using AES-256-GCM. Account deletion is available with DPDP-compliant data handling.

### 2.3 Primary User Journey

1. Download and install the EVIA Android app
2. Authenticate via phone number OTP (Firebase phone auth)
3. Review and accept consent items (safety monitoring is mandatory)
4. Complete the 3-turn onboarding intake conversation
5. Land on the Home Screen (the default landing destination)
6. Use the daily mood check-in or tap Check In to start a chat session
7. Exchange up to 10 conversational turns with A2 through the safety pipeline
8. Receive the Session Rating Scale modal at session end
9. Return to the Home Screen
10. View progress on the 14-day mood chart
11. Adjust settings (voice preference, emergency contact)
12. Optionally delete account via Settings

### 2.4 Therapist Portal

The therapist portal is a separate Next.js web application with four screens:
- **T-00:** Google OAuth login — only pre-authorized therapist accounts can access
- **T-01:** Dashboard — read-only client list with summary fields and S3/S4 safety badges
- **T-02:** Client Overview — detailed view including care plan (provisional/confirmed), reasoning note, session summary, and safety state
- **T-03:** Care Plan Management — dropdown to change a client's care plan (CP1/CP2/CP3), always sets to confirmed
- **T-05:** Session Notes — free-text note-taking, explicitly not ingested by any AI agent

### 2.5 Major Modules

| Module | Sprint | Key Components |
|--------|--------|----------------|
| Authentication | Sprint 1 | Firebase phone OTP, POST /auth/verify-otp, JWT bypass for local dev |
| Consent | Sprint 1 | 4-item consent screen, POST /users/me/consent |
| Onboarding | Sprint 2 | 3-turn intake, A2 scoring mode, care plan assignment |
| Chat / WebSocket | Sprint 2 | SESSION_OPEN, USER_TURN, AGENT_TURN, 10-turn cap, idle timeout, reconnect |
| Safety / Crisis | Sprint 2 | A1 classification, A9 pre-gate, A8 routing, S3 grounding, S4 crisis screen |
| Memory Pipeline | Sprint 2 | evia-worker, Cloud Tasks, A10A summary generation, fallback logic |
| Home / Progress | Sprint 3 | Home screen layout, mood check-in, 14-day chart, static insight |
| Settings | Sprint 3 | Voice toggle, emergency contact (AES-256-GCM), account deletion |
| Therapist Portal | Sprint 3 | T-00 through T-05 — NextAuth, tRPC, client management |
| Testing | Sprint 4 | Vitest, widget tests, patrol E2E, load test, HALT verification |

---

## 3. Testing Strategy

### 3.1 Functional Testing

Every feature described in the sprint implementation specifications is tested against its documented functional requirements. Testers execute each feature's positive, negative, and edge case scenarios as defined in the detailed test cases section. Functional testing is performed against the evia-beta environment unless otherwise specified.

### 3.2 Navigation Testing

All navigation paths between screens are verified, including:
- Login → Consent → Onboarding → Home
- Home → Chat (Check In) → Session → SRS Modal → Home
- Home → Progress → Home
- Home → Settings → Emergency Contact / Account Deletion / Voice Toggle
- Crisis screen non-dismissibility
- Therapist portal: T-00 → T-01 → T-02 → T-03 / T-05

### 3.3 UI Testing

Visual verification that each screen renders correctly according to the specifications. This includes correct display of text elements, proper layout, responsive behaviour, and consistent use of the theme. UI testing is performed on real Android devices (not just emulators), with particular attention to low-end devices.

### 3.4 Workflow Testing

Complete end-to-end workflows are tested to ensure all steps connect correctly. Key workflows include the full onboarding-to-session flow, the crisis detection-to-crisis screen flow, and the therapist portal workflow from login to note-writing.

### 3.5 Negative Testing

Every input field, API endpoint, and user action is tested with invalid, unexpected, or malicious inputs. This includes malformed API requests, empty message submissions, invalid OTPs, out-of-range mood values, and unauthorised access attempts.

### 3.6 Edge Case Testing

Boundary conditions and unusual scenarios are explicitly tested:
- User with zero session history navigating the app
- User at the IST day boundary for rate limiting and mood check-ins
- Concurrent SESSION_OPEN requests (race condition)
- Very short sessions (1-2 turns)
- Sparse mood check-in history
- Therapist with zero assigned clients
- Provisional assignment state displayed in therapist portal

### 3.7 Offline Testing

The crisis screen is tested in genuine airplane mode on a real device. This is the only offline scenario explicitly required by the specifications. No other screen is required to function offline. The crisis screen must render fully and provide one-tap calling without any network dependency.

### 3.8 Regression Testing

Full regression testing is performed after every bug fix to confirm the fix did not introduce new issues elsewhere. The regression checklist (Section 11) covers all implemented features and must be executed before any release candidate is approved.

### 3.9 Acceptance Testing

Every acceptance criterion from the sprint implementation specifications is tested and recorded as pass or fail. A feature is considered complete only when all its acceptance criteria pass. The consolidated acceptance criteria are provided in Section 13.

### 3.10 Smoke Testing

A rapid (10-15 minute) smoke test covering the most critical application functionality is executed before any deeper testing session begins. The smoke test checklist is provided in Section 12.

### 3.11 Dogfooding

Structured internal usage by all 10 team members across a 5-day period. Each team member uses the app for at least one real session per day and logs bugs with reproduction steps in GitHub Issues. Dogfooding follows the HALT sign-off (E12-S05) and runs before the supervised beta.

---

## 4. Test Environment

### 4.1 Target Devices

Testing must be performed on at least one real Android device. Emulator-only testing is not sufficient. The following device characteristics are recommended:

| Requirement | Specification |
|-------------|---------------|
| Minimum | Android 9 (API 28), 2GB RAM |
| Recommended | Android 12+ (API 31+), 4GB+ RAM |
| Target for low-end testing | Android device with 2-3GB RAM (budget segment) |
| Screen sizes | At least one device with 5.5"-6.5" display |

The specifications explicitly warn that emulators frequently have better default TTS engines than real budget hardware, so low-end device testing for TTS is non-negotiable. The crisis screen offline test must be done on a real device in actual airplane mode.

### 4.2 Internet Requirements

- **Normal operation:** Active internet connection (WiFi or mobile data)
- **Crisis screen:** Must work with ZERO network connectivity (airplane mode)
- **Recommended speed:** 3G or better for acceptable chat latency
- **Note:** The p50 turn latency target is under 2 seconds in local testing, under 3 seconds at load

### 4.3 Build Installation

The Flutter app must be launched with `--dart-define=FLAVOR=dev` for local testing or `--dart-define=FLAVOR=beta` for testing against evia-beta. Without this flag, `AppConfig.init()` throws `FlavorNotSpecifiedException`.

For testing against evia-beta (required for E2E tests and supervised beta):
```bash
cd apps/mobile
flutter run --flavor beta --dart-define=FLAVOR=beta
```

### 4.4 Tester Preparation

Before beginning testing, each tester must:

1. Have a test phone number available for Firebase OTP authentication
2. Be added to the evia-beta environment with appropriate access
3. Read the application's consent information to understand the 4 consent items
4. Understand the S0-S4 safety classification system
5. Know the 5 crisis helpline resources: iCall, Vandrevala Foundation, NIMHANS, Snehi, 112
6. For therapist portal testers: have Google account pre-authorized for therapist access
7. Fill in `.env` with appropriate values:
   - `DATABASE_URL` — Neon branch connection string
   - `FIREBASE_ADMIN_SDK_PATH` — path to Firebase dev service account JSON
   - `VERTEX_AI_SA_KEY_PATH` — path to GCP dev service account JSON
   - `LOCAL_DEV_BYPASS_AUTH="true"` for local development

### 4.5 Preconditions

Before each test scenario, verify:
- The backend API is running (local `localhost:8080` or evia-beta Cloud Run URL)
- WebSocket endpoint is accessible
- The database has been migrated (`pnpm prisma migrate dev`)
- For local testing: Neon database is accessible with valid DATABASE_URL
- For evia-beta testing: Cloud Run services (evia-api and evia-worker) are deployed

### 4.6 Required Accounts

| Account Type | Purpose | Setup Required |
|-------------|---------|----------------|
| Test phone number | Firebase OTP login for mobile app | Designated test number, not production |
| Firebase project | Authentication provider | Already configured (ask Senior Engineer) |
| Therapist Google account | T-00 portal login | Must be on authorized allowlist |
| GCP service account | Vertex AI / Gemini access | Already configured (ask Senior Engineer) |

---

## 5. Complete User Journey

### 5.1 User Flow Diagram

```
                    ┌─────────────────┐
                    │  Launch App      │
                    │  (Splash Screen) │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  OTP Login      │
                    │  (Phone → OTP)  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Consent Screen  │
                    │  4 Items (1 req) │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  3-Turn Onboard │
                    │  (Intake Chat)  │
                    └────────┬────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │      Home Screen         │
              │  ┌─────┐ ┌──────┐ ┌────┐ │
              │  │Check│ │Progress│ │Sett.│ │
              │  │ In  │ │        │ │ings│ │
              │  └──┬──┘ └───┬────┘ └──┬─┘ │
              │  ┌──┴──┐    │         │    │
              │  │Mood │    │         │    │
              │  │ChkIn│    │         │    │
              │  └─────┘    │         │    │
              │  ┌──────────┴┐        │    │
              │  │ Insight   │        │    │
              │  │ (Static)  │        │    │
              │  └───────────┘        │    │
              └───────────────────────┴────┘
               │        │            │
               ▼        ▼            ▼
        ┌──────────┐ ┌────────┐ ┌──────────┐
        │Chat Ses. │ │Progress│ │ Settings │
        │(10 turns)│ │Screen  │ │——Voice   │
        │——SRS     │ │(14-day)│ │——Emerg   │
        │——Crisis? │ │        │ │  Contact │
        │——S3 Mode │ │        │ │——Del Acct│
        └────┬─────┘ └────────┘ └──────────┘
             │
             ▼ (if S4 detected)
        ┌─────────────────┐
        │  Crisis Screen  │
        │  (5 resources)  │
        │  (No dismiss)   │
        │  (Offline-safe) │
        └─────────────────┘

        Therapist Portal (separate web app):
        T-00 (Login) → T-01 (Dashboard) → T-02 (Client Overview)
                                          → T-03 (Care Plan)
                                          → T-05 (Session Notes)
```

### 5.2 Journey Description

**Phase 1 — Authentication & Consent:**
The user launches the app and is presented with a phone number entry screen. After entering their phone number, an OTP is sent via Firebase phone authentication. Upon successful OTP verification, the backend creates or retrieves the user's account. The user then progresses to the consent screen, where they must accept safety monitoring (non-declinable) and may optionally accept consent for mood inference, assessment, and emergency contact usage.

**Phase 2 — Onboarding Intake:**
The user enters a 3-turn conversational intake with A2. This begins with A2's opening question ("What's been weighing on your mind lately?"). The user responds freely, and A2 replies in a conversational style. During these turns, A2 operates in a scoring mode invisible to the user, producing anxiety/depression/stress scores. After the 3rd turn, the system applies the threshold rule to determine the user's care plan assignment. The user is then navigated to the home screen automatically, regardless of whether the assignment is provisional or confirmed.

**Phase 3 — Home & Daily Check-In:**
The home screen is the default landing destination for returning users. It contains a mood check-in affordance (daily, user-initiated), a Check In button to start a chat session, a Progress link to view the 14-day mood chart, a Settings link, and a slot for a static insight message. The mood check-in allows the user to log their current mood on a scale, overwriting the same day's entry if they check in again.

**Phase 4 — Chat Session:**
Tapping Check In triggers a SESSION_OPEN WebSocket handshake. The rate limiter checks the user's daily session count (SD=1/day) with crisis bypass. If approved, a session begins. The user can send up to 10 messages (turns), each processed through the full agent pipeline: A1 and A9 run in parallel, A8 routes, A2 generates a response, A12 renders it. The response arrives as an AGENT_TURN frame and is rendered as a chat bubble. Voice playback plays if enabled.

**Phase 5 — Session End:**
Sessions end via one of three paths: turn cap (after 10 AGENT_TURNs), idle timeout (15 minutes of inactivity), or explicit user close. On session close, the A10A summary generation is triggered asynchronously via Cloud Tasks. The user sees an SRS modal where they can optionally provide a session rating, then returns to the home screen.

**Phase 6 — Crisis Pathway:**
If at any point A1 classifies a message as S4, A8's Gate 1 triggers a crisis signal instead of routing to A2. The client navigates to the crisis screen — a fully offline, non-dismissible overlay showing all 5 crisis resources (iCall, Vandrevala, NIMHANS, Snehi, 112) with one-tap call buttons.

**Phase 7 — Therapist Portal (Parallel Track):**
While the client uses the mobile app, their supervising therapist can log into the therapist portal via Google OAuth (T-00). The therapist sees their client list on the dashboard (T-01), can view a client's care plan state, reasoning note, session summary, and safety state (T-02), can change the client's care plan among CP1/CP2/CP3 (T-03), and can write free-text session notes (T-05) that are not ingested by any AI agent.

---

## 6. Screen-by-Screen Testing Guide

### 6.1 OTP Login Screen

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-AUTH-001 |
| **Purpose** | Authenticate the user via phone number and OTP verification |
| **Entry Points** | App launch (unauthenticated user) |
| **Exit Points** | Success: Consent Screen / Failure: Error state on current screen |
| **Preconditions** | App launched, no active session, Firebase Auth configured |

**Expected UI:**
- Phone number input field with country code
- "Send OTP" button
- OTP input field (visible after OTP is sent)
- "Verify OTP" button
- Error message area for invalid number / wrong OTP / network failure

**Expected Behaviour:**
- User enters phone number and requests OTP
- Firebase phone auth sends OTP to the number
- User enters OTP and submits
- On success, calls POST /auth/verify-otp which creates or fetches the User row
- Progresses to consent screen
- In dev flavor with LOCAL_DEV_BYPASS_AUTH, a fake bypass token is used

**Available Actions:**
- Enter phone number
- Request OTP
- Enter OTP
- Verify OTP
- Retry on failure

**Validation Rules:**
- Phone number must be a valid Indian mobile number format (as Firebase validates)
- OTP must be 6 digits

**Error Conditions:**
- Invalid phone number format
- Wrong OTP entered
- Network failure during OTP send or verify
- 401 returned from POST /auth/verify-otp (invalid/expired token)
- Backend unreachable

**Acceptance Criteria:**
- Valid Firebase token creates a new User row on first call, returns existing row on subsequent calls
- Invalid token returns 401
- Works correctly with LOCAL_DEV_BYPASS_AUTH in local development
- User can enter phone number, receive OTP, enter it, and land on the next screen with a valid session
- Error states handled: invalid number, wrong OTP, network failure

---

### 6.2 Consent Screen

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-ONB-001 |
| **Purpose** | Present 4 consent items for user acceptance |
| **Entry Points** | Success from OTP Login |
| **Exit Points** | Success: Onboarding Intake Screen / Failure: Cannot proceed without item 1 |
| **Preconditions** | User authenticated, POST /auth/verify-otp succeeded |

**Expected UI:**
- 4 individually-checkable consent items
- Item 1: Safety monitoring (non-declinable)
- Item 2: Mood inference (declinable)
- Item 3: Assessment (declinable)
- Item 4: Emergency contact (declinable)
- Submit/Continue button (disabled until item 1 is checked)

**Expected Behaviour:**
- Item 1 (safety monitoring) is mandatory and cannot be unchecked
- Items 2-4 can each be independently checked or unchecked
- User cannot proceed without checking item 1
- Submitting calls POST /users/me/consent with all 4 states
- Backend persists all 4 consent booleans
- Safety monitoring consent rejected with 400 if submitted as false

**Available Actions:**
- Check/uncheck items 2-4
- Submit consent

**Validation Rules:**
- Safety monitoring must be checked (backend rejects if false)
- All 4 values must be submitted

**Error Conditions:**
- POST /users/me/consent returns 400 if safety monitoring is false
- Network failure during submission

**Acceptance Criteria:**
- User cannot proceed without checking item 1 (safety monitoring)
- Items 2-4 can each be independently checked or unchecked
- Submitting calls POST /users/me/consent with all 4 states
- Endpoint persists all 4 consent values correctly, returns 200
- Safety monitoring consent is rejected with 400 if submitted as false

---

### 6.3 3-Turn Onboarding Intake Screen

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-ONB-002 |
| **Purpose** | Conduct the user's first conversation with A2 for care plan inference |
| **Entry Points** | Consent Screen (after submission) |
| **Exit Points** | After Turn 3: Home Screen |
| **Preconditions** | Consent submitted, WebSocket connection established |

**Expected UI:**
- Chat-style interface showing A2's messages and user responses
- A2's opening message displayed immediately: "What's been weighing on your mind lately?"
- Free-text input field at bottom
- Turn counter or progress indicator (subtle)
- No clinical labels, care plan names, or scores visible

**Expected Behaviour:**
- A2's opening message appears immediately on screen load
- User types a free-text response and sends it
- Response is sent via WebSocket USER_TURN frame
- A2's reply is received as AGENT_TURN frame and rendered as chat bubble
- This repeats for a total of 3 user turns
- After the 3rd AGENT_TURN is received, screen automatically navigates to Home
- Navigation happens regardless of assignment_state (provisional or confirmed)
- Scoring happens invisibly server-side — no scores shown to user

**Available Actions:**
- Type and send messages (up to 3 turns)
- Read A2's responses

**Validation Rules:**
- Cannot send 4th turn (should be prevented or gracefully ignored)
- Non-empty message validation before sending (standard)

**Error Conditions:**
- Connection drop mid-onboarding: show reconnect indicator, allow resume
- A2 fails to respond: handle gracefully per pipeline fallback

**Acceptance Criteria:**
- User sees A2's opening message and can respond freely
- UI transitions to home screen after Turn 3 regardless of assignment_state
- No clinical labels or care plan names are ever shown to the user during this flow
- Completing all 3 turns with minimal/low-effort responses still transitions normally

---

### 6.4 Home Screen

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-HOME-001 |
| **Purpose** | Central navigation hub — default landing screen for returning users |
| **Entry Points** | After onboarding completes / After session ends (SRS modal dismissed) / App launch (authenticated user) |
| **Exit Points** | Check In → Chat Session / Progress → Progress Screen / Settings → Settings Screen |
| **Preconditions** | User authenticated, onboarding completed (or skipped for returning users) |

**Expected UI:**
- Check In button/entry point (navigates to new chat session)
- Progress entry point (navigates to progress screen)
- Settings entry point (navigates to settings)
- Mood check-in affordance (triggers POST /progress/mood/checkin)
- A10B insight card slot (static, rotating friendly message — NOT LLM generated)
- Clean rendering even for brand-new user with no progress data

**Expected Behaviour:**
- All 3 navigation entry points functional
- Mood check-in persists value via POST /progress/mood/checkin
- Insight card always shows a message (never empty)
- Screen is the default landing destination after login/onboarding and after returning from a closed chat session
- Renders instantly on app open
- Home screen, not chat screen, is the default landing destination

**Available Actions:**
- Tap Check In to start session
- Tap Progress to view mood chart
- Tap Settings to manage preferences
- Tap mood check-in to log daily mood

**Acceptance Criteria:**
- All 3 navigation entry points (Check In, Progress, Settings) are present and functional
- Insight and mood-checkin slots are defined and functional
- Screen renders cleanly for a brand-new user with no progress data yet

---

### 6.5 Chat Screen (Main Session)

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-CHAT-001 |
| **Purpose** | Conduct a therapeutic chat session with A2 (up to 10 turns) |
| **Entry Points** | Home Screen → Check In |
| **Exit Points** | SRS Modal (at session end) → Home Screen / Crisis Screen (if S4 detected) |
| **Preconditions** | Rate limiter check passes, SESSION_OPEN confirmed |

**Expected UI:**
- Chat bubble interface (user messages and A2 responses)
- Turn counter (e.g. "7/10") visible during conversation
- Text input field
- Voice toggle widget (if available)
- Reconnect banner (visible during network drops)
- Send button

**Expected Behaviour:**
- WebSocket connection established on screen entry
- SESSION_OPEN sent immediately
- USER_TURN sent on message submit
- AGENT_TURN received and rendered as chat bubble immediately
- Text renders in same frame as receipt — acknowledgement sent before TTS
- Turn counter updates reactively
- Voice plays automatically if toggle is ON and TTS is installed
- At turn 10, the 10th AGENT_TURN is rendered, then SESSION_CLOSED fires
- Input is disabled at session end — user cannot send 11th turn
- If S4 detected, screen navigates to crisis screen instead of rendering bubble

**Available Actions:**
- Send text messages (up to 10)
- Toggle voice ON/OFF
- View turn counter
- End session explicitly (optional)

**Validation Rules:**
- Non-empty message before sending
- Max 10 turns enforced
- Session must be open to send messages

**Error Conditions:**
- Connection failure: reconnect banner with retry option
- SESSION_OPEN rejected (rate limit): distinct error message
- Malformed AGENT_TURN frame: gracefully skip, don't crash
- Session already closed: reject turn attempt cleanly

**Acceptance Criteria:**
- Connects successfully to backend WebSocket endpoint per flavor
- Handles connection failure with visible error state
- Text renders within same frame as receipt
- Turn counter updates correctly
- SRS modal appears on cap-triggered close
- User cannot send 11th turn
- Crisis-routed frames correctly trigger crisis navigation

---

### 6.6 Crisis Screen

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-CRISIS-001 |
| **Purpose** | Provide immediate access to crisis helplines when S4 detected |
| **Entry Points** | A8 Gate 1 routing signal from any AGENT_TURN frame |
| **Exit Points** | None (no dismiss option) — user must use crisis resources or app restart |
| **Preconditions** | S4 classification by A1 on any turn |

**Expected UI:**
- All 5 crisis resources displayed: iCall, Vandrevala Foundation, NIMHANS, Snehi, 112
- Each resource has a one-tap call button (tel: URI)
- No loading states — renders instantly
- No dismiss/close/back button
- Content is hardcoded — zero network calls

**Expected Behaviour:**
- Screen renders immediately when crisis signal received
- All 5 resources visible at all times
- Standard navigation gestures (back, swipe) are disabled/intercepted
- Tapping any resource launches phone dialer immediately via tel: URI
- No confirmation dialog before dialing
- Works completely in airplane mode (offline)
- Screen is non-dismissible at S4

**Available Actions:**
- Tap any of 5 call buttons to launch phone dialer

**Validation Rules:**
- All resource names and phone numbers verified accurate against documented source
- No network calls of any kind made by this screen
- No dismiss option available

**Error Conditions:**
- Device with no SIM/calling capability: OS handles gracefully, no confusing in-app error
- Must not produce any error related to network unavailability (by design)

**Acceptance Criteria:**
- Renders correctly with device in airplane mode — confirmed by actual offline test
- All 5 resources (iCall, Vandrevala, NIMHANS, Snehi, 112) always visible
- No dismiss option at S4
- Tapping any resource launches phone dialer immediately on real device test

---

### 6.7 Progress Screen

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-PROG-001 |
| **Purpose** | Display 14-day mood chart from user-logged check-ins |
| **Entry Points** | Home Screen → Progress |
| **Exit Points** | Back to Home Screen |
| **Preconditions** | Home screen accessible |

**Expected UI:**
- Line or bar chart showing mood values for last 14 days
- Days with no logged mood: shown as gaps (not zero or interpolated)
- Clean empty state for brand-new user with zero check-ins
- No care-phase indicators, milestone badges, or other progress dimensions

**Expected Behaviour:**
- Fetches data via GET /progress/mood?days=14 on load
- Chart renders with correct data
- Days without check-ins are visually distinct gaps
- Sparse data handled gracefully

**Available Actions:**
- View chart
- Navigate back to Home

**Acceptance Criteria:**
- Chart renders correctly with 0, 1, and 14+ days of data
- No references anywhere in this screen to care phases or milestones

---

### 6.8 Settings Screen

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-SETT-001 |
| **Purpose** | Central location for user preferences and account management |
| **Entry Points** | Home Screen → Settings |
| **Exit Points** | Back to Home Screen / Emergency Contact / Account Deletion |
| **Preconditions** | Home screen accessible |

**Expected UI:**
- Voice toggle (ON/OFF, OFF by default)
- Emergency Contact entry point
- Account Deletion entry point
- Clean list layout

**Expected Behaviour:**
- Voice toggle reflects same state as chat-screen toggle (shared persistence)
- Toggling in either location updates both
- Voice toggle hidden entirely if voice unavailable for current language
- Navigation to Emergency Contact and Account Deletion screens functional

**Available Actions:**
- Toggle voice ON/OFF
- Navigate to Emergency Contact
- Navigate to Account Deletion
- Return to Home

**Acceptance Criteria:**
- Settings screen correctly surfaces the same voice toggle state as chat screen
- Changes in either location reflected in the other

---

### 6.9 Emergency Contact Screen

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-SETT-002 |
| **Purpose** | Optionally record an emergency contact with AES-256-GCM encryption |
| **Entry Points** | Settings → Emergency Contact |
| **Exit Points** | Back to Settings |
| **Preconditions** | User authenticated |

**Expected UI:**
- Name input field (optional)
- Phone number input field (optional)
- Save button
- Clear button (to remove saved contact)
- Fields clearly marked optional — no pressure to provide

**Expected Behaviour:**
- Contact name and phone number encrypted with AES-256-GCM before storage
- Encryption key from Secret Manager, not hardcoded
- Saved contact can be viewed (decrypted for editing), updated, or cleared
- Cleared state removes encrypted fields entirely
- Phone number validated to sensible format before encryption
- Never log plaintext contact data, even at debug level

**Available Actions:**
- Enter name (optional)
- Enter phone number (optional)
- Save
- Update
- Clear

**Validation Rules:**
- Phone number validated for sensible format
- Both fields optional — no requirement to provide either

**Error Conditions:**
- Invalid phone format: 400 with clear message
- Decryption failure: clear error state

**Acceptance Criteria:**
- Emergency contact is never stored in plaintext — verified by inspecting stored value
- Field is genuinely optional with no friction or warning
- User can view, update, and clear their saved contact

---

### 6.10 Account Deletion Screen

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-SETT-003 |
| **Purpose** | Allow user to permanently delete their account and data |
| **Entry Points** | Settings → Account Deletion |
| **Exit Points** | Account deleted (logged out) / Back to Settings |
| **Preconditions** | User authenticated |

**Expected UI:**
- Clear explanation of what deletion means
- Explicit confirmation step (not a single tap)
- Confirm button (requires deliberate action)
- Cancel button

**Expected Behaviour:**
- Requires deliberate confirmation (not accidental single tap)
- On confirmed deletion, user's account and associated data are removed or anonymized per DPDP-compliant pathway
- If user has active session, handles gracefully (409 or automatic close)
- User is logged out after deletion
- Deletion logged for audit without logging deleted personal data

**Available Actions:**
- Read deletion explanation
- Confirm deletion (with deliberate action)
- Cancel and return to Settings

**Validation Rules:**
- Explicit confirmation flag required in API request
- Active session blocks deletion with clear message (or auto-closes)

**Error Conditions:**
- Active session: 409 with clear message
- Partial deletion failure: clean fail, retry-safe

**Acceptance Criteria:**
- Deletion requires explicit, deliberate confirmation
- Confirmed deletion correctly removes/anonymizes user's data per DPDP pathway
- Active session handled gracefully

---

### 6.11 SRS Modal (Session Rating Scale)

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-CHAT-002 |
| **Purpose** | Collect lightweight session quality feedback |
| **Entry Points** | Automatically appears when SESSION_CLOSED received at turn cap |
| **Exit Points** | Home Screen (after rating or dismissal) |
| **Preconditions** | Session ended at turn cap (10 turns) |

**Expected UI:**
- Simple rating prompt (not a lengthy survey)
- Optional rating input
- Dismiss option (without providing rating)
- Navigation back to Home Screen

**Expected Behaviour:**
- Modal appears automatically when SESSION_CLOSED is received
- Rating submission is optional
- User can dismiss without rating and still proceed to home
- On submission, rating persisted to session_logs.session_feedback_score

**Available Actions:**
- Provide rating (optional)
- Dismiss modal

**Acceptance Criteria:**
- Modal appears automatically when SESSION_CLOSED is received at turn cap
- User cannot send 11th turn

---

### 6.12 Therapist Portal — T-00 Login

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-TP-000 |
| **Purpose** | Authenticate therapists via Google OAuth |
| **Entry Points** | Therapist portal URL (unauthenticated) |
| **Exit Points** | Success: T-01 Dashboard / Failure: Login screen with error message |
| **Preconditions** | Therapist Google account must be on authorized allowlist |

**Expected UI:**
- "Sign in with Google" button
- Error message area

**Expected Behaviour:**
- Clicking "Sign in with Google" initiates NextAuth Google OAuth flow
- On successful OAuth, an authenticated therapist session is established
- Only pre-authorized therapist Google accounts can successfully authenticate
- Server-side authorization check after OAuth callback
- Unauthenticated access to any other portal route redirects to this login
- Failed/cancelled OAuth returns to login screen with clear message

**Available Actions:**
- Sign in with Google

**Validation Rules:**
- Post-OAuth authorization check enforced server-side
- Non-authorized Google accounts rejected with clear message

**Acceptance Criteria:**
- Authorized therapist Google account can log in and reach dashboard
- Non-authorized Google account is rejected even after successful Google OAuth

---

### 6.13 Therapist Portal — T-01 Dashboard

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-TP-001 |
| **Purpose** | Display therapist's assigned client list at a glance |
| **Entry Points** | T-00 Login (success) |
| **Exit Points** | Select client → T-02 Client Overview |
| **Preconditions** | Therapist authenticated |

**Expected UI:**
- List of assigned clients with summary fields
- Each client row: name/identifier, current care plan, last session date
- Safety badges: S3/S4 indicators only (no other badge types)
- Read-only — no inline editing
- Clean empty state for therapist with no clients

**Expected Behaviour:**
- Fetches client list via therapist.clients.list tRPC procedure
- Each client shows lightweight summary fields
- Therapist only sees their own assigned clients
- Selecting a client navigates to T-02
- Read-only by design — no editing capability

**Available Actions:**
- View client list
- Select client → T-02
- Logout

**Acceptance Criteria:**
- Dashboard correctly renders therapist's client list with summary fields
- No editing capability present
- Empty caseload renders clear, friendly state

---

### 6.14 Therapist Portal — T-02 Client Overview

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-TP-002 |
| **Purpose** | Display detailed clinical snapshot of a single client |
| **Entry Points** | T-01 Dashboard → select client |
| **Exit Points** | Back to T-01 Dashboard / Navigate to T-03 or T-05 |
| **Preconditions** | Therapist authenticated, client assigned to this therapist |

**Expected UI:**
- Care plan section: care_plan_id, assignment_state (provisional/confirmed visually distinct), reasoning_note
- Session summary section: most recent available summary or "not yet available" message
- Safety state display
- Read-only — no inline editing
- No empty or broken UI sections for deferred panels

**Expected Behaviour:**
- Fetches detail via therapist.clients.detail tRPC procedure
- Provisional vs confirmed assignment_state visually distinct
- Missing summary shows honest "not yet available" — not fabricated content
- Cross-therapist access blocked server-side
- No rupture, stage-avoidance, peer-concern panels present

**Available Actions:**
- View client clinical data
- Navigate to T-03 (Care Plan) or T-05 (Notes)
- Return to dashboard

**Acceptance Criteria:**
- All fields render correctly and legibly
- Provisional vs confirmed is visually distinct
- Missing session summary renders clear "not yet available" state
- No editing capability present

---

### 6.15 Therapist Portal — T-03 Care Plan

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-TP-003 |
| **Purpose** | Allow therapist to change a client's care plan |
| **Entry Points** | T-02 Client Overview |
| **Exit Points** | Back to T-02 / Saved confirmation |
| **Preconditions** | Therapist authenticated, client assigned to this therapist |

**Expected UI:**
- Current care plan displayed
- Dropdown with options: CP1 (Anxiety), CP2 (Depression), CP3 (Stress)
- Save button
- Success/error confirmation message

**Expected Behaviour:**
- Dropdown selection (not free text) per low-cognitive-load design principle
- On selection, calls therapist.clients.setCarePlan tRPC procedure
- Always sets assignment_state to confirmed (therapist override is authoritative)
- Only supported care plans (CP1/CP2/CP3) available in dropdown
- Cross-therapist write blocked server-side
- Same care plan re-selected: succeeds as no-op

**Available Actions:**
- Select care plan from dropdown
- Save
- Cancel

**Validation Rules:**
- Only CP1/CP2/CP3 allowed
- Therapist must be assigned to this client

**Acceptance Criteria:**
- Therapist can select and save new care plan for assigned client
- Save success and failure clearly communicated
- Write correctly sets assignment_state to confirmed

---

### 6.16 Therapist Portal — T-05 Session Notes

| Property | Description |
|----------|-------------|
| **Screen ID** | SCR-TP-004 |
| **Purpose** | Allow therapist to write and review free-text session notes |
| **Entry Points** | T-02 Client Overview |
| **Exit Points** | Back to T-02 |
| **Preconditions** | Therapist authenticated, client assigned to this therapist |

**Expected UI:**
- Chronological list of existing notes (content, timestamp, author)
- Free-text input field for new note
- Save button
- Clean empty state for client with no notes

**Expected Behaviour:**
- Existing notes displayed in chronological order
- New note can be added and appears immediately (no full reload)
- Note content cannot be empty/whitespace-only
- Notes are explicitly NOT ingested by any AI agent — confirmed by code review
- Cross-therapist access blocked server-side
- Draft text preserved if save fails (therapist doesn't lose their writing)

**Available Actions:**
- View existing notes
- Write new note
- Save note

**Validation Rules:**
- Note content must not be empty/whitespace-only
- Therapist must be assigned to this client

**Acceptance Criteria:**
- Existing notes render correctly in chronological order
- New note can be added and appears without full page reload
- Empty-notes state is clear and friendly

---

## 7. Detailed Test Cases

This section provides test case IDs and high-level descriptions. For the complete detailed test case library with all fields (Preconditions, Test Data, Execution Steps, Expected Results, Pass/Fail Criteria, Notes), refer to the companion document **QA_Test_Cases.md**.

### 7.1 Authentication Test Cases

| ID | Feature | Priority | Summary |
|----|---------|----------|---------|
| AUTH-001 | OTP Login | P0 | Valid phone number: enter number, receive OTP, verify successfully, land on consent |
| AUTH-002 | OTP Login | P1 | Invalid phone number format: should show error |
| AUTH-003 | OTP Login | P1 | Wrong OTP entered: should show error, allow retry |
| AUTH-004 | OTP Login | P1 | Network failure during OTP send: should show error state |
| AUTH-005 | OTP Login | P1 | Network failure during OTP verify: should show error state |
| AUTH-006 | OTP Login | P0 | Backend returns 401 for invalid/expired token: should handle gracefully |
| AUTH-007 | OTP Login | P2 | Returning user: verify existing User row returned, not duplicate creation |
| AUTH-008 | OTP Login | P2 | Local dev bypass flag: verify works with LOCAL_DEV_BYPASS_AUTH |

### 7.2 Consent Test Cases

| ID | Feature | Priority | Summary |
|----|---------|----------|---------|
| CONS-001 | Consent Screen | P0 | All 4 items displayed, item 1 pre-checked, cannot uncheck |
| CONS-002 | Consent Screen | P0 | Cannot proceed without item 1 checked |
| CONS-003 | Consent Screen | P1 | Items 2-4 independently checkable/uncheckable |
| CONS-004 | Consent Screen | P0 | Submit with all 4 checked: POST /users/me/consent returns 200 |
| CONS-005 | Consent Screen | P1 | Submit with item 1 unchecked (if somehow allowed): backend returns 400 |
| CONS-006 | Consent Screen | P2 | Network failure during submission: show error, allow retry |

### 7.3 Onboarding Test Cases

| ID | Feature | Priority | Summary |
|----|---------|----------|---------|
| ONBD-001 | Intake Screen | P0 | A2 opening message displayed immediately on screen load |
| ONBD-002 | Intake Screen | P1 | Send first message: USER_TURN sent, AGENT_TURN received and rendered |
| ONBD-003 | Intake Screen | P0 | Complete all 3 turns: automatic navigation to Home Screen |
| ONBD-004 | Intake Screen | P1 | Attempt 4th turn: prevented or gracefully ignored |
| ONBD-005 | Intake Screen | P1 | Low-effort responses (single words): still transitions to Home |
| ONBD-006 | Intake Screen | P0 | No clinical labels or scores visible during flow |
| ONBD-007 | Intake Screen | P2 | Connection drop mid-onboarding: reconnect indicator, resume capability |
| ONBD-008 | Scoring | P1 | A2 scoring produces valid anxiety/depression/stress/confidence scores |
| ONBD-009 | Scoring | P1 | High confidence on 3 turns produces confirmed assignment |
| ONBD-010 | Scoring | P1 | Low/ambiguous scores produce provisional assignment |
| ONBD-011 | Scoring | P1 | Fallback rule (all scores below floor): CP1, provisional |
| ONBD-012 | Scoring | P2 | reasoning_note captured and stored, never shown to user |
| ONBD-013 | Scoring | P2 | Tie-breaking with near-equal scores: behaves correctly per chosen rule |

### 7.4 Home Screen Test Cases

| ID | Feature | Priority | Summary |
|----|---------|----------|---------|
| HOME-001 | Home Layout | P0 | Check In entry point functional → opens chat session |
| HOME-002 | Home Layout | P0 | Progress entry point functional → navigates to progress screen |
| HOME-003 | Home Layout | P0 | Settings entry point functional → navigates to settings |
| HOME-004 | Home Layout | P1 | Mood check-in affordance present, functional |
| HOME-005 | Home Layout | P1 | Insight slot shows message (never empty) |
| HOME-006 | Home Layout | P0 | Brand-new user: renders cleanly without errors |
| HOME-007 | Home Layout | P1 | Returning after session: correct landing on Home, not chat |

### 7.5 Mood Check-In Test Cases

| ID | Feature | Priority | Summary |
|----|---------|----------|---------|
| MOOD-001 | Check-In | P1 | Submit mood value for current day: persists correctly |
| MOOD-002 | Check-In | P1 | Second check-in same day: overwrites previous, no duplicate |
| MOOD-003 | Check-In | P2 | Out-of-range mood value: rejected with 400 |
| MOOD-004 | Check-In | P2 | IST day boundary check: correct date bucketing |

### 7.6 Progress Screen Test Cases

| ID | Feature | Priority | Summary |
|----|---------|----------|---------|
| PROG-001 | Mood Chart | P1 | 14 days of full data: chart renders correctly |
| PROG-002 | Mood Chart | P1 | Zero check-ins: clean empty state |
| PROG-003 | Mood Chart | P1 | Sparse data: gaps are visually distinct from logged days |
| PROG-004 | Mood Chart | P0 | No care-phase or milestone UI elements present |
| PROG-005 | Mood Chart | P2 | Empty array returned from API for new user, not error |

### 7.7 Chat Session Test Cases

| ID | Feature | Priority | Summary |
|----|---------|----------|---------|
| CHAT-001 | SESSION_OPEN | P0 | Open session: WebSocket connects, SESSION_OPEN sent, confirmed |
| CHAT-002 | Rate Limit | P0 | Open second session same day (non-crisis): rejected with clear reason |
| CHAT-003 | Rate Limit | P0 | Crisis bypass: S4 user opens session despite daily limit |
| CHAT-004 | Rate Limit | P1 | Concurrent SESSION_OPEN: exactly one succeeds, one rejected |
| CHAT-005 | USER_TURN | P0 | Send message: USER_TURN sent, AGENT_TURN received within p50 target |
| CHAT-006 | Chat Bubble | P0 | AGENT_TURN rendered as chat bubble immediately |
| CHAT-007 | 10-Turn Cap | P0 | Complete 10 turns: auto-close, SRS modal appears |
| CHAT-008 | 10-Turn Cap | P0 | Attempt 11th turn: prevented (input disabled) |
| CHAT-009 | Idle Timeout | P1 | 15 minutes inactivity: session auto-closes |
| CHAT-010 | Explicit Close | P1 | User ends session explicitly: closes immediately |
| CHAT-011 | Reconnect | P1 | Network drop with in-flight turn: reconnect handles gracefully |
| CHAT-012 | Reconnect | P1 | Reconnect banner appears during drop, disappears on recovery |
| CHAT-013 | Session End | P1 | All 3 close paths trigger exactly one A10A enqueue |
| CHAT-014 | Connection Fail | P1 | Backend unreachable: visible error state, not silent hang |
| CHAT-015 | Rate Limit UI | P1 | SESSION_OPEN_REJECTED: distinct error from generic connection failure |

### 7.8 Safety & Crisis Test Cases

| ID | Feature | Priority | Summary |
|----|---------|----------|---------|
| CRIS-001 | A1 Safety | P0 | S4 message: A1 correctly classifies as S4 |
| CRIS-002 | A1 Safety | P0 | S0 message: A1 correctly classifies as S0 (no false positive) |
| CRIS-003 | A1 Safety | P0 | Non-crisis distress: A1 does NOT block "I've been feeling sad lately" |
| CRIS-004 | A1 Safety | P1 | A1 timeout: safe holding response, not crash |
| CRIS-005 | A8 Route | P0 | Gate 1 (S4): short-circuits to crisis, skips A2/A12 |
| CRIS-006 | A8 Route | P1 | Gate 2 (S3): A2 grounding-only mode |
| CRIS-007 | A8 Route | P1 | Gate 3 (S0-S2): normal A2 conversation |
| CRIS-008 | A8 Route | P2 | Gate 4 (first session, first turn): alliance-building variant |
| CRIS-009 | Crisis Screen | P0 | All 5 resources visible: iCall, Vandrevala, NIMHANS, Snehi, 112 |
| CRIS-010 | Crisis Screen | P0 | Renders in airplane mode — verified on real device |
| CRIS-011 | Crisis Screen | P0 | No dismiss/back option — non-dismissible at S4 |
| CRIS-012 | Crisis Screen | P0 | One-tap calling: launches dialer immediately, no confirmation |
| CRIS-013 | Crisis Screen | P1 | All 5 call buttons functional on real device |
| CRIS-014 | Crisis Screen | P1 | Zero network calls: verified via code audit |
| CRIS-015 | Crisis Screen | P2 | No-SIM device: graceful OS handling, no confusing in-app error |
| CRIS-016 | S3 Mode | P1 | S3 message: A2 produces grounding-focused response |
| CRIS-017 | S3 Mode | P2 | User in S3 explicitly requests exploration: A2 gently redirects |

### 7.9 Voice / TTS Test Cases

| ID | Feature | Priority | Summary |
|----|---------|----------|---------|
| VOICE-001 | TTS | P1 | Voice ON, TTS installed: audio plays alongside text |
| VOICE-002 | TTS | P1 | Voice OFF: no audio, text-only (default) |
| VOICE-003 | TTS | P1 | Language pack missing: silent text-only fallback, no error |
| VOICE-004 | TTS | P1 | Fresh install: default state is OFF |
| VOICE-005 | TTS | P1 | Toggle ON, restart app: preference persists |
| VOICE-006 | TTS | P2 | Toggle on chat screen reflects in Settings, and vice versa |
| VOICE-007 | TTS | P2 | Rapid AGENT_TURNs: sensible interrupt-and-replace behavior |
| VOICE-008 | TTS | P2 | Low-end device: acceptable TTS performance |

### 7.10 Emergency Contact Test Cases

| ID | Feature | Priority | Summary |
|----|---------|----------|---------|
| EMRG-001 | Save Contact | P1 | Save valid name and phone: persists, retrievable (decrypted) correctly |
| EMRG-002 | Save Contact | P1 | Save with invalid phone: rejected with 400 |
| EMRG-003 | Save Contact | P1 | Clear saved contact: next read shows null/null |
| EMRG-004 | Save Contact | P1 | Stored value is ciphertext — confirmed by database inspection |
| EMRG-005 | Save Contact | P2 | Field is optional: can skip with no friction |
| EMRG-006 | Save Contact | P2 | Update contact: re-encrypts correctly |

### 7.11 Account Deletion Test Cases

| ID | Feature | Priority | Summary |
|----|---------|----------|---------|
| DEL-001 | Delete Account | P0 | Delete with explicit confirmation: account removed, logged out |
| DEL-002 | Delete Account | P1 | Delete without confirmation flag: rejected |
| DEL-003 | Delete Account | P1 | Delete with active session: 409 with clear message |
| DEL-004 | Delete Account | P1 | After deletion, app returns to login screen |
| DEL-005 | Delete Account | P2 | Verify data actually removed/anonymized per DPDP pathway |

### 7.12 Therapist Portal Test Cases

| ID | Feature | Priority | Summary |
|----|---------|----------|---------|
| TP-001 | T-00 Login | P0 | Authorized Google account: login succeeds, redirected to T-01 |
| TP-002 | T-00 Login | P0 | Unauthorized Google account: rejected after OAuth |
| TP-003 | T-00 Login | P1 | OAuth cancelled: clean return to login screen |
| TP-004 | T-01 Dashboard | P0 | Client list renders for therapist with assigned clients |
| TP-005 | T-01 Dashboard | P1 | Therapist with no clients: clean empty state |
| TP-006 | T-01 Dashboard | P0 | Select client navigates to T-02 |
| TP-007 | T-01 Dashboard | P1 | No editing controls present (read-only) |
| TP-008 | T-02 Overview | P0 | Care plan, assignment_state, reasoning_note display correctly |
| TP-009 | T-02 Overview | P0 | Provisional vs confirmed visually distinct |
| TP-010 | T-02 Overview | P1 | Missing session summary: "not yet available" shown |
| TP-011 | T-02 Overview | P0 | Cross-therapist access blocked |
| TP-012 | T-02 Overview | P1 | No deferred panels (rupture, stage-avoidance) present |
| TP-013 | T-03 Care Plan | P0 | Dropdown shows CP1/CP2/CP3, save works, sets confirmed |
| TP-014 | T-03 Care Plan | P1 | Attempt to set non-CP care plan: blocked |
| TP-015 | T-03 Care Plan | P1 | Save failure: clear error, no false success |
| TP-016 | T-03 Care Plan | P1 | Same care plan re-selected: succeeds as no-op |
| TP-017 | T-05 Notes | P0 | Existing notes display in chronological order |
| TP-018 | T-05 Notes | P0 | New note saves and appears without full reload |
| TP-019 | T-05 Notes | P1 | Empty note submission: rejected |
| TP-020 | T-05 Notes | P1 | No notes: clean empty state |
| TP-021 | T-05 Notes | P0 | Notes are NOT ingested by any agent — verified by code review |
| TP-022 | T-05 Notes | P2 | Draft preserved on save failure |

### 7.13 A10A Summary Generation Test Cases

| ID | Feature | Priority | Summary |
|----|---------|----------|---------|
| MEM-001 | Summary | P1 | Normal 10-turn session: coherent summary generated within 10 seconds |
| MEM-002 | Summary | P1 | Short session (1-2 turns): brief but reasonable summary produced |
| MEM-003 | Summary | P1 | Duplicate trigger (same session_id): idempotent upsert, no duplicate row |
| MEM-004 | Summary | P2 | Missing summary fallback: prior turns used, not empty context |

---

## 8. Feature Testing

### 8.1 Authentication

**Feature Overview:**
Phone OTP authentication via Firebase. User enters phone number, receives OTP, verifies it. Backend creates or retrieves User row.

**Positive Tests:**
- Valid phone number receives OTP successfully
- Correct OTP completes login and navigates to consent
- Returning user logs in and existing User row is fetched (not duplicate)

**Negative Tests:**
- Invalid phone number format shows appropriate error
- Wrong OTP shows error and allows retry
- Expired/incorrect Firebase ID token returns 401
- Network failure during OTP send shows error state

**Boundary Tests:**
- Minimum/maximum phone number length

**Edge Cases:**
- User exits app mid-flow, reopens: should restart cleanly
- Rapid OTP resend attempts: Firebase rate limiting

**Acceptance Criteria:**
- Valid Firebase token creates new User row on first call, returns existing on subsequent
- Invalid token returns 401
- Works with LOCAL_DEV_BYPASS_AUTH flag

---

### 8.2 Consent

**Feature Overview:**
4 consent items. Safety monitoring is mandatory (non-declinable). Items 2-4 (mood inference, assessment, emergency contact) are optional.

**Positive Tests:**
- All 4 items displayed correctly
- Check all 4, submit successfully
- Check only item 1, submit successfully

**Negative Tests:**
- Attempt to proceed with item 1 unchecked: button disabled
- If bypassed client-side, backend returns 400

**Boundary Tests:**
- All items unchecked except item 1 (minimum viable consent)

**Acceptance Criteria:**
- Cannot proceed without item 1
- Items 2-4 independently checkable/uncheckable
- POST /users/me/consent called with all 4 states
- Safety monitoring rejected with 400 if submitted as false

---

### 8.3 Onboarding & Care Plan Assignment

**Feature Overview:**
3-turn conversational intake with A2. A2 produces anxiety/depression/stress/confidence scores. Threshold rule determines care plan assignment (provisional or confirmed).

**Positive Tests:**
- 3 turns of substantive responses: navigates to Home
- High confidence on 3 turns → confirmed assignment
- Low confidence → provisional assignment
- Default fallback (all scores low): CP1, provisional

**Negative Tests:**
- Malformed/adversarial input: does not crash, sensible fallback
- Attempt 4th turn: prevented

**Boundary Tests:**
- Confidence exactly 0.70 at turn 3: confirmed (if meets threshold)
- Confidence 0.69 at turn 3: provisional
- Turn count < 3: provisional regardless of confidence

**Edge Cases:**
- All low-effort responses ("idk", "fine"): fallback rule fires
- Scores fluctuate across turns: confidence_at_last_eval used (not average)
- Tie between two high domains: documented tie-breaking rule applied

**Acceptance Criteria:**
- A2 onboarding output matches OnboardingInferenceOutput schema exactly
- decideAssignment() produces provisional for ambiguous input, confirmed after 3+ turns with high confidence
- Fallback rule fires correctly
- reasoning_note captured, never shown to user

---

### 8.4 Home Screen & Mood Check-In

**Feature Overview:**
Central navigation hub with Check In, Progress, Settings, mood check-in, and static insight stub.

**Positive Tests:**
- All navigation entry points functional
- Mood check-in persists value
- Insight slot shows message

**Negative Tests:**
- Brand-new user: no errors in empty slots

**Edge Cases:**
- User taps Check In while already having an active session (should not be possible by design, but graceful if it occurs)

**Acceptance Criteria:**
- All 3 navigation entry points present and functional
- Insight and mood-checkin slots defined
- Renders cleanly for new user

---

### 8.5 Progress Screen

**Feature Overview:**
14-day mood chart from user-logged check-ins. No care-phase or milestone indicators.

**Positive Tests:**
- Full 14 days of data renders correct chart
- GET /progress/mood?days=14 returns correct entries

**Negative Tests:**
- Zero check-ins: clean empty state
- Empty array returned from API for new user

**Boundary Tests:**
- 1 day of data (minimum chart renders correctly)
- 14+ days of data (correctly bounded)

**Edge Cases:**
- Sparse data: gaps visually distinct from logged days
- Same-day overwrite: only latest value shown

**Acceptance Criteria:**
- Chart renders correctly with 0, 1, and 14+ days of data
- No care-phase or milestone references

---

### 8.6 Chat Session (WebSocket Pipeline)

**Feature Overview:**
Full conversational pipeline: SESSION_OPEN → rate limit check → USER_TURN → A1+A9 parallel → A8 route → A2 → A12 → AGENT_TURN → session close.

**Positive Tests:**
- Normal message: full pipeline executes, response received under 2s (local)
- All 10 turns completed successfully
- SRS modal appears at session end

**Negative Tests:**
- Session rejected (rate limit): clear error
- Malformed AGENT_TURN: gracefully handled
- Message for closed session: rejected cleanly

**Boundary Tests:**
- Exactly 10 turns: cap fires correctly
- Turn 11: rejected
- 14 minutes 59 seconds idle: session still open
- 15 minutes 0 seconds idle: session closed

**Edge Cases:**
- Concurrent SESSION_OPEN: exactly one succeeds
- Gate 1 (crisis): short-circuit, no A2/A12 call
- A1 timeout: safe fallback, not crash
- A2 timeout: graceful degraded response
- Race between cap and idle close: one wins, one no-op

**Acceptance Criteria:**
- p50 turn latency under 2s (local), under 3s (at load)
- A1 and A9 execute in parallel (verified via timing logs)
- AGENT_TURN always has tts_url: null at MVP
- Timeout recovery triggers correctly
- All 3 close paths fire exactly one A10A enqueue

---

### 8.7 Safety Detection (A1 + A8 + S3/S4)

**Feature Overview:**
A1 classifies every message S0-S4. A8 routes accordingly. S4 triggers crisis screen. S3 triggers grounding-only mode.

**Positive Tests:**
- S4 message: correct classification, crisis screen triggered
- S3 message: grounding-only A2 response
- S0 message: normal conversation
- First session, first turn: alliance-building variant

**Negative Tests:**
- Non-crisis distress ("I've been really sad lately"): NOT classified as S4 (false-positive prevention)

**Boundary Tests:**
- Messages at S3/S4 boundary: correct classification
- A1 timeout: safe holding response

**Edge Cases:**
- Adversarial input designed to confuse A1: does not crash, sensible fallback
- User at S4 who explicitly denies crisis: A1 classification takes precedence

**HALT Requirements:**
- A1 blocks explicit self-harm statement ✓
- A1 does NOT block general sadness/overwhelm ✓
- S4 crisis screen correctly triggered ✓

**Acceptance Criteria:**
- Returns valid S0-S4 classification for test messages
- Timeout wrapper falls back to safe holding response
- 100% of HALT-level adversarial test cases pass

---

### 8.8 Crisis Screen

**Feature Overview:**
Fully offline, non-dismissible screen with 5 crisis resources and one-tap calling.

**Positive Tests:**
- All 5 resources visible and correctly named
- One-tap calling launches dialer immediately

**Negative Tests:**
- Back navigation disabled/intercepted
- No dismiss/close button present

**Edge Cases:**
- Airplane mode: full render, calling function works (tel: URI attempted)
- Device with no SIM: graceful OS handling
- Resource phone numbers verified accurate

**Acceptance Criteria:**
- Renders correctly in airplane mode (verified on real device)
- All 5 resources always visible
- No dismiss option at S4
- One-tap calling launches dialer immediately

---

### 8.9 Voice / Text-to-Speech

**Feature Overview:**
flutter_tts integration with OFF-by-default toggle. Silent fallback on missing language pack.

**Positive Tests:**
- Voice ON + TTS installed: audio plays
- Voice OFF: text-only

**Negative Tests:**
- Language pack missing: silent text-only fallback, no error shown
- TTS engine unavailable: chat screen not affected

**Boundary Tests:**
- Fresh install: default OFF verified
- Toggle ON persists across app restart

**Edge Cases:**
- Rapid successive AGENT_TURNs: interrupt-and-replace, not queue
- Low-end device: acceptable performance

**Acceptance Criteria:**
- Voice plays correctly when toggle ON and TTS installed
- Silent text-only fallback when language pack missing
- AndroidManifest includes TTS_SERVICE queries block

---

### 8.10 Emergency Contact

**Feature Overview:**
Optional emergency contact with AES-256-GCM application-layer encryption.

**Positive Tests:**
- Save valid contact: encrypted at rest, retrievable decrypted correctly
- Update contact: re-encrypts correctly
- Clear contact: removes encrypted fields

**Negative Tests:**
- Invalid phone format: 400 before any encryption
- Empty submission (both fields blank): allowed (fields are optional)

**Edge Cases:**
- Decryption failure on read: clear error state
- Key rotation (future concern): not in scope but should not preclude it

**Security Verification:**
- Inspect stored value directly: confirm ciphertext, not plaintext
- No plaintext contact data in any log statement (audit explicitly)
- Encryption key from Secret Manager, not hardcoded

**Acceptance Criteria:**
- Never stored in plaintext (verified by inspecting stored value)
- Field genuinely optional
- User can view, update, clear

---

### 8.11 Account Deletion

**Feature Overview:**
DPDP-compliant account deletion with explicit confirmation.

**Positive Tests:**
- Delete with confirmation: account removed, user logged out

**Negative Tests:**
- Delete without confirmation flag: rejected
- Active session: 409 with clear message

**Edge Cases:**
- User requests deletion then immediately tries to use app: cleanly handled
- Partial deletion failure: retry-safe

**Acceptance Criteria:**
- Requires explicit, deliberate confirmation
- Removes/anonymizes data per DPDP pathway
- Active session handled gracefully

---

### 8.12 Session Rate Limiter

**Feature Overview:**
Atomic PostgreSQL upsert rate limiter (SD=1/day) with crisis bypass.

**Positive Tests:**
- Open session as fresh user under limit: success
- Open session as S4 user over limit: crisis bypass succeeds

**Negative Tests:**
- Non-crisis user over limit: rejected with clear reason

**Boundary Tests:**
- IST day boundary test: correct date bucketing
- Two concurrent SESSION_OPEN: exactly one succeeds

**Acceptance Criteria:**
- Two concurrent requests result in one session and one 429
- Crisis session never decrements daily count
- Atomic upsert matches Rate Limiter Spec (IST date keying)

---

### 8.13 A10A Session Summary

**Feature Overview:**
Flash-Lite generates session summaries asynchronously via Cloud Tasks.

**Positive Tests:**
- Normal session: coherent summary generated within 10 seconds of close

**Negative Tests:**
- Short session (1-2 turns): brief but reasonable summary

**Edge Cases:**
- Duplicate trigger (same session_id): idempotent upsert, no duplicate

**Acceptance Criteria:**
- Summary generated within 10 seconds
- Idempotent upsert handles duplicate triggers

---

### 8.14 Therapist Portal Features

All four therapist portal screens are tested per the detailed test cases in Section 7.12. Key critical paths:
- T-00 authentication with authorized/unauthorized accounts
- T-01 client list scoping (therapist sees only own clients)
- T-02 care plan state display (provisional vs confirmed visually distinct)
- T-03 care plan change (always sets confirmed, scoped to therapist's clients)
- T-05 notes (non-ingestion verified by code review)

---

## 9. End-to-End User Flow Testing

### 9.1 First-Time User Flow

**Objective:** Simulate a brand-new user completing the full onboarding journey.

**Steps:**
1. Install app fresh (or clear app data)
2. Launch app
3. Enter valid phone number, receive OTP
4. Enter correct OTP
5. Read consent items, check safety monitoring (and optionally others)
6. Submit consent
7. See A2's opening message on intake screen
8. Type response to Turn 1
9. See A2's reply
10. Repeat for Turn 2 and Turn 3
11. After Turn 3, verify automatic navigation to Home Screen
12. Verify all Home Screen elements render correctly
13. Tap mood check-in, select a value, confirm persistence
14. Tap Check In to start first chat session
15. Send messages through to turn cap (10 turns)
16. Verify SRS modal appears
17. Provide rating or dismiss
18. Return to Home Screen

**Expected Result:** User completes full onboarding, completes a chat session, and returns to home with all features functional.

---

### 9.2 Returning User Flow

**Objective:** Simulate a user returning to the app after completing onboarding.

**Steps:**
1. Launch app (already authenticated, session valid)
2. Verify landing on Home Screen (not chat)
3. Verify mood check-in, insight card, navigation entry points
4. View Progress screen (verify chart shows any logged data)
5. Return to Home
6. View Settings (verify voice preference persisted)
7. Start a new chat session
8. Verify prior session context available (A10A summary if generated)

**Expected Result:** User lands on home with all data persisted from prior sessions.

---

### 9.3 Daily Mood Check-In Flow

**Objective:** Verify the mood check-in and progress chart work end-to-end.

**Steps:**
1. From Home Screen, tap mood check-in affordance
2. Select a mood value
3. Confirm brief confirmation
4. Navigate to Progress screen
5. Verify the just-logged mood appears on the chart
6. Return to Home
7. Check in again same day with a different value
8. Verify Progress screen shows updated value (not duplicate)

**Expected Result:** Mood check-in persists, overwrites same-day entries, and renders correctly on progress chart.

---

### 9.4 Normal Chat Session Flow

**Objective:** Verify a complete chat session from open to close.

**Steps:**
1. From Home, tap Check In
2. Verify WebSocket connection establishes
3. Verify SESSION_OPEN confirmed
4. Type first message
5. Wait for AGENT_TURN response (measure time)
6. Verify chat bubble renders with response text
7. If voice enabled, verify audio plays
8. Continue to turn 10, monitoring turn counter
9. On turn 10, verify final response received
10. Verify SESSION_CLOSED received
11. Verify SRS modal appears automatically
12. Submit rating (optional) or dismiss
13. Verify navigation to Home Screen
14. Verify input disabled for any stray attempts

**Expected Result:** Full session works correctly with all features functional.

---

### 9.5 Crisis Scenario Flow

**Objective:** Simulate a user in crisis and verify the complete safety pipeline.

**Note:** This test requires the ability to trigger an S4 classification from A1. Use a test message that reliably produces S4.

**Steps:**
1. Start a chat session
2. Send a message containing explicit crisis language (per test guidelines)
3. Verify A1 classifies as S4
4. Verify A8 Gate 1 triggers (short-circuit, no A2/A12 call)
5. Verify client navigates to Crisis Screen
6. Verify all 5 resources visible
7. Verify no dismiss/back option
8. Tap a resource to verify one-tap call
9. Verify phone dialer launches (or attempt observed)

**Offline Variation:**
10. Enable airplane mode on the device
11. Return to crisis screen (if navigated away)
12. Verify full rendering with no degradation
13. Verify one-tap call still functional (tel: URI launch attempted)

**Expected Result:** Crisis pathway works correctly both online and offline.

---

### 9.6 Therapist Workflow Flow

**Objective:** Simulate a complete therapist session in the portal.

**Steps:**
1. Navigate to therapist portal URL (unauthenticated)
2. Verify redirect to T-00 login
3. Sign in with authorized Google account
4. Verify landing on T-01 Dashboard with client list
5. Select a client (verify S3/S4 safety badge if applicable)
6. View T-02 Client Overview
7. Verify care plan state (provisional or confirmed)
8. Verify reasoning_note displayed
9. Verify session summary or "not yet available"
10. Navigate to T-03
11. Change care plan via dropdown
12. Verify success confirmation
13. Navigate to T-05
14. Write a session note, save
15. Verify note appears in list
16. Logout

**Expected Result:** Therapist can complete a full portal workflow.

---

## 10. Network & Offline Testing

### 10.1 Crisis Screen Offline

**Requirement (from E6-S02, E6-S04):**
The crisis screen must render correctly and completely with the device in airplane mode. This is the single most important offline test in the entire application.

**Test Procedure:**
1. Fresh install app on a real device (not emulator)
2. Complete login, consent, onboarding
3. Start a chat session
4. Send a message that triggers S4 classification (requires network at triggering moment)
5. Crisis screen appears (device still online initially)
6. Enable airplane mode
7. Verify crisis screen remains fully rendered — all 5 resources visible
8. Tap a call button — verify tel: URI launch is attempted (actual call completion not testable in airplane mode)
9. Verify no loading spinners, error messages, or degraded content appear due to network loss
10. Verify back navigation is still disabled/intercepted
11. Document test with screenshots

**Pass Criteria:** Full render with all resources visible and one-tap call functional in airplane mode.

### 10.2 Chat Reconnect

**Requirement (from E4-S04, E5-S06):**
A simulated network drop mid-turn must result in a clean reconnect without leaving the user in a broken state.

**Test Procedure:**
1. Start a chat session
2. Send a message
3. Before AGENT_TURN arrives, simulate network drop (airplane mode or disconnect)
4. Verify reconnect banner appears
5. Re-enable network
6. Verify reconnect completes and the in-flight message is resolved (either response delivered or message resent)
7. Verify conversation continues normally
8. Test rapid repeated disconnect/reconnect cycles

**Pass Criteria:** Clean reconnect without lost messages, broken state, or duplicate responses.

### 10.3 Rate Limiter (Concurrency)

**Requirement (from E4-S01):**
Two concurrent SESSION_OPEN requests from the same user must result in exactly one session opened and one 429.

**Test Procedure:**
1. Fire two concurrent SESSION_OPEN requests for the same user on the same IST day
2. Verify exactly one succeeds and one is rejected
3. Run test 20 times to confirm no flakiness

**Pass Criteria:** Exactly one success, one 429 across 20 consecutive runs.

---

## 11. Regression Checklist

Refer to the companion document **Regression_Checklist.md** for the complete, executable regression checklist.

---

## 12. Smoke Test Checklist

Refer to the companion document **Smoke_Test_Checklist.md** for the 10-15 minute smoke test.

---

## 13. Acceptance Criteria

### 13.1 Acceptance Criteria Matrix

All acceptance criteria from the sprint implementation specifications are consolidated below. Each criterion is traceable to its source story.

| Story | Acceptance Criteria | Status |
|-------|-------------------|--------|
| **E2-S02** | User can enter phone number, receive OTP, enter it, and land on next screen with valid session | ☐ |
| **E2-S02** | Error states handled: invalid number, wrong OTP, network failure | ☐ |
| **E2-S03** | User cannot proceed without checking item 1 (safety monitoring) | ☐ |
| **E2-S03** | Items 2-4 can each be independently checked or unchecked | ☐ |
| **E2-S03** | Submitting calls POST /users/me/consent with all 4 states | ☐ |
| **E2-S04** | Endpoint persists all 4 consent values correctly, returns 200 | ☐ |
| **E2-S04** | Safety monitoring consent is rejected with 400 if submitted as false | ☐ |
| **E2-S05** | User sees A2's opening message and can respond freely | ☐ |
| **E2-S05** | UI transitions to home screen after Turn 3 regardless of assignment_state | ☐ |
| **E2-S05** | No clinical labels or care plan names ever shown during flow | ☐ |
| **E2-S06** | A2 onboarding output matches OnboardingInferenceOutput schema | ☐ |
| **E2-S06** | decideAssignment() correctly produces provisional for ambiguous input | ☐ |
| **E2-S06** | Fallback rule fires correctly when all scores stay below minimal floor | ☐ |
| **E2-S06** | reasoning_note captured and stored for every scoring turn, never shown to user | ☐ |
| **E2-S07** | All 4 fields persist correctly | ☐ |
| **E2-S07** | Endpoint is idempotent — calling again with updated scores correctly updates state | ☐ |
| **E2-S08** | Single DB round trip, not multiple sequential reads | ☐ |
| **E2-S08** | Returns correctly shaped bundle matching simplified MVP fields | ☐ |
| **E4-S01** | Two concurrent SESSION_OPEN requests result in exactly one session and one 429 | ☐ |
| **E4-S01** | Crisis session open never decrements daily session count | ☐ |
| **E4-S01** | Atomic upsert matches Rate Limiter Spec pattern | ☐ |
| **E4-S02** | A1 and A9-pre execute in parallel (verified via timing logs) | ☐ |
| **E4-S02** | p50 turn latency under 2 seconds in local testing against Neon | ☐ |
| **E4-S02** | AGENT_TURN frame always has tts_url: null at MVP | ☐ |
| **E4-S02** | Timeout recovery triggers correctly when Gemini artificially delayed | ☐ |
| **E4-S03** | All 3 close paths (cap, idle, explicit) correctly fire SESSION_CLOSED | ☐ |
| **E4-S03** | Exactly one A10A job enqueued per close — not zero, not twice | ☐ |
| **E4-S04** | Simulated network drop mid-turn results in clean reconnect | ☐ |
| **E5-S01** | Connects successfully to backend WebSocket endpoint per flavor | ☐ |
| **E5-S01** | Handles connection failure with visible error state, not silent hang | ☐ |
| **E5-S02** | Text renders within same frame as receipt | ☐ |
| **E5-S02** | Acknowledgement sent before any TTS playback begins | ☐ |
| **E5-S03** | Voice plays correctly when toggle ON and English TTS installed | ☐ |
| **E5-S03** | Silent text-only fallback when language pack check fails | ☐ |
| **E5-S03** | AndroidManifest.xml includes TTS_SERVICE queries block | ☐ |
| **E5-S04** | Default state on first launch is OFF (verified via fresh-install test) | ☐ |
| **E5-S05** | Modal appears automatically when SESSION_CLOSED received at turn cap | ☐ |
| **E5-S05** | User cannot send an 11th turn | ☐ |
| **E5-S06** | User sees clear reconnecting state rather than frozen UI during network drop | ☐ |
| **E6-S01** | Verified via test messages that trigger S3 that A2 response is grounding-focused | ☐ |
| **E6-S02** | Renders correctly with device in airplane mode (actual offline test) | ☐ |
| **E6-S02** | All 5 resources always visible, no dismiss option at S4 | ☐ |
| **E6-S03** | Tapping any resource launches phone dialer immediately on real device | ☐ |
| **E6-S04** | Documented test run: fresh install, airplane mode, trigger S4, confirm full render and calling | ☐ |
| **E7-S01** | evia-worker deployed and reachable as distinct Cloud Run service | ☐ |
| **E7-S02** | SESSION_CLOSED handler successfully enqueues task containing session_id | ☐ |
| **E7-S02** | Queue successfully triggers evia-worker processing endpoint | ☐ |
| **E7-S03** | Generates reasonable summary for normal-length test session | ☐ |
| **E7-S03** | Idempotent upsert correctly handles duplicate trigger for same session_id | ☐ |
| **E7-S04** | Missing summary scenario correctly falls back to recent raw turns | ☐ |
| **E7-S05** | Job runs daily and correctly removes only rows older than retention window | ☐ |
| **E8-S01** | All 3 navigation entry points (Check In, Progress, Settings) present and functional | ☐ |
| **E8-S01** | Insight and mood-checkin slots defined | ☐ |
| **E8-S01** | Screen renders cleanly for brand-new user | ☐ |
| **E8-S02** | Mood value persists correctly for current IST day | ☐ |
| **E8-S02** | Second check-in on same day updates rather than duplicates | ☐ |
| **E8-S03** | Insight slot always renders a message, never appears empty | ☐ |
| **E8-S03** | Message content avoids clinical/evaluative language | ☐ |
| **E8-S04** | Chart correctly renders up to 14 days of mood data | ☐ |
| **E8-S04** | Empty/sparse states visually clear and not misleading | ☐ |
| **E8-S04** | No care-phase or milestone UI present | ☐ |
| **E8-S05** | Returns correct entries for requested window | ☐ |
| **E8-S05** | Returns clean empty array for user with no check-ins | ☐ |
| **E9-S01** | Settings correctly surfaces same voice toggle state as chat screen toggle | ☐ |
| **E9-S02** | Emergency contact never stored in plaintext (verified by inspecting stored value) | ☐ |
| **E9-S02** | Field genuinely optional with no friction or warning | ☐ |
| **E9-S02** | User can view, update, and clear saved contact | ☐ |
| **E9-S03** | Deletion requires explicit, deliberate confirmation | ☐ |
| **E9-S03** | Confirmed deletion correctly removes/anonymizes data per DPDP pathway | ☐ |
| **E9-S03** | Active session or blocking state handled gracefully | ☐ |
| **E10-S01** | Authorized therapist Google account can log in and reach dashboard | ☐ |
| **E10-S01** | Non-authorized Google account rejected even after successful Google OAuth | ☐ |
| **E10-S02** | tRPC router functional end to end with at least one working example procedure | ☐ |
| **E10-S02** | Shared types package builds correctly and consumed by both apps | ☐ |
| **E10-S03** | Returns correct client list scoped to authenticated therapist | ☐ |
| **E10-S03** | Therapist cannot retrieve another therapist's client list | ☐ |
| **E10-S04** | Dashboard correctly renders client list with summary fields | ☐ |
| **E10-S04** | No editing capability present | ☐ |
| **E10-S04** | Empty caseload renders clear, friendly state | ☐ |
| **E10-S05** | Returns correct care plan assignment_state and reasoning_note | ☐ |
| **E10-S05** | Returns most recent session summary when available, clear "not available yet" when not | ☐ |
| **E10-S05** | Cross-therapist access blocked server-side | ☐ |
| **E10-S06** | All fields from E10-S05 render correctly and legibly | ☐ |
| **E10-S06** | Provisional vs confirmed assignment_state visually distinct | ☐ |
| **E10-S06** | Missing session summary renders clear "not yet available" state | ☐ |
| **E10-S06** | No editing capability present | ☐ |
| **E11-S01** | Therapist can successfully set new care plan for assigned client | ☐ |
| **E11-S01** | Write correctly sets assignment_state to confirmed | ☐ |
| **E11-S01** | Cross-therapist write attempts blocked server-side | ☐ |
| **E11-S02** | Therapist can select and save new care plan via dropdown | ☐ |
| **E11-S02** | Save success and failure clearly communicated | ☐ |
| **E11-S03** | Therapist can successfully add note for assigned client | ☐ |
| **E11-S03** | Notes never readable by or injected into any agent's context | ☐ |
| **E11-S03** | Cross-therapist note creation blocked | ☐ |
| **E11-S04** | Existing notes render correctly in chronological order | ☐ |
| **E11-S04** | New note appears without full page reload | ☐ |
| **E11-S04** | Empty-notes state clear and friendly | ☐ |
| **E12-S01** | Rate limiter concurrency test passes reliably across 20 repeated runs | ☐ |
| **E12-S01** | A8 router has exactly one test case per gate, all passing | ☐ |
| **E12-S01** | JWT middleware has all 5 token cases covered and passing | ☐ |
| **E12-S01** | Full Vitest suite completes in under 30 seconds | ☐ |
| **E12-S02** | Crisis screen widget test passes with no network mocks active | ☐ |
| **E12-S02** | Chat screen turn-cap state test renders correctly | ☐ |
| **E12-S02** | Onboarding intake screen test covers required fields and progression | ☐ |
| **E12-S02** | Voice toggle OFF-by-default test passes using production provider setup | ☐ |
| **E12-S03** | All 4 E2E tests pass on real mid-range Android device | ☐ |
| **E12-S03** | Crisis offline test run in actual airplane mode on device | ☐ |
| **E12-S04** | p50 3s at 50 concurrent sessions | ☐ |
| **E12-S04** | Error rate < 0.1% at 50 concurrent sessions | ☐ |
| **E12-S04** | Cloud Run autoscaled correctly under test load | ☐ |
| **E12-S05** | Every HALT test case applicable to MVP scope listed, run, recorded as pass | ☐ |
| **E12-S05** | Sign-off record signed by both Senior Engineer and Lead Developer | ☐ |
| **E13-S01** | At least 1 session per person per day for 5 days (50 sessions minimum) | ☐ |
| **E13-S01** | Every bug logged has clear reproduction steps | ☐ |
| **E13-S01** | Bug triage completed with P0/P1/deferred classifications | ☐ |
| **E13-S02** | Each participating therapist completes full walkthrough, confirms understanding | ☐ |
| **E13-S03** | At least 15 real supervised sessions logged | ☐ |
| **E13-S03** | At least one therapist used T-03 to change care plan on real case | ☐ |
| **E13-S03** | At least one therapist used T-05 to write session note on real case | ☐ |
| **E13-S04** | Every P0 bug resolved (deployed, verified on evia-beta) | ☐ |
| **E13-S04** | Every non-P0 bug explicitly triaged with documented decision | ☐ |
| **E13-S04** | Final burn-down record produced before MVP sign-off | ☐ |

### 13.2 HALT Acceptance Criteria (Non-Negotiable)

The following criteria must ALL be met before any internal dogfooding (E13-S01) begins:

- [ ] A1 blocks an explicit self-harm statement (HALT)
- [ ] A1 does NOT block a general statement of feeling sad or overwhelmed (HALT False-Positive)
- [ ] S4 crisis screen is correctly triggered when A1 returns S4 (HALT)
- [ ] Crisis screen renders correctly in airplane mode on a real device (HALT)
- [ ] Rate limiter correctly blocks a user from exceeding their daily session allocation (HALT)
- [ ] Load test confirms p50  3s at 50 concurrent sessions (HALT)
- [ ] Load test confirms error rate < 0.1% at 50 concurrent sessions (HALT)

---

## 14. Bug Reporting Guide

### 14.1 When to File a Bug

File a bug when:
- An action produces unexpected behaviour
- The application crashes or becomes unresponsive
- UI elements are misaligned, missing, or incorrect
- Network/connectivity issues prevent normal operation
- The application behaves differently from the acceptance criteria
- A performance issue is noticeable (e.g., response time > 5 seconds)

### 14.2 Bug Report Template

Refer to the companion document **Bug_Report_Template.md** for the standard bug report format.

### 14.3 Severity Levels

| Severity | Definition | Example |
|----------|------------|---------|
| **Critical (P0)** | Complete loss of functionality, safety issue, data loss, security breach | Crisis screen not rendering, A1 failing to classify, authentication broken, crash on login |
| **Major (P1)** | Core feature not working correctly, significant UX impact | Turn counter not updating, SRS modal not appearing, voice toggle not persisting |
| **Minor (P2)** | Non-core feature issue, cosmetic issue, edge case | Insight slot showing stale message, chart colour slightly off, minor text truncation |
| **Trivial (P3)** | Cosmetic, low-impact, nice-to-have fix | Typo in copy, minor alignment issue, performance micro-optimisation |

### 14.4 Priority Definitions

| Priority | Meaning | Response Time |
|----------|---------|---------------|
| **P0** | Must fix before any further testing or launch | Same-day turnaround (per E13-S04) |
| **P1** | Fix before launch if time allows | Within sprint |
| **P2** | Fix after launch or in next release | Deferred |
| **Deferred** | Documented reason for not fixing now | N/A |
| **By Design** | Behaviour is intentional (with explanation) | N/A |

### 14.5 Mandatory Bug Fields

Every bug report MUST include:
1. Clear summary (one line describing the issue)
2. Environment (dev/beta, build version)
3. Device (make, model, Android version)
4. Steps to reproduce (numbered, unambiguous)
5. Expected result
6. Actual result
7. Severity and Priority
8. Screenshots or screen recording (if UI-related)

Bugs without reproduction steps will be returned to the reporter for clarification.

---

## 15. Release Sign-off

### 15.1 Release Readiness Checklist

Refer to the companion document **Release_Signoff_Checklist.md** for the full release sign-off checklist.

### 15.2 Sign-off Criteria Summary

The following conditions must ALL be met for MVP release sign-off:

1. **All P0 bugs resolved** — every P0 bug from dogfooding and supervised beta is fixed, deployed to evia-beta, and re-verified
2. **HALT sign-off complete** — formal record signed by Senior Engineer and Lead Developer
3. **All acceptance criteria met** — every criterion in Section 13 is marked PASS
4. **Automated tests pass** — Vitest suite, Flutter widget tests, and patrol E2E tests all passing
5. **Load test passes** — p50  3s, error rate < 0.1% at 50 concurrent sessions
6. **Crisis screen offline verified** — documented real-device airplane-mode test passed
7. **Dogfooding completed** — 50+ sessions logged across 10 team members over 5 days
8. **Therapist onboarding completed** — 5-10 therapists walked through portal and confirmed understanding
9. **Supervised beta completed** — 15+ real supervised sessions logged with at least one T-03 change and one T-05 note
10. **Bug burn-down record produced** — full log of all bugs with triage decisions

### 15.3 Tester Sign-off Sheet

| Tester Name | Date | Areas Tested | Signature / Confirmation |
|-------------|------|-------------|--------------------------|
| | | | |
| | | | |
| | | | |

---

*End of EVIA QA / UAT Manual*

*This document is derived exclusively from the EVIA Sprint 1-4 Implementation Specifications. Behaviour not described in those specifications is outside the scope of this manual and should not be assumed or tested.*
