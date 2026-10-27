# OKUVU — Architecture Overview

> Last updated: 27 Oct 2026 (AWS cutover applied — see `docs/AWS-CUTOVER-SPEC.md`) · Previously 18 Sep 2026 · Refreshed against the current codebase (previous version, June 2026, described a Gemini-only pipeline and a bounded 10-turn session model — both since replaced). Corresponds to Infrastructure Decision Record v3.0 plus the OKUVU v2.0 migration (`docs/okuvu-v2.0/`).

---

## The Big Picture

OKUVU is five things running together, all in one repo (`apps/*`), each deployed independently:

1. **A Flutter mobile app** (`apps/mobile`) — the end-user experience (Android-first for MVP). Ships via its own Flutter/app-store pipeline.
2. **A Node.js API** (`apps/api`) — the backend handling sessions, the agent pipeline, and data. Deploys to ECS Fargate via `buildspec.yml` + `apps/api/Dockerfile`.
3. **A Node.js worker** (`apps/worker`) — background jobs (session summarization, memory extraction, beta-retention cleanup), triggered via Amazon SQS. Its own ECS service, its own `Dockerfile`, deployed separately from the API.
4. **A Next.js therapist portal** (`apps/therapist-portal`) — where licensed therapists supervise their clients. Deploys to its own Vercel project independently of everything else.
5. **A Next.js test harness** (`apps/test-harness`) — internal tooling for replaying pipeline scenarios and tracking regressions. Also its own, separate Vercel project.

**The repo is one pnpm workspace; the deployments are not.** Four independently-deployable services live in one checkout because the thing that actually needs to move together — `packages/shared-types` and `packages/prisma/schema.prisma` — needs to change in the same PR as the API/portal/mobile code that depends on it. See ADR-001b (`docs/adr/001-gcp-monorepo.md`) for the full reasoning; it was a deliberate decision, not an accident, and nothing about pilot readiness changes the calculus — if anything, a small team moving fast benefits more from atomic cross-app commits than a large one would.

---

## Infrastructure — AWS Only

Everything runs on AWS ap-south-1 (Mumbai). There is no GCP, and no Firebase. Deliberate decision (ADR-001a, superseded 27 Oct 2026 by the AWS cutover), primarily for DPDP 2026 compliance: one AWS DPA covers compute, database, storage, identity, and model inference, and every one of those stays inside India.

| Component | Service | Notes |
|---|---|---|
| API | ECS Fargate behind an ALB (`apps/api/Dockerfile`, `buildspec.yml`) | 2 tasks minimum, health-checked at `/health` |
| Worker | ECS Fargate (own service, own task definition) | Deployed separately from the API; consumes SQS |
| Therapist portal | Vercel (own project) | NextAuth with the Cognito provider |
| Test harness | Vercel (own project) | Internal tooling, not user-facing |
| Mobile | Flutter build → app store(s) | Own pipeline, outside AWS |
| Database | RDS PostgreSQL (staging/prod), Neon (local dev, branch per developer) | Single-AZ in beta, Multi-AZ in prod |
| Auth — end users | **Amazon Cognito** user pool, phone number + SMS OTP | `infrastructure/aws/evia-beta/cognito.tf`; API verifies the JWT offline against the pool JWKS |
| Auth — therapists | **Amazon Cognito** user pool, email + password + optional TOTP MFA | Federated into NextAuth via `CognitoProvider` |
| LLM — live chat pipeline (A1/A2/A9-pre/A9-post) | **Amazon Bedrock — `amazon.nova-pro-v1:0`** (`LLM_PROVIDER=bedrock` in the task definition) | OpenRouter remains selectable for load tests and A/B comparison — see "LLM provider" below |
| LLM — worker jobs (session summary, memory extraction) | **Amazon Bedrock** via `apps/worker/src/lib/generate-content.ts` | Same dispatcher shape as the API, same env contract |
| Embeddings | **Bedrock Titan Text Embeddings V2**, 768 dims | Must stay 768 to match the pgvector column |
| TTS | **Client-side**, `flutter_tts` in the mobile app | Not a backend call — see "Text-to-speech" below |
| File storage | S3 (+ CloudFront when a CDN is actually needed) | |
| Emergency-contact encryption | Secrets Manager (holds an AES-256-GCM key) + application-layer encryption in `apps/api/src/crypto/emergency-contact-encryption.ts` | Not KMS envelope encryption — the key is fetched and used directly |
| Session/turn rate limiting | `@fastify/rate-limit`, Redis-backed via ElastiCache, global 300 req/min per IP (`apps/api/src/app.ts`), 10/min on `/invites/redeem`, and a separate 20 turns/min-per-user counter on the WebSocket chat path (`apps/api/src/routes/websocket.ts`) | Fails open if Redis is unreachable — a cost/abuse guard, not a correctness guarantee |
| Async jobs | Amazon SQS (`summary-jobs`, with a DLQ driven by maxReceiveCount) | The worker's `/tasks/summary` endpoint is additionally HMAC-authenticated over the internal network |
| Secrets | AWS Secrets Manager (`AWS_SECRETS_PREFIX`-scoped) | |
| CI/CD | GitHub Actions for typecheck/test/lint; CodeBuild (`buildspec.yml`) for images and ECS deploys; Vercel's own CI for portal/test-harness | |
| Monitoring | CloudWatch Logs + alarms, AWS Budgets | |

### LLM provider — the actual current state

**`apps/api/src/lib/generate-content.ts`** is the single call site all four live-pipeline agents (A1, A2, A9-pre, A9-post) import from. It dispatches on `LLM_PROVIDER` (`.env`):
- `bedrock` → Amazon Bedrock, `amazon.nova-pro-v1:0`, in-region in ap-south-1. **This is what the ECS task definition sets.**
- `openrouter` (default when unset) → OpenRouter, model `meta-llama/llama-3.1-8b-instruct`. Kept for load tests and for comparing model behaviour without touching production traffic.

There is no third backend: the Gemini/Vertex path was deleted in the cutover, not left behind a flag.

**Fixed.** `apps/worker`'s async jobs (`lib/summary.ts`, `lib/memory-extraction.ts`) now import from `apps/worker/src/lib/generate-content.ts` — worker's own copy of the same dispatcher pattern (apps/api and apps/worker are separate deployable services and don't share Node code directly, only `packages/prisma`/`packages/shared-types`), same `LLM_PROVIDER` env var and the same Bedrock/OpenRouter choice. This was a deliberate decision, not an assumption: Llama-3.1-8B is a materially weaker model than Gemini 2.5 Flash for structured JSON extraction, which is exactly what summarization and memory extraction do — evaluate output quality after this ships before trusting it unreviewed, and roll back to `LLM_PROVIDER=gemini` on worker specifically if quality regresses.

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

**Async, post-session-close (in `apps/worker`, triggered via SQS):**
- Session summarization (`lib/summary.ts`) — structured summary of the closed session.
- Memory extraction (`lib/memory-extraction.ts`) — updates `UserMemory` (recurring themes, life context, stressors) read back into future sessions' context.
- Both call Amazon Bedrock through the worker's own `generate-content.ts` (see "LLM provider" above).

---

## Session model — continuous chat, not bounded sessions

The previous version of this doc (and the original MVP spec) described a hard 10-turn session cap with scripted closure at turns 8/9/10, plus daily-slot and idle-close limits gating whether a user could open a new session at all. **All of that machinery has been retired.** OKUVU v2.0 moved to continuous chat: no turn cap, no scripted "wrap up" behavior, no daily-slot rejection. The codebase is still `session_id`-keyed throughout rather than having a first-class "thread" concept with its own start/continue semantics and checkpoint summarization — that's a real architecture piece still ahead, not yet built.

---

## Database

Single PostgreSQL database (Neon for dev, RDS for staging/prod). ORM is Prisma; the full schema is in `packages/prisma/schema.prisma`. Selected models, grouped by what they own (not exhaustive — see the schema file for the current full list):

- **Identity & clinical assignment:** `User`, `Therapist`, `ClinicalConfig`, `TherapistClient` (the portal-side relationship, including `chat_access_granted` and `ended_at` for the care-relationship-ended flow), `InviteToken` (redemption codes — stored as a SHA-256 hash, not plaintext, as of this month).
- **Sessions & safety:** `SessionLog`, `Turn`, `SafetyState`, `GovernanceLog` (A9-pre/A9-post decisions, for audit).
- **Memory pipeline:** `SessionSummary` (worker's async output), `UserMemory`, `EngagementProfile`.
- **Homework/reminders/tools (added post-MVP, mostly pull-based today):** `Homework`, `Reminder`, `ToolRegistryEntry`, `UserToolPreference`, `CrisisResource` (seeded, not yet read by any live path).
- **Client-authored content:** `JournalEntry`, `MoodLog`.
- **Clinical/portal:** `TherapistNote` (never read by any agent — a deliberate clinical boundary), `Appointment`, `ClinicalAccessLog`, `EmergencyContact` (application-layer encrypted).
- **Ops:** `WaitlistEntry`, `BetaConsent`.
- **Test-harness-only (not part of the product's runtime data):** `PromptRegistryEntry`, `ModelConfigPin`, `TestRun`, `TestResultRow`, `CorpusCase`, `BlindedReviewItem`, `ReviewRating`, `TestBudget`, `TestHarnessAccess`, `GateSignOff`, `BaselineArchive`.

**Not implemented despite being planned:** `PushToken`/device-token storage — there is no push-notification delivery anywhere in the product (no push SDK in the mobile app, no notification service on the backend). `Reminder`/`Homework` are pull-only (read by the client, never pushed) until that's built.

---

## Environments

| | dev | staging | prod |
|---|---|---|---|
| AWS account / stack | local docker + Neon | `evia-beta` | `evia-production` |
| Database | Neon (personal branch) | RDS (single-AZ) | RDS (Multi-AZ) |
| LLM | OpenRouter (dev key) or Bedrock | Bedrock Nova Pro | Bedrock Nova Pro |
| Deployed from | Local machine | `main` branch (auto, on every merge — Cloud Build) | Git tag on `main` (`v1.0.0`, etc.) |

---

## Key Decisions Already Made — Do Not Relitigate

| Decision | What was decided | Why |
|---|---|---|
| Cloud provider | AWS only, no GCP | Single DPA for DPDP 2026 compliance; Bedrock inference stays in ap-south-1 |
| Monorepo tool | Plain pnpm workspaces, not Turborepo/Nx | Team size doesn't justify build-system overhead; the real reason for one repo is atomic cross-app schema/type changes, not build orchestration |
| One repo, independently deployed apps | Not one repo *or* independent deploys — both. Splitting into separate repos was reconsidered Sep 2026 (pilot-readiness review) and rejected again, same reasoning as ADR-001b | Deploy separation (the thing repo-splitting is usually chasing) already exists via separate ECS services and separate Vercel projects |
| Mobile framework | Flutter (Android-first) | Cross-platform coverage from one codebase |
| Backend framework | Fastify (not Express) | Better TypeScript support, lower overhead for WebSocket-heavy workload |
| ORM | Prisma | Type safety, migration management, Neon compatibility |
| LLM provider | Amazon Bedrock Nova Pro (production), OpenRouter/Llama-3.1-8B-instruct (load tests + comparison) | See "LLM provider" above. Both services share the same contract |
| Local dev database | Neon (not a VPN into RDS) | RDS access needs bastion/VPN setup; Neon branches are instant |
| Session notes isolation | T-05 notes (`TherapistNote`) are never ingested into any agent | Deliberate clinical boundary — therapist controls what informs the AI |
| Session model | Continuous chat, no turn cap, no daily-slot gating | OKUVU v2.0 product pivot away from bounded therapy-style sessions |

Each of the original items is documented with full rationale in `docs/adr/`.

---

## Known gaps worth knowing before a pilot

Not exhaustive — see the project's own fix/audit log for the full list — but the ones most relevant to "is this ready for real users":

1. ~~**No crisis-response content.**~~ **Fixed.** The S4 crisis path now persists a real, deterministic assistant reply (`CRISIS_RESPONSE` in `apps/api/src/pipeline/fallbacks.ts`) using the same approved helpline set already hardcoded in the mobile app's `CrisisOverlay` and referenced in A9-post's system prompt — no new clinical content, just closing the pipe. The surrounding language is a first pass and still needs clinical/RCI sign-off before real users see it; the resource list itself was already approved.
2. ~~**No rate limiting anywhere in `apps/api`.**~~ **Fixed.** See the infrastructure table above.
3. **Push notifications are entirely unbuilt.** No device-token storage, no notification service, no scheduler job. Today-card/reminders are pull-only.
4. ~~**Worker's LLM calls weren't migrated with the rest of the pipeline.**~~ **Fixed.** Both services now share the same `LLM_PROVIDER` contract — see "LLM provider" above. Still needs: (a) the Bedrock model quota raised in the target account before staging/prod traffic, and (b) an output-quality eval comparing Nova Pro against the OpenRouter baseline for structured extraction.
5. **Account deletion doesn't remove `JournalEntry` or `UserMemory`.**

---

## DPDP 2026 Compliance Note

All user data — including session content sent to the LLM (Amazon Bedrock Nova Pro in production) — is intended to be processed within AWS ap-south-1 (Mumbai). A single AWS DPA covers compute, database, storage, identity, and Bedrock inference. **OpenRouter is a separate, non-AWS vendor** — it is enabled only for load tests and comparison runs, never for production traffic, and its data-processing terms need their own review if that ever changes. Sarvam AI (currently unused/stub, see "Text-to-speech" above) has a separate DPA if it's ever activated.

**Legal counsel must confirm DPDP 2026 adequacy of AWS ap-south-1 (including Bedrock) and — separately — of any OpenRouter use before a pilot or production deployment with real user data.** This is a P0 pre-pilot blocker. The identity cutover adds one concrete sub-question: Cognito's SMS OTP is delivered through SNS, which routes through Indian carrier SMS aggregators, and SNS SMS requires TRAI DLT registration of the sender before codes will deliver at all.
