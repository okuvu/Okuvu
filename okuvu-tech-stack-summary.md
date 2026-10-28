# Okuvu — Complete Technology Stack & Tech Inventory

> Internal development repository — Suvok Systems LLP, Bengaluru
> Confidential. Do not share outside the engineering team.
> Version: 2.0 (AWS stack)

---

## 1. Project Overview

**Okuvu** is an AI-powered mental wellness companion for Indian Gen Z, built on a supervised therapist-led model. Users interact with an AI agent (A2) in bounded daily sessions; a licensed therapist oversees care plans and session notes via a separate portal.

This document inventories **every technology, library, framework, tool, and service** used in the project, organized by layer so you can learn the whole system.

### 1.1 Migration note (October 2026)

This inventory now describes the **AWS stack**, which replaced a Google Cloud stack. Before the cutover the system ran on Cloud Run, Cloud SQL, Cloud Tasks, Memorystore, Secret Manager, Cloud KMS, Cloud Storage, Artifact Registry/Cloud Build, Vertex AI (Gemini) and Firebase Auth. It now runs on ECS Fargate, RDS Postgres, SQS, ElastiCache (Valkey), Secrets Manager, KMS, S3, ECR/CodeBuild, Amazon Bedrock and a Cognito user pool, all pinned to **ap-south-1 (Mumbai)** for DPDP data residency.

Entry points for the cutover itself: `docs/AWS-CUTOVER-SPEC.md` (authoritative contract) and `docs/AWS-MIGRATION-PLAN.md`. Anything below that still says "Gemini" refers to the OpenRouter-routed comparison path, not a Google-hosted service. The one exception is historical prose in `okuvu-remaining-changes.md`, which is a dated log and is left as written.

---

## 2. Repo Structure (Monorepo)

```
okuvu/
├── apps/
│   ├── mobile/               Flutter app (Android-first MVP)
│   ├── api/                  Node.js/TypeScript backend — @okuvu/api
│   ├── therapist-portal/     Next.js therapist portal — @okuvu/therapist-portal
│   ├── worker/               Background worker — @okuvu/worker
│   └── test-harness/         Next.js test/evaluation harness — @okuvu/test-harness
├── packages/
│   ├── prisma/               Prisma schema + generated client — @okuvu/prisma
│   └── shared-types/         TypeScript types shared across apps — @okuvu/shared-types
├── infrastructure/
│   └── aws/evia-beta/        Terraform for the beta stack (VPC, RDS, ECS, ALB, SQS, S3, KMS, ECR)
├── scripts/                  Deployment scripts (ECR push + ECS rollout)
├── buildspec.yml             AWS CodeBuild pipeline (test → build → migrate → deploy)
├── load-tests/               k6 WebSocket load test scripts
└── docs/                     Architecture decisions, setup guides
```

**Package manager:** `pnpm@11.8.0` (declared in `packageManager` field). Node.js `>=20`. Pnpm workspace enforcing strict per-package isolation.

---

## 3. Mobile App — Flutter

**Framework:** Flutter (Android-first MVP, iOS-ready). SDK `>=3.0.0 <4.0.0`. Android min SDK 21. Material Design.

### 3.1 Key Flutter Packages (pubspec.yaml)

| Package | Version | Purpose |
|---|---|---|
| `flutter_tts` | ^4.2.5 | Text-to-speech (device TTS) |
| `flutter_riverpod` | ^3.3.2 | Reactive state management |
| `go_router` | ^17.3.0 | Declarative navigation / routing |
| `dio` | ^5.9.2 | HTTP client (API calls, and the Cognito calls below) |
| `web_socket_channel` | ^3.0.1 | WebSocket client for live chat sessions |
| `connectivity_plus` | ^7.2.0 | Network connectivity monitoring |
| `url_launcher` | ^6.3.0 | Open URLs (links, emergency resources) |
| `fl_chart` | ^0.69.0 | Charts (progress/mood graphs) |
| `shared_preferences` | ^2.2.3 | Local key-value storage (phone, refresh token) |
| `lucide_icons_flutter` | ^3.1.20 | Icon set |
| `speech_to_text` | ^7.5.0 | Speech-to-text input |
| `permission_handler` | ^13.0.2 | Runtime permissions |
| `share_plus` | ^13.3.0 | Share content |

### 3.2 Dev Dependencies

- `patrol: ^4.7.1` — instrumentation testing / E2E test framework
- `flutter_lints: ^6.0.0` — lint rules
- `flutter_test`, `integration_test` — Flutter testing SDKs
- `flutter_launcher_icons: ^0.14.2` — app icon generation

### 3.3 Identity, Analytics & Crash Reporting (Mobile)

- **Amazon Cognito (phone OTP)** — sign-up and OTP verification are plain HTTPS form posts through the existing `dio` client (`X-Amz-Target` + `application/x-amz-json-1.1`); there is no Amplify or AWS SDK dependency in the Flutter app. The device password that Cognito requires alongside the OTP is 32 random bytes kept in `shared_preferences`; moving that to `flutter_secure_storage` is the documented hardening step.
- **Analytics** — no-op local logger, with an optional `/telemetry` POST.
- **Crash reporting** — the `CrashReporter` seam (local log + optional POST), no third-party SDK.

### 3.4 Android / iOS Configuration

- **Flavors:** `dev`, `beta`, `prod` (via `AndroidManifest.xml` per flavor, `FlavorNotSpecifiedException` guard in `AppConfig`)
- **Min SDK Android:** 21
- **Adaptive icons**, `launch_background.xml`, colors, styles
- **iOS:** `Runner.xcodeproj`, `Assets.xcassets`, `flutter_export_environment.sh`

### 3.5 Dart Source Highlights (Mobile)

| File | What it does |
|---|---|
| `main.dart` | App entry point |
| `app.dart` | Root widget / provider tree |
| `config/app_config.dart` | Flavor + environment config |
| `config/environment.dart` | Environment detection |
| `config/flavor_config.dart` | Flavor definitions |
| `core/dio_client.dart` | HTTP client setup |
| `core/auth_service.dart`, `core/auth_interceptor.dart` | Auth + token intercept (Cognito) |
| `core/websocket_service.dart`, `websocket_constants.dart` | Live session WebSocket |
| `core/tts_service.dart` | Text-to-speech wrapper |
| `core/analytics_service.dart` | Analytics seam (local logger + optional POST) |
| `core/logger.dart` | Logging |
| `features/chat/` | Chat screen + message/tool cards + grounding + breathing visuals |
| `features/home/` | Home screen, today card, breathing, mood check-in, appointments |
| `features/intake/` | Onboarding, care plan, cold start |
| `features/journal/` | Journal entry + list + provider |
| `features/progress/` | Mood/progress screen + provider |
| `features/settings/` | Settings: profile, language, notifications, emergency contact, privacy, voice, quote of day |
| `features/crisis/` | Crisis overlay (offline-safe resource list) |
| `features/appointments/` | Appointments screen/provider |
| `features/auth/` | OTP login, waitlist screen |
| `features/splash/` | Splash screen |
| `router/router.dart` | GoRouter configuration |
| `theme/app_theme.dart`, `app_colors.dart` | Theme + design tokens |

---

## 4. Backend API — Node.js / TypeScript / Fastify

**Framework:** Fastify 5.x (HTTP server) + tsx (dev watcher) + TypeScript 5.x + Vitest (tests).

### 4.1 Key npm Dependencies

| Package | Version | Purpose |
|---|---|---|
| `fastify` | ^5.3.2 | HTTP server / REST framework |
| `@fastify/rate-limit` | ^11.2.0 | Rate limiting (middleware) |
| `@fastify/websocket` | ^11.0.0 | WebSocket support (live chat/sessions) |
| `@prisma/adapter-pg` | ^7.8.0 | Prisma adapter for PostgreSQL |
| `@prisma/client` | ^7.8.0 | Prisma ORM client |
| `prisma` | ^7.8.0 | DB migration/client tooling |
| `@aws-sdk/client-bedrock-runtime` | ^3.x | Bedrock (Nova Pro for chat, Titan Embeddings V2 for vectors) |
| `@aws-sdk/client-sqs` | ^3.x | Summary/memory job queue |
| `@aws-sdk/client-s3` | ^3.x | Uploads, cached TTS audio, signed URLs |
| `@aws-sdk/client-secrets-manager` | ^3.x | Runtime secret retrieval |
| `@aws-sdk/client-kms` | ^3.x | Envelope encryption (emergency contacts) |
| `ioredis` | ^5.4.1 | Redis client (caching, session state, coordination) |
| `pg` | ^8.22.0 | PostgreSQL driver |
| `dotenv` | ^16.4.7 | Environment configuration |
| `@okuvu/prisma` | workspace | Shared Prisma layer |
| `@okuvu/shared-types` | workspace | Shared TypeScript types |

Cognito access tokens are verified with `node:crypto` against the pool's cached JWKS (`apps/api/src/lib/cognito-auth.ts`) — no Google/AWS auth library on the request path.

### 4.2 Dev Dependencies

- `typescript ^5.8.3`
- `tsx ^4.19.3` (dev server)
- `vitest ^3.1.1` (test runner + watch)
- `@types/node`, `@types/pg`, `@types/ws`

### 4.3 Scripts

- `dev` — `tsx watch src/server.ts`
- `build` — `tsc && cp src/prompts/*.txt dist/prompts/`
- `start` — `node dist/server.js`
- `typecheck` — `tsc --noEmit`
- `test` — `vitest run`
- `test:watch` — `vitest`
- `test:load` — `k6 run load-tests/k6-websocket-load.js`

### 4.4 Architecture — The A-Pipeline (AI Agents)

The core feature is an AI agent pipeline. Each user turn flows through these agents:

| Agent | File | Role |
|---|---|---|
| A1 | `src/agents/a1/` | Clinical safety gate (LLM) — classifies risk (S0–S4), the non-negotiable first pass |
| A2 | `src/agents/a2/` | Support companion (LLM) — the main AI chat response |
| A9-pre | `src/agents/a9/` | Pre-governance gate (LLM) — policy check |
| A9-post | `src/agents/a9-post/` | Post-content review (LLM) |
| journal-prompt | `src/agents/journal-prompt/` | Chat→journal handoff prompt |
| a8-router | `src/agents/a8-router.ts` | Router/decision logic |
| orchestrator | `src/pipeline/orchestrator.ts` | Coordinates the pipeline, fallbacks, retries, latency |

Supporting libs: `bedrock.ts` (Bedrock client — Nova Pro / Titan Embeddings V2), `generate-content.ts` (single dispatcher: Bedrock or OpenRouter), `provider-config.ts` (region/model/queue resolution), `openrouter.ts` (comparison provider), `embedding.ts` (vector embeddings), `cognito-auth.ts` (JWT verification), `sqs-enqueue.ts` + `summary-enqueue.ts` (queue producers), `memory-retrieval.ts` (retrieve persisted user memory), `retrieved-context-cache.ts` (Redis cache), `quote-of-day.ts`, `care-plan.ts`, `homework.ts`, `canned-response.ts`, `today-card.ts`, `tool-card.ts`, `sessions.ts`, `appointments.ts`, `invites.ts`, `auth-otp.ts`, `rate-limit.ts`, `redis.ts`, `session-open/close.ts`, `worker-health.ts`, `progress.ts`, `email.ts`.

### 4.5 Routes

`src/routes/`: account, appointments, auth, health, invites, journal, progress, sessions, settings, users, waitlist, websocket.

### 4.6 Middleware / Error Handling

- `middleware/auth.ts` — Cognito JWT verification (`verifyCognitoToken`) with the documented local-dev bypass
- `errors/handler.ts` — centralized error handler
- `pipeline/fallbacks.ts` — deterministic fallbacks when the LLM fails

### 4.7 Tests

Many unit tests under `src/__tests__/` (a1, a2, a8-router, a9, a9-post, account-delete, agent-context, appointments, auth, auth-verify-otp, care-plan, email, emergency-contact, error-handler, generate-content, health, invite-token-hash, invites, journal, journal-prompt-agent, llm-provider, mood-checkin, openrouter, orchestrator, orchestrator modes/latency, production-bypass, progress-mood, quote-of-day, rate-limit, session-close/open, sessions-srs, settings, users-consent, users-today-and-tool, waitlist, websocket-session-idor, welcome).

### 4.8 Prompts

`src/prompts/*.txt` — A2/A9 prompt templates (read at runtime).

---

## 5. Background Worker — Node.js / TypeScript

**Purpose:** SQS consumer — drains background jobs (session summarization, memory extraction, embedding backfill, retention cleanup) from `evia-beta-summary-jobs`, with a dead-letter queue after 3 failed receives.

**Framework:** Same as API — Fastify 5.x + TypeScript + Vitest.

**Runtime:** ECS Fargate service `evia-beta-worker` in the private subnets, with no load balancer and no public ingress — it polls the queue, so there is no OIDC verifier on its internal routes.

### 5.1 Key Dependencies

- `@okuvu/prisma`, `@okuvu/shared-types`
- `@aws-sdk/client-bedrock-runtime` (Nova Pro + Titan Embeddings V2)
- `@aws-sdk/client-sqs` (job consumption)
- `@prisma/adapter-pg`, `@prisma/client`, `pg`
- `fastify ^5.3.2`
- `dotenv`

### 5.2 Routes / Jobs

- `routes/health.ts`
- `routes/summary.ts` — session summarization
- `routes/beta-retention.ts` — beta data cleanup job (scheduled)
- `routes/cleanup.ts`
- `routes/index.ts`
- `lib/embedding.ts`, `lib/generate-content.ts`, `lib/memory-extraction.ts`, `lib/bedrock.ts`, `lib/openrouter.ts`, `lib/prisma.ts`, `lib/summary.ts`
- `scripts/backfill-embeddings.ts`

---

## 6. Therapist Portal — Next.js

**Framework:** Next.js 16 (App Router) + React 19 + tRPC + NextAuth (Auth.js) + TypeScript + Tailwind CSS 4.

### 6.1 Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `next` | ^16.2.10 | React framework |
| `react` / `react-dom` | ^19.2.7 | UI |
| `@trpc/client`, `@trpc/next`, `@trpc/react-query`, `@trpc/server` | ^11.18.0 | tRPC RPC (type-safe API) |
| `next-auth` | ^4.24.14 | Authentication — `CognitoProvider` against the therapist user pool |
| `jose` | ^5.x | Cognito id-token verification in the NextAuth callback |
| `@prisma/adapter-pg`, `@prisma/client`, `pg` | — | DB access |
| `@okuvu/prisma`, `@okuvu/shared-types` | workspace | Shared |
| `@tanstack/react-query` | ^5.101.2 | Server state |
| `zod` | ^4.4.3 | Schema validation |
| `@tailwindcss/postcss`, `tailwindcss`, `autoprefixer` | — | Styling |

### 6.2 Dev Dependencies

- `typescript ^5.9.3`, `vitest ^3.1.1`, `@types/*`

### 6.3 Features / Pages

| Area | Pages / Features |
|---|---|
| Dashboard | `/dashboard` (client table) |
| Clients | `/clients/[id]` (home, program, tools, reminders, homework, notes, report, appointment, schedule) |
| Auth | `/auth` (Sign in — Cognito hosted login) |
| Schedule | `/schedule` |
| Admin | `/admin` (Add-client wizard) |

### 6.4 Data / API

- tRPC routers: `_app.ts`, `admin.ts`, `appointments.ts`, `clients.ts`, `homework.ts`, `notes.ts`, `reminders.ts`, `report-card.ts`, `users.ts`, `waitlist.ts`
- `trpc/provider.tsx`, `trpc/client.ts`
- `auth.ts`, `auth-provider.tsx` (NextAuth), `prisma.ts`, `email.ts`, `invite-token-hash.ts`, `format.ts`

---

## 7. Test Harness — Next.js

**Purpose:** Automated eval / A/B / regression harness for the A-pipeline (approved_test_harness layer). Runs on port 3002. Deployed to Vercel.

### 7.1 Key Dependencies

- Next.js, React 19, tRPC, Vitest, `@tanstack/react-query`, `@tanstack/react-virtual` (virtualized lists)
- `@aws-sdk/client-bedrock-runtime` (inherited through the `@okuvu/api` modules it direct-imports)
- `xlsx ^0.18.5` (Excel export of results)
- `zod`, `next-auth` (`CognitoProvider`), `pg`
- `@okuvu/api`, `@okuvu/prisma`, `@okuvu/shared-types` (workspaces)

### 7.2 Dev Dependencies

- Tailwind v4, PostCSS, autoprefixer, TypeScript, Vitest

### 7.3 Configuration (next.config.ts)

Interesting build config because the harness is a Next.js app that **direct-imports** `@okuvu/api` source files (which use ESM `.js`→`.ts` imports). Key workarounds:

- `outputFileTracingRoot`, `outputFileTracingIncludes` to ship prompt files
- `webpack` config with `extensionAlias: '.js' → '.ts' + '.tsx'`
- `NormalModuleReplacementPlugin` to swap `../prompts/index.js` → a generated `prompt-shim.ts` (avoids Vercel packaging dropping runtime `.txt` reads)
- `config.externals` for `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-sqs`, `next-auth` (server-only libs marked external so Node's require resolves them)

### 7.4 Pages / Features

| Page / Feature | What it does |
|---|---|
| Pipeline | Agent toggle, pipeline diagram, agent trace panel |
| Simulator | Scenario batteries, persona/persona-pair runner |
| Determinism | A8 state matrix, run diff view |
| Corpus | Case editor, bulk import (CSV), consent panel |
| Results | Comparison view, run list/detail |
| Review | Kappa results, rater progress, rubric form |
| Sampling | Sampling config/progress console (cost estimated from the Bedrock price table) |
| Fault Injection | Fault console, fault configs |
| CI | Gate status, regression runs (GitHub Actions integration) |

### 7.5 tRPC Routers (Test Harness)

`server/routers/`: `ci.ts`, `consent.ts`, `conversation.ts`, `corpus.ts`, `dashboard.ts`, `determinism.ts`, `faultInjection.ts`, `pipeline.ts`, `results.ts`, `results-export.ts`, `review.ts`, `scorecard.ts`, `simulator.ts`, `singleAgent.ts`, `stochastic.ts`, `testConfig.ts`, `example.ts`.

### 7.6 Tests

Hundreds of vitest tests under `src/__tests__/` (pipeline, determinism, fault-injection, review, kappa, simulator, corpus, canned-mode, continuity-asserts, dependency-graph, judge, run-diff, scorecard, etc.).

---

## 8. Database & ORM

**Database:** PostgreSQL — Neon for local dev, **Amazon RDS for PostgreSQL 16** (`db.t4g.small`, private subnets, 7-day backups) for staging/beta/prod. Credentials live in Secrets Manager as `evia-beta/database`.

**ORM:** Prisma 7.x

- `@prisma/client`, `@prisma/adapter-pg`, `prisma` (CLI)
- `packages/prisma/` — shared schema + generated client (`@okuvu/prisma`)
- Schema models include: `User`, `Therapist`, `ClinicalConfig`, `EmergencyContact`, `EngagementProfile`, `UserMemory`, `MoodLog`, `SafetyState`, `SessionLog`, `SessionSummary`, `TherapistClient`, `TherapistNote`, `Homework`, `Reminder`, `Appointment`, `InviteToken`, `WaitlistEntry`, `NotificationPreference`, `Turn`, `JournalEntry`, `ClinicalAccessLog`, `TestRun`, `CorpusCase`, `GateSignOff`, `PromptRegistryEntry`, `ModelConfigPin`, `BaselineArchive`, etc.

`User.auth_subject` holds the Cognito `sub`; it was renamed from `firebase_uid` in the cutover migration.

### 8.1 Prisma Migrations

~40 migrations (2026-06-23 → 2026-09-22) covering the full feature surface (e.g., `add_turn_model`, `add_therapist_model`, `add_journal_entry`, `add_mood_log`, `add_s06_inference_fields`, `add_governance_log`, `add_user_memory_table`, `add_summary_embedding`, `add_client_lifecycle_and_chat_access_request`, `add_appointment`, `add_invite_token_and_client_intake_fields`, `add_waitlist_entry`, `add_notification_preferences`, `add_homework_reminder_language_mode_registries`, `add_reminder_frequency_tool_link`, `drop_session_limit_and_tier`, `add_turn_taper_state`, `add_turn_s07_signal_fields`, `add_conversation_runner`, `add_turn_fallback_source`, `add_test_run_status_incomplete`, etc.).

`prisma migrate deploy` runs from the CodeBuild pipeline (`buildspec.yml`) inside the VPC — RDS is not publicly reachable.

### 8.2 Manual SQL (outside Prisma)

- `packages/prisma/enable_vector.sql`
- `packages/prisma/manual-migrations/001_test_harness_beta_rls.sql` — Row-Level Security for test harness (beta environment isolation). This is a hand-written, non-Prisma migration that must be run manually against each environment.

### 8.3 Seed

`packages/prisma/seed.ts` — seeds 3 test users + care plans in a transaction (Neon-dev seed script; also `seed-load-test.ts` for load tests).

---

## 9. Authentication & Identity

| Layer | Provider | Details |
|---|---|---|
| Mobile users | **Amazon Cognito** user pool (phone_number alias, SMS OTP) | Sign-up/OTP via plain HTTPS form posts from Flutter; the pool `sub` is stored in `User.auth_subject` |
| Therapist portal | **Amazon Cognito** therapist pool + NextAuth `CognitoProvider` | Portal session is NextAuth (JWT strategy); identity comes from Cognito, not Google federation |
| API token verification | Cognito JWKS + `node:crypto` | RS256 signature, `iss`, `exp`, `token_use`, audience/client checks (`apps/api/src/lib/cognito-auth.ts`) |
| Internal / worker-to-worker | VPC-internal (no public ingress) | AWS tasks reach the worker over the private subnets; the old OIDC verifier is gone |
| Local dev bypass | `LOCAL_DEV_BYPASS_AUTH` env flag | Allows API calls without a real Cognito token (dev only, never set in a deployed task) |

### 9.1 Sensitive Values (never committed)

- `COGNITO_THERAPIST_CLIENT_SECRET` — therapist app client secret (Secrets Manager in deployed environments)
- `EMERGENCY_CONTACT_ENCRYPTION_KEY` — base64 32-byte AES-256-GCM key (or retrieve from Secrets Manager via `CONTACTS_KMS_KEY_ARN`)
- `OPENROUTER_API_KEY` — OpenRouter LLM key
- `SARVAM_API_KEY` — Sarvam TTS API key
- `NEXTAUTH_SECRET` — portal session signing key
- AWS credentials — IAM task roles in deployed environments, never in the repo

---

## 10. AI / LLM Integration

### 10.1 Providers

| Provider | Models | Used by |
|---|---|---|
| **Amazon Bedrock** (ap-south-1, in-region) | `amazon.nova-pro-v1:0` (chat), `amazon.titan-embed-text-v2:0` (768-dim embeddings) | Clinical agents A1/A2/A9-pre/A9-post, summaries, memory extraction, judge/case-factory in the harness |
| **OpenRouter** (comparison / escape hatch) | `meta-llama/llama-3.1-8b-instruct` (default) and others | A/B comparison runs and the harness's `LLM_PROVIDER=openrouter` path |

Bedrock pricing used for harness cost estimates (ap-south-1, on-demand, from the AWS Price List API offer file): Nova Pro $0.94 / 1M input tokens and $3.76 / 1M output tokens; Titan Embeddings V2 $0.024 / 1M input tokens.

### 10.2 LLM Architecture

- `apps/api/src/lib/generate-content.ts` — single `generateContent` dispatcher (Bedrock or OpenRouter)
- `apps/api/src/lib/provider-config.ts` — resolves region, model ids, embedding width and queue URL from env
- `apps/api/src/lib/bedrock.ts`, `apps/api/src/lib/openrouter.ts` — provider-specific clients
- `apps/api/src/lib/embedding.ts` — vector embeddings (Titan Embeddings V2 → pgvector for memory & recall)
- `apps/api/src/agents/` — A1 safety gate, A2 companion, A9 pre/post governance, journal-prompt, a8-router, orchestrator

### 10.3 Text-to-Speech

- **Sarvam TTS (Bulbul v2)** — `SARVAM_TTS_MODEL="bulbul:v2"`, `SARVAM_DEFAULT_LANGUAGE="en-IN"`
- `apps/mobile/lib/src/core/tts_service.dart` — Flutter TTS wrapper
- **Amazon S3** bucket (`S3_UPLOADS_BUCKET`) + presigned URLs for cached TTS audio and assets
- **AWS KMS** customer-managed keys for encryption (`contacts`, `data`, `secrets`)

### 10.4 Voice Mode

- `apps/mobile` voice toggle widget + `voice_settings_notifier.dart` (settings)
- `tts_service.dart` + `voice_toggle.dart` widgets

---

## 11. Real-Time / WebSocket

**Library:** `@fastify/websocket` (API) + `web_socket_channel` (Flutter mobile client)

- `apps/api/src/routes/websocket.ts` — WebSocket endpoint for live chat sessions (terminated by the ALB, 60s idle timeout)
- Session lifecycle: `SESSION_OPEN` → `USER_TURN` → `AGENT_TURN` → `SESSION_CLOSE`
- Frame types defined in `@okuvu/shared-types` (`SessionOpenFrame`, `UserTurnFrame`, `AgentTurnFrame`, `CrisisSignalFrame`, `ToolResultFrame`, `SessionCloseFrame`, etc.)
- `apps/mobile/lib/src/core/websocket_service.dart` + `websocket_constants.dart`

---

## 12. Caching & Queueing (AWS services)

| AWS Service | Purpose |
|---|---|
| **ElastiCache for Valkey** | Caching (retrieved-context-cache), session coordination; TLS via `rediss://` |
| **ioredis** (Node) | Redis client in API |
| **Amazon SQS** | Background job queue (`evia-beta-summary-jobs`) with a dead-letter queue, 3-receive redrive, 900s visibility timeout |
| **@aws-sdk/client-sqs** | Node client for enqueueing and consuming jobs |
| **Amazon S3** | Uploads, TTS audio + assets; presigned URLs |
| **AWS Secrets Manager** | Database credentials and runtime secrets, injected into ECS task definitions |
| **AWS KMS** | Encryption keys (AES-256-GCM envelope for emergency contacts + RDS/S3/ElastiCache at rest) |
| **Amazon ECS on Fargate** | Hosts `api` (behind the ALB) and `worker` (queue consumer) |
| **Amazon ECR** + **AWS CodeBuild** | Image registry + CI/CD builds |

---

## 13. Infrastructure & Deployment

### 13.1 Deployment Targets

| Environment | AWS account / region | Provisioned / deployed by |
|---|---|---|
| Dev | developer's own AWS credentials, `ap-south-1` | Local machine (Neon DB) |
| Beta/Staging | beta AWS account, `ap-south-1` | CodeBuild on `main` (build → migrate → ECS rollout) |
| Prod | prod AWS account, `ap-south-1` | Git tag `v*` (manual approval) |

All resources are pinned to `ap-south-1`; `variables.tf` fails validation on any other region.

### 13.2 Infrastructure as Code (Terraform)

`infrastructure/aws/evia-beta/` — one root module, no child modules:

- `providers.tf`, `variables.tf`, `outputs.tf`, `terraform.tfvars.example`, `locals.tf`
- `vpc.tf` — VPC `10.20.0.0/16`, 2 public + 2 private subnets, NAT, 4 security groups
- `rds.tf`, `elasticache.tf`, `s3.tf`, `kms.tf`, `secrets.tf` — data layer
- `ecr.tf`, `ecs.tf`, `alb.tf`, `iam.tf` — compute and image registry
- `sqs.tf` — summary queue + DLQ
- `observability.tf` — CloudWatch log groups, VPC flow logs, ALB alarms, monthly budget alarm

### 13.3 Deploy Scripts

- `scripts/deploy-beta.sh` — builds `apps/api`, pushes to ECR (`evia-beta/api`), registers a new task-definition revision, updates `evia-beta-api` and waits for `services-stable`
- `scripts/deploy-worker.sh` — same flow for `evia-beta/worker` → `evia-beta-worker`
- `buildspec.yml` — CodeBuild pipeline: pnpm install, Prisma generate, typecheck, vitest, docker build + ECR push for both workloads, `prisma migrate deploy` (in-VPC), then `aws ecs update-service` + wait on both services
- `.github/workflows/ci.yml` — PR checks (typecheck, vitest, flutter analyze/test, credential scan) and, on merge to `main`, an OIDC-authenticated ECR image push

### 13.4 Dockerfiles

- `apps/api/Dockerfile` — multi-stage Node 22 Alpine, pnpm, `prisma generate`, builds `@okuvu/api` (listens on 8080)
- `apps/worker/Dockerfile` — same pattern for `@okuvu/worker`

---

## 14. CI/CD & DevOps

- **AWS CodeBuild** — builds, tests, migrates and rolls out on `main` (`buildspec.yml`)
- **Amazon ECR** — container image storage (`evia-beta/api`, `evia-beta/worker`, scan-on-push, lifecycle retention)
- **Amazon ECS Fargate** — API + worker runtime, behind an Application Load Balancer with `/health` checks
- **Vercel** — test-harness hosting (`vercel.json` in `apps/test-harness`)
- **GitHub Actions** — PR CI, plus the regression workflow referenced by the test-harness CI router (`GITHUB_TOKEN` for gate status / regression triggering)
- **pnpm workspaces** — monorepo dependency management (`pnpm-workspace.yaml`, `pnpm-lock.yaml`)
- **Commit convention:** conventional-ish naming (`feat:`, `fix:`, `chore:`), PR-based merge to `develop` then `main`

---

## 15. Build & Test Tools

| Tool | Purpose | Where |
|---|---|---|
| pnpm 11.8.0 | Package manager / workspaces | Root, all apps |
| Node.js 20+ | JS runtime | All TS/Node apps |
| TypeScript 5.x | Type-safety | API, worker, portal, harness, shared-types |
| tsc / tsx | Compile + dev runner | API, worker |
| Vitest 3.x | Unit/integration tests | API, worker, portal, harness, shared-types, mobile |
| Flutter test + patrol | Dart unit + E2E integration tests | Mobile |
| k6 | WebSocket load testing | `load-tests/` (API `test:load` script) |
| Prisma | DB migrations + ORM | All apps (via `packages/prisma`) |
| tRPC | Type-safe RPC | Portal, harness |
| NextAuth | Auth | Portal, harness |
| PostgreSQL | DB | Local (Neon) + RDS (beta/prod) |
| Terraform >= 1.9 | Infrastructure as code | `infrastructure/aws/evia-beta/` |

---

## 16. Design / Branding

- **Fonts:** Poppins (Light/Regular/SemiBold) bundled as Flutter assets + web CSS
- **Design docs:** `docs/design/EVIA_Mobile_Design.md`, `docs/design/EVIA_Therapist_Portal_Design.md` (authoritative design specs)

---

## 17. Local Development Setup Summary

1. **Node.js 20+ + pnpm 9+**
2. **Flutter 3.x (stable)**
3. **Neon dev DB** (local) — `docs/neon-setup.md`
4. **AWS CLI v2** — for ECR/ECS inspection and deploys (`aws sts get-caller-identity` must work)
5. **Cognito therapist pool client** — only if you need real sign-in locally; otherwise use `HARD_HARNESS_LOCAL_DEV_BYPASS_AUTH`
6. Copy `.env.example` → `.env` and fill: `DATABASE_URL`, `LOCAL_DEV_BYPASS_AUTH`, `AWS_REGION`, `BEDROCK_MODEL_ID`, `SQS_SUMMARY_QUEUE_URL`, Cognito pool/client vars, Sarvam key
7. `pnpm install` (root) → `pnpm --filter @okuvu/prisma exec prisma generate` → `prisma migrate dev`
8. Start backend + portal; run Flutter with `--flavor dev --dart-define=FLAVOR=dev`

Bedrock access needs an AWS identity with `bedrock:InvokeModel` in `ap-south-1` and model access enabled for the Nova Pro and Titan Embeddings V2 models.

---

## 18. Key Constraints (from README)

1. **A1 safety gate is non-negotiable** — runs on every user turn.
2. **Crisis endpoints are never rate-limited** (`S3`/`S4` bypasses caps).
3. **AWS credentials never go in the repo** — Secrets Manager + IAM task roles only.
4. **Therapist portal session notes (T-05) are never ingested into any agent** (clinical boundary).
5. **All user data stays in ap-south-1 (Mumbai)** — one region covers compute, DB, storage, auth and LLM inference (DPDP compliance).

---

## 19. Documentation References (for further learning)

| Doc | What it covers |
|---|---|
| `docs/architecture.md` | High-level architecture |
| `docs/AWS-CUTOVER-SPEC.md` | Authoritative cutover contract (env vars, replacements) |
| `docs/AWS-MIGRATION-PLAN.md` | Phased migration plan |
| `docs/adr/` | Architecture Decision Records (monorepo, WebSocket auth, harness isolation, etc.) |
| `docs/branching.md` | Git branching strategy |
| `docs/neon-setup.md` | Local Neon dev DB |
| `docs/fastify_healthCheck_JWT.md` | Fastify auth details |
| `docs/okuvu-v2.0/*` | v2.0 parity, specs, system prompts for A1-A9 |
| `docs/test-harness/*` | Harness runbook, engineer/rater/sme guides |
| `docs/supervised-beta/*` | Supervised beta docs (consent, ethics, roster, completion) |

---

*End of tech inventory. This summary reflects the repository as of the current working tree.*
