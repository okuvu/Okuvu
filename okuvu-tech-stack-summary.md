# Okuvu — Complete Technology Stack & Tech Inventory

> Internal development repository — Suvok Systems LLP, Bengaluru
> Confidential. Do not share outside the engineering team.
> Version: 1.0

---

## 1. Project Overview

**Okuvu** is an AI-powered mental wellness companion for Indian Gen Z, built on a supervised therapist-led model. Users interact with an AI agent (A2) in bounded daily sessions; a licensed therapist oversees care plans and session notes via a separate portal.

This document inventories **every technology, library, framework, tool, and service** used in the project, organized by layer so you can learn the whole system.

---

## 2. Repo Structure (Monorepo)

```
okuvu/
├── apps/
│   ├── mobile/               Flutter app (Android-first MVP)
│   ├── api/                  Node.js/TypeScript backend — @okuvu/api
│   └── therapist-portal/     Next.js therapist portal — @okuvu/therapist-portal
│   └── test-harness/         Next.js test/evaluation harness — @okuvu/test-harness
├── packages/
│   ├── prisma/               Prisma schema + generated client — @okuvu/prisma
│   └── shared-types/         TypeScript types shared across apps — @okuvu/shared-types
├── scripts/                  Deployment & utility scripts
├── infra/                    Cloud Build + Cloud Run configs
├── load-tests/               k6 WebSocket load test scripts
└── docs/                     Architecture decisions, setup guides
```

**Package manager:** `pnpm@11.8.0` (declared in `packageManager` field). Node.js `>=20`. Pnpm workspace enforcing strict per-package isolation (hence the `packageExtensions` entry for `@google-cloud/aiplatform` → `protobufjs`).

---

## 3. Mobile App — Flutter

**Framework:** Flutter (Android-first MVP, iOS-ready). SDK `>=3.0.0 <4.0.0`. Android min SDK 21. Material Design.

### 3.1 Key Flutter Packages (pubspec.yaml)

| Package | Version | Purpose |
|---|---|---|
| `flutter_tts` | ^4.2.5 | Text-to-speech (device TTS) |
| `flutter_riverpod` | ^3.3.2 | Reactive state management |
| `go_router` | ^17.3.0 | Declarative navigation / routing |
| `firebase_core` | ^4.11.0 | Firebase Flutter SDK |
| `firebase_auth` | ^6.5.4 | Firebase Authentication (OTP) |
| `firebase_crashlytics` | ^5.2.6 | Crash reporting |
| `firebase_analytics` | ^12.4.5 | App analytics |
| `dio` | ^5.9.2 | HTTP client (API calls to backend) |
| `web_socket_channel` | ^3.0.1 | WebSocket client for live chat sessions |
| `connectivity_plus` | ^7.2.0 | Network connectivity monitoring |
| `url_launcher` | ^6.3.0 | Open URLs (links, emergency resources) |
| `fl_chart` | ^0.69.0 | Charts (progress/mood graphs) |
| `shared_preferences` | ^2.2.3 | Local key-value storage |
| `lucide_icons_flutter` | ^3.1.20 | Icon set |
| `speech_to_text` | ^7.5.0 | Speech-to-text input |
| `permission_handler` | ^13.0.2 | Runtime permissions |
| `share_plus` | ^13.3.0 | Share content |

### 3.2 Dev Dependencies

- `patrol: ^4.7.1` — instrumentation testing / E2E test framework
- `flutter_lints: ^6.0.0` — lint rules
- `flutter_test`, `integration_test` — Flutter testing SDKs
- `flutter_launcher_icons: ^0.14.2` — app icon generation

### 3.3 Firebase Features Used (Mobile)

- `firebase_auth` — OTP login for users
- `firebase_crashlytics` — crash reporting
- `firebase_analytics` — analytics

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
| `core/auth_service.dart`, `core/auth_interceptor.dart` | Auth + token intercept |
| `core/websocket_service.dart`, `websocket_constants.dart` | Live session WebSocket |
| `core/tts_service.dart` | Text-to-speech wrapper |
| `core/analytics_service.dart` | Firebase analytics |
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
| `firebase-admin` | ^14.1.0 | Firebase Admin SDK (auth, Firestore) |
| `ioredis` | ^5.4.1 | Redis client (caching, session state, coordination) |
| `pg` | ^8.22.0 | PostgreSQL driver |
| `dotenv` | ^16.4.7 | Environment configuration |
| `@google-cloud/aiplatform` | ^6.8.1 | Vertex AI / Gemini client |
| `@google-cloud/secret-manager` | ^6.0.1 | GCP Secret Manager (credential injection) |
| `@google-cloud/tasks` | ^6.2.3 | Cloud Tasks queue (background jobs) |
| `google-auth-library` | ^10.5.0 | GCP auth (worker/service accounts) |
| `@okuvu/prisma` | workspace | Shared Prisma layer |
| `@okuvu/shared-types` | workspace | Shared TypeScript types |

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

Supporting libs: `embedding.ts` (vector embeddings), `openrouter.ts` (OpenRouter provider fallback), `vertex-ai.ts`, `llm-provider.ts` (dispatcher), `memory-retrieval.ts` (retrieve persisted user memory), `retrieved-context-cache.ts` (Redis cache), `quote-of-day.ts`, `care-plan.ts`, `homework.ts`, `canned-response.ts`, `today-card.ts`, `tool-card.ts`, `sessions.ts`, `appointments.ts`, `invites.ts`, `auth-otp.ts`, `firebase-auth.ts`, `rate-limit.ts`, `redis.ts`, `session-open/close.ts`, `worker-health.ts`, `summary-enqueue.ts`, `progress.ts`, `email.ts`.

### 4.5 Routes

`src/routes/`: account, appointments, auth, health, invites, journal, progress, sessions, settings, users, waitlist, websocket.

### 4.6 Middleware / Error Handling

- `middleware/auth.ts` — JWT/OTP auth
- `errors/handler.ts` — centralized error handler
- `pipeline/fallbacks.ts` — deterministic fallbacks when LLM fails

### 4.7 Tests

Many unit tests under `src/__tests__/` (a1, a2, a8-router, a9, a9-post, account-delete, agent-context, appointments, auth, auth-verify-otp, care-plan, email, emergency-contact, error-handler, generate-content, health, invite-token-hash, invites, journal, journal-prompt-agent, llm-provider, mood-checkin, openrouter, orchestrator, orchestrator modes/latency, production-bypass, progress-mood, quote-of-day, rate-limit, session-close/open, sessions-srs, settings, users-consent, users-today-and-tool, vertex-ai, waitlist, websocket-session-idor, welcome).

### 4.8 Prompts

`src/prompts/*.txt` — A2/A9 prompt templates (read at runtime).

---

## 5. Background Worker — Node.js / TypeScript

**Purpose:** Cloud Tasks consumer — drains background jobs (session summarization, memory extraction, embedding backfill, etc.).

**Framework:** Same as API — Fastify 5.x + TypeScript + Vitest.

### 5.1 Key Dependencies

- `@okuvu/prisma`, `@okuvu/shared-types`
- `@google-cloud/aiplatform ^6.8.1` (Gemini)
- `@prisma/adapter-pg`, `@prisma/client`, `pg`
- `fastify ^5.3.2`
- `google-auth-library ^10.5.0` (OIDC auth for internal calls)
- `dotenv`, `pg`

### 5.2 Routes / Jobs

- `routes/health.ts`
- `routes/summary.ts` — session summarization
- `routes/beta-retention.ts` — beta data cleanup job (scheduled)
- `routes/cleanup.ts`
- `routes/index.ts`
- `routes/index.ts`
- `middleware/oidc-auth.ts` — OIDC auth for task-to-worker calls
- `lib/embedding.ts`, `lib/generate-content.ts`, `lib/memory-extraction.ts`, `lib/openrouter.ts`, `lib/prisma.ts`, `lib/summary.ts`, `lib/vertex-ai.ts`
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
| `next-auth` | ^4.24.14 | Authentication (Google OAuth for therapists) |
| `firebase` / `firebase-admin` | ^12.15.0 / ^14.1.0 | Firebase (client auth, admin) |
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
| Auth | `/auth` (Sign in) |
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
- `@google-cloud/aiplatform`, `@google-cloud/tasks` (externalized in webpack config)
- `xlsx ^0.18.5` (Excel export of results)
- `zod`, `next-auth`, `pg`
- `@okuvu/api`, `@okuvu/prisma`, `@okuvu/shared-types` (workspaces)

### 7.2 Dev Dependencies

- Tailwind v4, PostCSS, autoprefixer, TypeScript, Vitest

### 7.3 Configuration (next.config.ts)

Interesting build config because the harness is a Next.js app that **direct-imports** `@okuvu/api` source files (which use ESM `.js`→`.ts` imports). Key workarounds:

- `outputFileTracingRoot`, `outputFileTracingIncludes` to ship prompt files
- `webpack` config with `extensionAlias: '.js' → '.ts' + '.tsx'`
- `NormalModuleReplacementPlugin` to swap `../prompts/index.js` → a generated `prompt-shim.ts` (avoids Vercel packaging dropping runtime `.txt` reads)
- `config.externals` for `@google-cloud/tasks`, `@google-cloud/aiplatform`, `google-gax`, `next-auth` (server-only libs marked external so Node's require resolves them)

### 7.4 Pages / Features

| Page / Feature | What it does |
|---|---|
| Pipeline | Agent toggle, pipeline diagram, agent trace panel |
| Simulator | Scenario batteries, persona/persona-pair runner |
| Determinism | A8 state matrix, run diff view |
| Corpus | Case editor, bulk import (CSV), consent panel |
| Results | Comparison view, run list/detail |
| Review | Kappa results, rater progress, rubric form |
| Sampling | Sampling config/progress console |
| Fault Injection | Fault console, fault configs |
| CI | Gate status, regression runs (GitHub Actions integration) |

### 7.5 tRPC Routers (Test Harness)

`server/routers/`: `ci.ts`, `consent.ts`, `conversation.ts`, `corpus.ts`, `dashboard.ts`, `determinism.ts`, `faultInjection.ts`, `pipeline.ts`, `results.ts`, `results-export.ts`, `review.ts`, `scorecard.ts`, `simulator.ts`, `singleAgent.ts`, `stochastic.ts`, `testConfig.ts`, `example.ts`.

### 7.6 Tests

Hundreds of vitest tests under `src/__tests__/` (pipeline, determinism, fault-injection, review, kappa, simulator, corpus, canned-mode, continuity-asserts, dependency-graph, judge, run-diff, scorecard, etc.).

---

## 8. Database & ORM

**Database:** PostgreSQL (Neon for local dev; Cloud SQL for staging/prod).

**ORM:** Prisma 7.x

- `@prisma/client`, `@prisma/adapter-pg`, `prisma` (CLI)
- `packages/prisma/` — shared schema + generated client (`@okuvu/prisma`)
- Schema models include: `User`, `Therapist`, `ClinicalConfig`, `EmergencyContact`, `EngagementProfile`, `UserMemory`, `MoodLog`, `SafetyState`, `SessionLog`, `SessionSummary`, `TherapistClient`, `TherapistNote`, `Homework`, `Reminder`, `Appointment`, `InviteToken`, `WaitlistEntry`, `NotificationPreference`, `Turn`, `JournalEntry`, `ClinicalAccessLog`, `TestRun`, `CorpusCase`, `GateSignOff`, `PromptRegistryEntry`, `ModelConfigPin`, `BaselineArchive`, etc.

### 8.1 Prisma Migrations

~40 migrations (2026-06-23 → 2026-09-22) covering the full feature surface (e.g., `add_turn_model`, `add_therapist_model`, `add_journal_entry`, `add_mood_log`, `add_s06_inference_fields`, `add_governance_log`, `add_user_memory_table`, `add_summary_embedding`, `add_client_lifecycle_and_chat_access_request`, `add_appointment`, `add_invite_token_and_client_intake_fields`, `add_waitlist_entry`, `add_notification_preferences`, `add_homework_reminder_language_mode_registries`, `add_reminder_frequency_tool_link`, `drop_session_limit_and_tier`, `add_turn_taper_state`, `add_turn_s07_signal_fields`, `add_conversation_runner`, `add_turn_fallback_source`, `add_test_run_status_incomplete`, etc.).

### 8.2 Manual SQL (outside Prisma)

- `packages/prisma/enable_vector.sql`
- `packages/prisma/manual-migrations/001_test_harness_beta_rls.sql` — Row-Level Security for test harness (beta environment isolation). This is a hand-written, non-Prisma migration that must be run manually against each environment.

### 8.3 Seed

`packages/prisma/seed.ts` — seeds 3 test users + care plans in a transaction (Neon-dev seed script; also `seed-load-test.ts` for load tests).

---

## 9. Authentication & Identity

| Layer | Provider | Details |
|---|---|---|
| Mobile users | Firebase Authentication | OTP login; Firebase UID / phone number stored in DB |
| Therapist portal | NextAuth (Auth.js) + Google OAuth | Google OAuth for therapists; NextAuth session |
| Internal / worker-to-worker | OIDC + Google auth library | Service-account based auth for background jobs |
| Local dev bypass | `LOCAL_DEV_BYPASS_AUTH` env flag | Allows API calls without a real Firebase token (dev only, never set in Cloud Run) |

### 9.1 Sensitive Values (never committed)

- `FIREBASE_ADMIN_SDK_PATH` — local Firebase service account JSON
- `VERTEX_AI_SA_KEY_PATH` — local GCP service account JSON
- `EMERGENCY_CONTACT_ENCRYPTION_KEY` — base64 32-byte AES-256-GCM key (or retrieve from GCP Secret Manager)
- `OPENROUTER_API_KEY` — OpenRouter LLM key
- `SARVAM_API_KEY` — Sarvam TTS API key
- `NEXTAUTH_SECRET`, Google OAuth client ID/secret
- GCP credentials via Secret Manager + Workload Identity (never in repo)

---

## 10. AI / LLM Integration

### 10.1 Providers

| Provider | Models | Used by |
|---|---|---|
| **Vertex AI (Google)** — Gemini | `gemini-2.5-flash` (pro & flash-lite), `gemini-3.1-pro`/`gemini-3.1-flash-lite` | Clinical agents A1/A2/A9-pre/A9-post via `@google-cloud/aiplatform` |
| **OpenRouter** (fallback) | `meta-llama/llama-3.1-8b-instruct` | Fallback / comparison, and test harness default (`LLM_PROVIDER=openrouter`) |

### 10.2 LLM Architecture

- `apps/api/src/lib/llm-provider.ts` — dispatcher; resolves Gemini vs OpenRouter at runtime from env
- `apps/api/src/lib/vertex-ai.ts`, `apps/api/src/lib/openrouter.ts` — provider-specific clients
- `apps/api/src/lib/embedding.ts` — vector embeddings (VSCode/Neon embeddings for memory & recall)
- `apps/api/src/lib/generate-content.ts` — central `generateContent` generation entry point
- `apps/api/src/agents/` — A1 safety gate, A2 companion, A9 pre/post governance, journal-prompt, a8-router, orchestrator

### 10.3 Text-to-Speech

- **Sarvam TTS (Bulbul v2)** — `SARVAM_TTS_MODEL="bulbul:v2"`, `SARVAM_DEFAULT_LANGUAGE="en-IN"`
- `apps/mobile/lib/src/core/tts_service.dart` — Flutter TTS wrapper
- GCP Cloud Storage buckets (`evia-tts-audio-dev`, `evia-assets-dev`) + signed URLs for cached TTS audio
- GCP Cloud KMS for encryption

### 10.4 Voice Mode

- `apps/mobile` voice toggle widget + `voice_settings_notifier.dart` (settings)
- `tts_service.dart` + `voice_toggle.dart` widgets

---

## 11. Real-Time / WebSocket

**Library:** `@fastify/websocket` (API) + `web_socket_channel` (Flutter mobile client)

- `apps/api/src/routes/websocket.ts` — WebSocket endpoint for live chat sessions
- Session lifecycle: `SESSION_OPEN` → `USER_TURN` → `AGENT_TURN` → `SESSION_CLOSE`
- Frame types defined in `@okuvu/shared-types` (`SessionOpenFrame`, `UserTurnFrame`, `AgentTurnFrame`, `CrisisSignalFrame`, `ToolResultFrame`, `SessionCloseFrame`, etc.)
- `apps/mobile/lib/src/core/websocket_service.dart` + `websocket_constants.dart`

---

## 12. Caching & Queueing (GCP services)

| GCP Service | Purpose |
|---|---|
| **Memorystore Redis** | Caching (retrieved-context-cache), session coordination |
| **ioredis** (Node) | Redis client in API |
| **Cloud Tasks** | Background job queue (session summary, memory extraction, cleanup jobs) |
| **@google-cloud/tasks** | Node client for enqueueing tasks |
| **GCP Cloud Storage** | TTS audio + assets; signed URLs |
| **GCP Secret Manager** | Credential injection at deploy time |
| **GCP Cloud KMS** | Encryption keys (AES-256-GCM for emergency contacts) |
| **Cloud Run** | Hosts `apps/api` (backend) + `apps/worker` |
| **Cloud Build** + **Artifact Registry** | CI/CD builds |

---

## 13. Infrastructure & Deployment

### 13.1 Deployment Targets

| Environment | GCP Project | Provisioned by |
|---|---|---|
| Dev | `evia-dev` | Local machine (Neon DB) |
| Staging | `evia-500215` | Git `main` branch (auto) |
| Prod | `evia-production` | Git tag `v*` (manual) |

### 13.2 Infrastructure as Code (Terraform)

`infrastructure/gcp/evia-beta/` — Terraform for the evia-beta GCP project:

- `main.tf`, `providers.tf`, `variables.tf`, `outputs.tf`, `terraform.tfvars.example`
- `cloud-sql/` — Cloud SQL (Postgres) backend + variables, secrets, outputs, deploy/verify scripts

### 13.3 Deploy Scripts

- `scripts/deploy-beta.sh` — builds + deploys `apps/api` to Cloud Run (includes Cloud SQL proxy, `prisma migrate deploy`, Secret Manager injection, Cloud Build)
- `scripts/deploy-worker.sh` — builds + deploys `apps/worker` to Cloud Run
- `infrastructure/gcp/evia-beta/verify.sh` / `verify.ps1` — GCP project/state verification
- `cloudbuild.yaml` — Cloud Build config: builds Docker image, runs migrations via Cloud SQL proxy, pushes to Artifact Registry

### 13.4 Dockerfiles

- `apps/api/Dockerfile` — multi-stage Node 22 Alpine, pnpm, `prisma generate`, builds `@okuvu/api`
- `apps/worker/Dockerfile` — same pattern for `@okuvu/worker`

---

## 14. CI/CD & DevOps

- **Cloud Build** — automated builds on `main` → stage
- **Artifact Registry** — container image storage
- **Cloud Run** — API + worker runtime
- **Vercel** — test-harness hosting (`vercel.json` in `apps/test-harness`)
- **GitHub Actions** — referenced by test-harness CI router (regression workflow) + `GITHUB_TOKEN` for gate status / regression triggering
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
| PostgreSQL | DB | Local (Neon) + Cloud SQL (stage/prod) |

---

## 16. Design / Branding

- **Fonts:** Poppins (Light/Regular/SemiBold) bundled as Flutter assets + web CSS
- **Design docs:** `docs/design/EVIA_Mobile_Design.md`, `docs/design/EVIA_Therapist_Portal_Design.md` (authoritative design specs)

---

## 17. Local Development Setup Summary

1. **Node.js 20+ + pnpm 9+**
2. **Flutter 3.x (stable)**
3. **Neon dev DB** (local) — `docs/neon-setup.md`
4. **GCP CLI** (`gcloud`) — for Cloud Run verification/Deploy
5. **Firebase** — dev service account JSON for Firebase Admin SDK
6. **GCP service account** — for Vertex AI
7. Copy `.env.example` → `.env` and fill: `DATABASE_URL`, `FIREBASE_ADMIN_SDK_PATH`, `VERTEX_AI_SA_KEY_PATH`, `LOCAL_DEV_BYPASS_AUTH`, LLM keys, Sarvam key, GCP bucket/KMS values
8. `pnpm install` (root) → `pnpm --filter @okuvu/prisma exec prisma generate` → `prisma migrate dev`
9. Start backend + portal; run Flutter with `--flavor dev --dart-define=FLAVOR=dev`

---

## 18. Key Constraints (from README)

1. **A1 safety gate is non-negotiable** — runs on every user turn.
2. **Crisis endpoints are never rate-limited** (`S3`/`S4` bypasses caps).
3. **GCP credentials never go in the repo** — Secret Manager only.
4. **Therapist portal session notes (T-05) are never ingested into any agent** (clinical boundary).
5. **All user data stays in asia-south1 (Mumbai)** — single GCP DPA (DPDP compliance).

---

## 19. Documentation References (for further learning)

| Doc | What it covers |
|---|---|
| `docs/architecture.md` | High-level architecture |
| `docs/ADR/` | Architecture Decision Records (GCP monorepo, WebSocket auth, harness isolation, etc.) |
| `docs/branching.md` | Git branching strategy |
| `docs/neon-setup.md` | Local Neon dev DB |
| `docs/fastify_healthCheck_JWT.md` | Fastify auth details |
| `docs/okuvu-v2.0/*` | v2.0 parity, specs, system prompts for A1-A9 |
| `docs/test-harness/*` | Harness runbook, engineer/rater/sme guides |
| `docs/supervised-beta/*` | Supervised beta docs (consent, ethics, roster, completion) |

---

*End of tech inventory. This summary reflects the repository as of the current working tree.*
