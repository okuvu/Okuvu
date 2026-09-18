# OKUVU — Architecture Overview

> Last updated: 18 Sep 2026 · Refreshed against the current codebase (previous version, June 2026, described a Gemini-only pipeline and a bounded 10-turn session model — both since replaced). Corresponds to Infrastructure Decision Record v3.0 plus the OKUVU v2.0 migration (`docs/okuvu-v2.0/`).

---

## The Big Picture

OKUVU is five things running together, all in one repo (`apps/*`), each deployed independently:

1. **A Flutter mobile app** (`apps/mobile`) — the end-user experience (Android-first for MVP). Ships via its own Flutter/app-store pipeline.
2. **A Node.js API** (`apps/api`) — the backend handling sessions, the agent pipeline, and data. Deploys to GCP Cloud Run via `cloudbuild.yaml` + `apps/api/Dockerfile`.
3. **A Node.js worker** (`apps/worker`) — background jobs (session summarization, memory extraction, beta-retention cleanup), triggered via Cloud Tasks. Its own Cloud Run service, its own `Dockerfile`, deployed separately from the API.
4. **A Next.js therapist portal** (`apps/therapist-portal`) — where licensed therapists supervise their clients. Deploys to its own Vercel project independently of everything else.
5. **A Next.js test harness** (`apps/test-harness`) — internal tooling for replaying pipeline scenarios and tracking regressions. Also its own, separate Vercel project.

**The repo is one pnpm workspace; the deployments are not.** Four independently-deployable services live in one checkout because the thing that actually needs to move together — `packages/shared-types` and `packages/prisma/schema.prisma` — needs to change in the same PR as the API/portal/mobile code that depends on it. See ADR-001b (`docs/adr/001-gcp-monorepo.md`) for the full reasoning; it was a deliberate decision, not an accident, and nothing about pilot readiness changes the calculus — if anything, a small team moving fast benefits more from atomic cross-app commits than a large one would.

---

## Infrastructure — GCP Only

Everything runs on GCP asia-south1 (Mumbai). There is no AWS. Deliberate decision (ADR-001a), primarily for DPDP 2026 compliance (single GCP DPA covers compute, database, storage, auth, and LLM inference).

| Component | Service | Notes |
|---|---|---|
| API | Cloud Run (`apps/api/Dockerfile`, `cloudbuild.yaml`) | |
| Worker | Cloud Run (`apps/worker/Dockerfile`, own build trigger) | Deployed separately from the API |
| Therapist portal | Vercel (own project) | |
| Test harness | Vercel (own project) | Internal tooling, not user-facing |
| Mobile | Flutter build → app store(s) | Own pipeline, outside GCP |
| Database | Cloud SQL PostgreSQL (staging/prod), Neon (local dev, branch per developer) | |
| Auth — end users | Firebase Authentication (phone/OTP) | |
| Auth — therapists | Firebase Authentication (Google OAuth) | |
| LLM — live chat pipeline (A1/A2/A9-pre/A9-post) | **OpenRouter — Llama-3.1-8B-instruct** (default) | Vertex AI/Gemini kept as a rollback path (`LLM_PROVIDER=gemini`) — see "LLM provider" below |
| LLM — worker jobs (session summary, memory extraction) | Vertex AI — Gemini | **Not yet migrated** to the OpenRouter dispatcher the live pipeline uses — see note below |
| TTS | **Client-side**, `flutter_tts` in the mobile app | Not a backend call — see "Text-to-speech" below |
| File storage | Cloud Storage + Cloud CDN | |
| Emergency-contact encryption | Secret Manager (holds an AES-256-GCM key) + application-layer encryption in `apps/api/src/crypto/emergency-contact-encryption.ts` | Not Cloud KMS envelope encryption — corrected from the previous version of this doc |
| Session/turn rate limiting | **Not implemented.** `REDIS_URL`/Memorystore is a provisioned env var with zero consumers in `apps/api/src` or `apps/worker/src` | Known open gap — every route accepts requests at whatever rate a client sends them |
| Async jobs | Cloud Tasks (queue, OIDC-authenticated worker endpoints) | Cloud Scheduler is provisioned for future cron jobs (push notifications) but nothing schedules against it yet |
| Secrets | Secret Manager | |
| CI/CD | GitHub Actions (`.github/workflows/`) for typecheck/test/lint; Cloud Build for API/worker container builds; Vercel's own CI for portal/test-harness | |
| Monitoring | Cloud Monitoring + Cloud Logging | |

### LLM provider — the actual current state

The previous version of this doc described Gemini/Vertex AI as the only LLM. That changed: **`apps/api/src/lib/generate-content.ts`** is the single call site all four live-pipeline agents (A1, A2, A9-pre, A9-post) import from. It dispatches on `LLM_PROVIDER` (`.env`):
- `openrouter` (default) → OpenRouter, model `meta-llama/llama-3.1-8b-instruct`.
- `gemini` → Vertex AI, same as before — kept as an explicit rollback path, not deleted.

**`apps/worker`'s async jobs (`lib/summary.ts`, `lib/memory-extraction.ts`) still import their own `vertex-ai.ts` directly** — they were never migrated to the shared dispatcher above. This means a session's live chat replies come from Llama by default today, but its post-close summary and memory extraction still come from Gemini. This is a real, current inconsistency, not a doc error — worth a deliberate decision (migrate the worker too, or intentionally keep summarization on a different/stronger model) rather than assuming it's already unified.

There is also a dead `apps/api/src/lib/llm-provider.ts` (a Sarvam-LLM stub, unused, not imported anywhere outside its own test) — not part of any live path, safe to ignore or remove.

### Text-to-speech — corrected

The previous version of this doc listed TTS as a backend pipeline stage ("A13, flutter_tts, no LLM — converts A2's response to audio") calling Sarvam Bulbul v2 server-side. **That's not what happens today.** `SARVAM_API_KEY`-gated code exists only as an unused stub; the actual TTS is entirely client-side — the `flutter_tts` package in `apps/mobile`'s `pubspec.yaml` speaks whatever text A2 returns, on-device. There is no backend TTS call in the live pipeline. Whether to revisit server-side TTS (for voice quality/consistency across devices) is an open product question, not a doc-accuracy one.

---

## Agent Architecture

The backend is not a single AI call — it is a pipeline of agents that run on every user turn. Updated from the previous version, which omitted A9-post (the output-review agent) from the diagram entirely and still described the pre-v2.0 alliance-building/turn-cap session model.

```
User message (USER_TURN)
        │
        ├──────────────┐
        ▼              ▼
   A9-pre           A1
   (governance      (safety gate — classifies
   pre-gate)         safety state S0-S4)
        │              │
        └──────┬───────┘
               ▼
        A8 (code-only, no LLM — 4-way router)
               │
   ┌───────────┼───────────────┬──────────────────┐
   ▼           ▼                ▼                  ▼
 crisis    deterministic-    governance-        normal
 (S4)      grounding (S3)    blocked            (S0-S2, not
   │           │              (A9-pre           blocked by
   │           │               Blocked,          governance)
   │           │               non-crisis)          │
   │           │                  │                  ▼
   │           │                  │                 A2
   │           │                  │            (sole therapeutic
   │           │                  │             agent for MVP)
   │           │                  │                  │
   │           │                  │                  ▼
   │           │                  │             A9-post
   │           │                  │          (output governance
   │           │                  │           review — approve/
   │           │                  │            block A2's reply)
   │           │                  │                  │
   └───────────┴──────────────────┴──────────────────┘
               ▼
        AGENT_TURN frame sent to client
               │
               ▼
   (client-side) flutter_tts speaks the reply — not a backend stage
```

- **Crisis (S4):** persists a real turn, but **no crisis-response content exists anywhere in the codebase** — the client receives a `CRISIS_SIGNAL` with no message. This is the single most severe known gap (see `docs/`-tracked open issues) — it's a clinical-content gap, not an engineering one; needs RCI-reviewed crisis copy before it can be wired in.
- **Deterministic-grounding (S3):** a real, persisted, static grounding reply. No A2 call, no A9-post review — same tier of determinism as crisis.
- **Governance-blocked:** A9-pre rejected the message on policy grounds but A1 found no crisis-level risk. A real, persisted, static policy-boundary reply via A2 in `mode='blocked'`. No A9-post review (there's no real model output to review).
- **Normal path:** the only path that calls the real A2 (Llama/Gemini) and then A9-post to review its output before it reaches the client. A9-post itself fails **closed** at safety state S2 (blocks + safe fallback) and fails **open** at every other state if it times out — a known, tracked risk under cold-start latency.

**Agents deferred to post-MVP:** A3–A7 (specialised therapeutic agents), A10B (offline insights), A11 (content library), A14 (assessment scoring), A15 (full care-plan domain coverage beyond CP1/CP2/CP3). A12 (a response-renderer agent) was built, never wired in, and formally deleted as dead code during the v2.0 migration.

**Async, post-session-close (in `apps/worker`, triggered via Cloud Tasks):**
- Session summarization (`lib/summary.ts`) — structured summary of the closed session.
- Memory extraction (`lib/memory-extraction.ts`) — updates `UserMemory` (recurring themes, life context, stressors) read back into future sessions' context.
- Both currently call Vertex AI/Gemini directly (see "LLM provider" above).

---

## Session model — continuous chat, not bounded sessions

The previous version of this doc (and the original MVP spec) described a hard 10-turn session cap with scripted closure at turns 8/9/10, plus daily-slot and idle-close limits gating whether a user could open a new session at all. **All of that machinery has been retired.** OKUVU v2.0 moved to continuous chat: no turn cap, no scripted "wrap up" behavior, no daily-slot rejection. The codebase is still `session_id`-keyed throughout rather than having a first-class "thread" concept with its own start/continue semantics and checkpoint summarization — that's a real architecture piece still ahead, not yet built.

---

## Database

Single PostgreSQL database (Neon for dev, Cloud SQL for staging/prod). ORM is Prisma; the full schema is in `packages/prisma/schema.prisma`. Selected models, grouped by what they own (not exhaustive — see the schema file for the current full list):

- **Identity & clinical assignment:** `User`, `Therapist`, `ClinicalConfig`, `TherapistClient` (the portal-side relationship, including `chat_access_granted` and `ended_at` for the care-relationship-ended flow), `InviteToken` (redemption codes — stored as a SHA-256 hash, not plaintext, as of this month).
- **Sessions & safety:** `SessionLog`, `Turn`, `SafetyState`, `GovernanceLog` (A9-pre/A9-post decisions, for audit).
- **Memory pipeline:** `SessionSummary` (worker's async output), `UserMemory`, `EngagementProfile`.
- **Homework/reminders/tools (added post-MVP, mostly pull-based today):** `Homework`, `Reminder`, `ToolRegistryEntry`, `UserToolPreference`, `CrisisResource` (seeded, not yet read by any live path).
- **Client-authored content:** `JournalEntry`, `MoodLog`.
- **Clinical/portal:** `TherapistNote` (never read by any agent — a deliberate clinical boundary), `Appointment`, `ClinicalAccessLog`, `EmergencyContact` (application-layer encrypted).
- **Ops:** `WaitlistEntry`, `BetaConsent`.
- **Test-harness-only (not part of the product's runtime data):** `PromptRegistryEntry`, `ModelConfigPin`, `TestRun`, `TestResultRow`, `CorpusCase`, `BlindedReviewItem`, `ReviewRating`, `TestBudget`, `TestHarnessAccess`, `GateSignOff`, `BaselineArchive`.

**Not implemented despite being planned:** `PushToken`/device-token storage — there is no push-notification delivery anywhere in the product (no `firebase_messaging` dependency, no Firebase Admin SDK, no Cloud Scheduler job). `Reminder`/`Homework` are pull-only (read by the client, never pushed) until that's built.

---

## Environments

| | dev | staging | prod |
|---|---|---|---|
| GCP Project | `evia-dev` | `evia-500215` | `evia-production` |
| Database | Neon (personal branch) | Cloud SQL | Cloud SQL (Multi-zone) |
| LLM | OpenRouter (dev key) / Vertex AI (dev quota) for rollback | OpenRouter (Vertex AI rollback available) | OpenRouter (Vertex AI rollback available) |
| Deployed from | Local machine | `main` branch (auto, on every merge — Cloud Build) | Git tag on `main` (`v1.0.0`, etc.) |

---

## Key Decisions Already Made — Do Not Relitigate

| Decision | What was decided | Why |
|---|---|---|
| Cloud provider | GCP only, no AWS | Single DPA for DPDP 2026 compliance; Vertex AI is already GCP |
| Monorepo tool | Plain pnpm workspaces, not Turborepo/Nx | Team size doesn't justify build-system overhead; the real reason for one repo is atomic cross-app schema/type changes, not build orchestration |
| One repo, independently deployed apps | Not one repo *or* independent deploys — both. Splitting into separate repos was reconsidered Sep 2026 (pilot-readiness review) and rejected again, same reasoning as ADR-001b | Deploy separation (the thing repo-splitting is usually chasing) already exists via separate Cloud Run services and separate Vercel projects |
| Mobile framework | Flutter (Android-first) | Cross-platform coverage from one codebase |
| Backend framework | Fastify (not Express) | Better TypeScript support, lower overhead for WebSocket-heavy workload |
| ORM | Prisma | Type safety, migration management, Neon compatibility |
| LLM provider | OpenRouter/Llama-3.1-8B-instruct (default), Vertex AI/Gemini (rollback) | Migrated from Gemini-only; see "LLM provider" above. Worker jobs not yet migrated — open decision |
| Local dev database | Neon (not Cloud SQL Proxy) | Cloud SQL Proxy setup takes 1.5-2h per developer; Neon branches are instant |
| Session notes isolation | T-05 notes (`TherapistNote`) are never ingested into any agent | Deliberate clinical boundary — therapist controls what informs the AI |
| Session model | Continuous chat, no turn cap, no daily-slot gating | OKUVU v2.0 product pivot away from bounded therapy-style sessions |

Each of the original items is documented with full rationale in `docs/adr/`.

---

## Known gaps worth knowing before a pilot

Not exhaustive — see the project's own fix/audit log for the full list — but the ones most relevant to "is this ready for real users":

1. **No crisis-response content.** The routing is correct (S4 → crisis path, fail-closed on any classification error), but the actual message shown to a user in genuine crisis doesn't exist yet. This is a P0 blocker for any pilot with real users, not a nice-to-have.
2. **No rate limiting anywhere in `apps/api`.** Unbounded LLM-cost exposure from a single misbehaving client; no throttle on OTP/invite endpoints either.
3. **Push notifications are entirely unbuilt.** No device-token storage, no Firebase Admin SDK, no scheduler job. Today-card/reminders are pull-only.
4. **Worker's LLM calls weren't migrated with the rest of the pipeline** — summary/memory extraction still run on Gemini while live chat runs on Llama by default. Decide deliberately rather than assume parity.
5. **Account deletion doesn't remove `JournalEntry` or `UserMemory`.**

---

## DPDP 2026 Compliance Note

All user data — including session content sent to the LLM (OpenRouter/Llama by default, Vertex AI/Gemini on rollback) — is intended to be processed within GCP asia-south1 (Mumbai). A single Google Cloud DPA covers compute, database, storage, auth, and Vertex AI inference. **OpenRouter is a separate, non-GCP vendor** — its own data-processing terms need the same legal review the original Vertex-only design assumed wasn't necessary. Sarvam AI (currently unused/stub, see "Text-to-speech" above) has a separate DPA if it's ever activated.

**Legal counsel must confirm DPDP 2026 adequacy of both GCP asia-south1 and OpenRouter's data handling before any pilot or production deployment with real user data.** This is a P0 pre-pilot blocker, and the OpenRouter migration makes it a materially different question than the one originally answered for Vertex-only.
