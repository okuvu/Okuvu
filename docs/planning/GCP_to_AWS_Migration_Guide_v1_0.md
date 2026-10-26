# OKUVU — GCP → AWS Migration Guide v1.0

> **Audience:** you (the code owner) + engineers executing the migration.
> **Purpose:** (1) an inventory of what is in this codebase and where, (2) an exhaustive map of every external service touchpoint, (3) a file-by-file change list for migrating GCP → AWS.
> **Verified against the codebase on 27 Sep 2026.** Every path in this document was confirmed by search; if code moves, update this doc.

---

## 0. Executive summary

The stack today is GCP-heavy but not GCP-pure:

| Layer | Today | Migration effort |
|---|---|---|
| Compute (API + worker) | GCP Cloud Run | **High** — new deploy pipeline + infra |
| Database (staging/prod) | GCP Cloud SQL (Postgres + pgvector) | **High** — data migration + pgvector on RDS |
| Database (local dev, CI) | **Neon** (SaaS, not GCP) | **Decision needed** — can stay as-is |
| Auth (end users) | Firebase Auth phone/OTP | **High** — Cognito, user migration, mobile SDK |
| Auth (therapists) | NextAuth + Google OAuth (portal) | **Low** — Google OAuth is not GCP-bound |
| LLM | OpenRouter (default) / Vertex AI Gemini (rollback) | **Medium** — add Bedrock as a third provider or replace Gemini path |
| Embeddings | Vertex AI `text-embedding-004` (768-dim) | **Medium-High** — model change forces re-embedding |
| Async queue | Cloud Tasks → worker HTTP + OIDC | **High** — SQS + new worker trigger model |
| Secrets | GCP Secret Manager | **Medium** — AWS Secrets Manager |
| Rate-limit cache | Memorystore Redis (REDIS_URL) | **Low** — ElastiCache, ioredis code unchanged |
| Mobile telemetry | Firebase Crashlytics + Analytics | **Medium** — re-platform or keep Firebase |
| CI/CD | Cloud Build + gcloud scripts | **High** — CodeBuild/GHA + ECR |
| Infra-as-code | Terraform (`infrastructure/gcp/evia-beta`) | **High** — new AWS Terraform |
| Portal & test harness hosting | **Vercel** (not GCP) | **None required** (decision optional) |
| Email | Brevo (SaaS) | **None** |
| File storage | Cloud Storage — **provisioned in Terraform but unused in code** | **None / opportunistic** |

⚠️ **Governance note:** `docs/architecture.md` and `docs/adr/001-gcp-monorepo.md` record "GCP only, no AWS" as a *deliberate, do-not-relitigate* decision made for DPDP 2026 compliance (single-vendor DPA) and to avoid cross-cloud LLM latency. This migration reverses ADR-001a — it must be formally re-decided, and DPDP adequacy of AWS **ap-south-1 (Mumbai)** + Bedrock must be cleared by legal before real user data moves. Update both documents as part of the migration, not after.

---

## 1. Codebase inventory — what lives where

```
okuvu/  (pnpm monorepo, Node >= 20, pnpm 11.8.0)
├── apps/
│   ├── mobile/               Flutter app (NOT an npm workspace member)
│   ├── api/                  Fastify backend  → GCP Cloud Run ("backend" service)
│   ├── worker/               Fastify job worker → GCP Cloud Run ("evia-worker" service)
│   ├── therapist-portal/     Next.js 16 portal → Vercel (own project)
│   └── test-harness/         Next.js 16 QA tool → Vercel (own project, separate)
├── packages/
│   ├── prisma/               schema.prisma + migrations + seed (shared)
│   └── shared-types/         shared TS types
├── infrastructure/gcp/evia-beta/   Terraform (GCP project + Cloud SQL + secrets + Cloud Tasks queue)
├── scripts/                  deploy-beta.sh, deploy-worker.sh (gcloud/Cloud Build)
├── cloudbuild.yaml           API image build + prisma migrate deploy (via Cloud SQL Proxy)
├── .github/workflows/        ci.yml, regression.yml, pr-review.yml
├── .env.example              single env template for all Node apps (root .env is loaded by all)
└── docs/                     architecture.md, adr/, neon-setup.md, planning/, testing/
```

### 1.1 apps/api (Fastify, port 8080)

| Area | Files | Notes |
|---|---|---|
| Entry/boot | `src/server.ts`, `src/app.ts`, `src/env.ts` | env.ts loads **root** `.env`; server.ts fails boot on prod-bypass + DB + worker health |
| Routes | `src/routes/`: account, appointments, auth, health, invites, journal, progress, sessions, settings, users, waitlist, websocket, index | all authed routes use `verifyFirebaseJWT` preHandler |
| Agent pipeline | `src/pipeline/orchestrator.ts`; `src/agents/a1`, `a2`, `a9`, `a9-post` | LLM calls all funnel through `src/lib/generate-content.ts` |
| LLM clients | `src/lib/generate-content.ts` (dispatcher), `src/lib/vertex-ai.ts` (Gemini), `src/lib/openrouter.ts` (OpenRouter), `src/lib/llm-provider.ts` (dead Sarvam stub) | `LLM_PROVIDER` env: `openrouter` (default) \| `gemini` (rollback) |
| Embeddings | `src/lib/embedding.ts` | Vertex AI `text-embedding-004`, 768 dims |
| Auth | `src/middleware/auth.ts` (verifyFirebaseJWT + LOAD_TEST + bypass), `src/lib/firebase-auth.ts` (firebase-admin `verifyIdToken`) | token from `Authorization` header |
| Async enqueue | `src/lib/summary-enqueue.ts` (Cloud Tasks `createTask`), `src/lib/session-close.ts` (calls it), `src/lib/worker-health.ts` (reads `WORKER_URL` \|\| `CLOUD_TASKS_WORKER_URL`) | dev bypass posts HTTP directly |
| Redis / rate limiting | `src/lib/redis.ts` (ioredis), `src/lib/rate-limit.ts`, `src/app.ts` (@fastify/rate-limit global 300/min) | REDIS_URL optional, fails open |
| Secrets/crypto | `src/crypto/emergency-contact-encryption.ts` (AES-256-GCM; key from `EMERGENCY_CONTACT_ENCRYPTION_KEY` env **or** GCP Secret Manager `emergency-contact-key`) | the ONLY Secret Manager import in the API |
| DB | `src/lib/prisma.ts` (pg Pool + PrismaPg adapter) | DATABASE_URL |
| Email | `src/lib/email.ts` | Brevo REST (fetch), no SDK |
| Docker | `Dockerfile` (node:22-alpine, pnpm workspace build) | |
| Misc | `prisma.config.ts` (schema path + root .env), `load-tests/` (k6, hardcodes `wss://evia-beta-xxxx-uc.a.run.app/ws`) | |

### 1.2 apps/worker (Fastify, port 3002/8080)

| Area | Files | Notes |
|---|---|---|
| Entry | `src/server.ts`, `src/app.ts`, `src/index.ts` | |
| Trigger routes | `src/routes/summary.ts` (`POST /tasks/summary`), `src/routes/cleanup.ts` (`POST /cleanup/summary-reprocess`), `src/routes/beta-retention.ts`, `src/routes/health.ts` | summary/cleanup gated by OIDC middleware |
| Trigger auth | `src/middleware/oidc-auth.ts` (google-auth-library `verifyIdToken`, audience = `CLOUD_TASKS_WORKER_URL`, email = `WORKER_SERVICE_ACCOUNT_EMAIL`) | exists **only** to authenticate Cloud Tasks |
| Jobs | `src/lib/summary.ts` (session summary + embedding via raw SQL), `src/lib/memory-extraction.ts` | |
| LLM | `src/lib/generate-content.ts`, `src/lib/vertex-ai.ts`, `src/lib/openrouter.ts` | own copy of the dispatcher (services don't share code) |
| Embeddings | `src/lib/embedding.ts`; `src/scripts/backfill-embeddings.ts` (raw SQL `::vector`) | |
| DB | `src/lib/prisma.ts` | |
| Docker | `Dockerfile` | |

### 1.3 apps/therapist-portal (Next.js 16, Vercel)

| Area | Files | Notes |
|---|---|---|
| Auth | `src/lib/auth.ts` (NextAuth v4 + **Google OAuth**; JWT strategy, 12h) | Google OAuth ≠ GCP compute — survives migration |
| DB | `src/lib/prisma.ts`, `src/server/trpc.ts` (tRPC + per-resource authz) | DATABASE_URL |
| Email | `src/lib/email.ts` (Brevo) | |
| Boot guard | `instrumentation.ts` (fails deploy if LOCAL_DEV_BYPASS_AUTH in prod) | |
| Emulator | `firebase.json` (auth emulator, ports 9099/4000), `package.json` `emulator` script | dev-only |
| Deps | `firebase`, `firebase-admin` in package.json — **declared but no runtime import found** (README describes an Admin-SDK verification flow that is not wired) | cleanup opportunity |
| Deploy | `vercel.json` (pnpm filters), Vercel Root Directory = `apps/therapist-portal` | |

### 1.4 apps/test-harness (Next.js 16, Vercel)

| Area | Files | Notes |
|---|---|---|
| Direct-imports | `src/lib/agent-adapter.ts`, `pipeline-runner.ts` import **apps/api's** modules (incl. vertex-ai/tasks code paths) | inherits every API LLM/queue change |
| Worker trigger | `src/lib/agent-adapter.ts` POSTs `/tasks/summary` directly | unaffected by queue swap |
| Build | `next.config.ts` — webpack externals include `@google-cloud/tasks`, `@google-cloud/aiplatform`, `google-gax` | **must be updated** when GCP libs are swapped |
| Deps | `@google-cloud/tasks`, `@google-cloud/aiplatform` in package.json | |
| Hosting | `vercel.json`; `firebase.json` (frameworksBackend us-central1 — **never deployed**, per docs; candidate for deletion) | |

### 1.5 apps/mobile (Flutter)

| Area | Files | Notes |
|---|---|---|
| Firebase init + crash | `lib/main.dart` (`Firebase.initializeApp`, Crashlytics handlers) | |
| Auth | `lib/src/core/auth_service.dart` (FirebaseAuth), `lib/src/core/auth_interceptor.dart`, `lib/src/features/auth/otp_login_screen.dart` (phone OTP + FirebaseAuthException) | |
| Analytics | `lib/src/core/analytics_service.dart` (FirebaseAnalytics; thin — 1 call site) | |
| Endpoints | `lib/src/config/environment.dart` — beta/prod hardcode `backend-971397352159.asia-south1.run.app`; `lib/src/config/app_config.dart` (BASE_URL/WS_URL dart-defines override) | **must change** |
| Android | `android/app/build.gradle` (google-services + crashlytics plugins, firebase-bom), `android/build.gradle`, `android/settings.gradle`, `android/google-services.json(.example)` | |
| iOS | `ios/Runner/GeneratedPluginRegistrant.m` (auto-generated) | regenerated |
| Config | `pubspec.yaml` (firebase_core/auth/crashlytics/analytics), `pubspec.lock` | |
| Docs | `README.md` flavors table ("GCP Cloud Run staging/production") | |
| TTS | `lib/src/core/tts_service.dart` + `flutter_tts` | **client-side, unaffected** |

### 1.6 packages/prisma

- `schema.prisma` — Postgres; **`SessionLog.summary_embedding` is `Unsupported("vector(768)")`** → any DB target must have pgvector; any embedding-model change must keep or migrate dimensions.
- `User.firebase_uid String? @unique` — the identity join key between app DB and Firebase Auth. **This column's semantics change under Cognito** (see §6.4).
- Migrations in `packages/prisma/migrations/`; `seed.ts`, `seed-load-test.ts` (mock firebase_uid values — fine).

### 1.7 Infra / CI / config

| File | What it does | GCP coupling |
|---|---|---|
| `cloudbuild.yaml` | Builds API image (Artifact Registry `us-central1-docker.pkg.dev`), runs `prisma migrate deploy` **through Cloud SQL Proxy** (`_CLOUD_SQL_INSTANCE: evia-500215:asia-south1:evia-db`), pulls `DATABASE_URL` from Secret Manager | Total |
| `scripts/deploy-beta.sh` | gcloud builds submit + `gcloud run deploy backend` — Cloud SQL instance mount, Secret Manager bindings (`DATABASE_URL`, `SARVAM_API_KEY`), env vars (`FIREBASE_PROJECT_ID`, `VERTEX_AI_*`, `GEMINI_*`), min1/max4, load-test flag | Total |
| `scripts/deploy-worker.sh` | Same for `evia-worker` (GCR image, secrets, `--no-allow-unauthenticated`) | Total |
| `infrastructure/gcp/evia-beta/main.tf` | GCP project, APIs (Run/SQL/Firebase Auth/Storage/Vertex/Secret Manager/Tasks/Scheduler), SA `evia-app` + IAM roles, **Cloud Tasks queue `evia-summary-queue-beta`** (rate+retry config) | Total |
| `infrastructure/gcp/evia-beta/cloud-sql/` | `cloudsql.tf` (Postgres instance `evia-db`, ZONAL, SSL, backups), `secrets.tf` (Secret Manager: DATABASE_URL, SARVAM_API_KEY, GOOGLE_APPLICATION_CREDENTIALS + IAM) | Total |
| `infrastructure/gcp/evia-beta/verify.{sh,ps1}` | Post-apply API/IAM verification | Total |
| `.github/workflows/ci.yml` | Typecheck+tests for api/worker/portal/harness; Flutter; **security scan greps for GCP credential filenames**; CI Postgres = Neon (`CI_DATABASE_URL`) | Partial |
| `.github/workflows/regression.yml` | A8 state-space check (no GCP) | None |
| `.github/workflows/pr-review.yml` | OpenCode review (no GCP) | None |
| `.env.example` | Every GCP env var (see §5) | Total (template) |
| `pnpm-workspace.yaml` | `packageExtensions` for `@google-cloud/aiplatform` (protobufjs); `allowBuilds` for `@firebase/util` | Partial |
| `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/adr/001-gcp-monorepo.md` | Document the GCP-only decision + stack | Must be rewritten |

---

## 2. External service touchpoints — the definitive map

### 2.1 GCP services (must change)

| # | GCP service | Used for | Code touchpoints (exact) |
|---|---|---|---|
| 1 | **Cloud Run** | Hosts `backend` (apps/api) and `evia-worker` (apps/worker) | Deploy scripts; mobile `environment.dart` URLs (`backend-971397352159.asia-south1.run.app`); k6 configs `apps/api/load-tests/{k6-websocket-load.js,config.js}`; `apps/api/src/app.ts` `trustProxy` comment; worker oidc tests' audience strings |
| 2 | **Cloud SQL (Postgres)** | Staging/prod DB (`evia-500215:asia-south1:evia-db`) | `cloudbuild.yaml` (proxy + migrate), `scripts/deploy-*.sh` (`--add-cloudsql-instances`), `infrastructure/gcp/evia-beta/cloud-sql/*`, all `DATABASE_URL` consumers (`apps/api/src/lib/prisma.ts`, `apps/worker/src/lib/prisma.ts`, `apps/therapist-portal/src/lib/prisma.ts`, `packages/prisma/*` scripts) |
| 3 | **Firebase Authentication** | User phone-OTP (mobile) | **API:** `apps/api/src/lib/firebase-auth.ts`, `src/middleware/auth.ts` (all routes), `FIREBASE_PROJECT_ID`/`JWT_ISSUER`/`JWT_AUDIENCE` env, `LOCAL_DEV_BYPASS_AUTH` paths. **DB:** `User.firebase_uid` written by `POST /invites/redeem` (`apps/api/src/routes/invites.ts`, `src/lib/auth-otp.ts`), portal `admin.ts` flow. **Mobile:** `auth_service.dart`, `otp_login_screen.dart`, `main.dart`. **Test-harness:** synthetic `test-user-*` firebase_uid patterns |
| 4 | **Vertex AI — Gemini** | LLM rollback path for A1/A2/A9-pre/A9-post + worker jobs | `apps/api/src/lib/vertex-ai.ts`, `src/lib/generate-content.ts`; `apps/worker/src/lib/{vertex-ai.ts,generate-content.ts}`; agent files read `GEMINI_PRO_MODEL`/`GEMINI_FLASH_LITE_MODEL` (`src/agents/a9/agent.ts`, `src/agents/a9-post/agent.ts`); tests `__tests__/vertex-ai.test.ts` + many mock literals `gemini-2.5-flash` |
| 5 | **Vertex AI — embeddings** | `text-embedding-004` (768-d) for session-summary similarity | `apps/api/src/lib/embedding.ts`, `apps/worker/src/lib/embedding.ts`, `apps/worker/src/lib/summary.ts` (stores `::vector`), `apps/worker/src/scripts/backfill-embeddings.ts`, schema `vector(768)` |
| 6 | **Cloud Tasks** | Async queue → worker `POST /tasks/summary` (OIDC) | **Producer:** `apps/api/src/lib/summary-enqueue.ts` (CloudTasksClient), called from `src/lib/session-close.ts`; env `CLOUD_TASKS_{PROJECT_ID,QUEUE,LOCATION,WORKER_URL}`, `WORKER_SERVICE_ACCOUNT_EMAIL`; boot validation in `apps/api/src/app.ts`. **Consumer:** `apps/worker/src/middleware/oidc-auth.ts`, `src/routes/summary.ts`, `src/routes/cleanup.ts`. **Terraform:** `google_cloud_tasks_queue.summary_queue`. **Test-harness:** `src/server/routers/conversation.ts` comments, `next.config.ts` externals, package.json dep |
| 7 | **Secret Manager** | Runtime secrets + emergency-contact key | `apps/api/src/crypto/emergency-contact-encryption.ts` (SecretManagerServiceClient, secret `emergency-contact-key`, project from `VERTEX_AI_PROJECT_ID`); `cloudbuild.yaml` `availableSecrets`; deploy scripts `--set-secrets`; Terraform `cloud-sql/secrets.tf` |
| 8 | **Cloud Storage** | Buckets `evia-tts-audio-dev`, `evia-assets-dev` | **No code usage found** — env template (`GCP_BUCKET_*`, `GCP_*_URL_EXPIRY_SECONDS` in `.env.example`) + Terraform API/role only. Legacy of the old server-side TTS design (TTS is client-side `flutter_tts` today). Treat as dead config; decide S3 equivalent only if you plan to use storage |
| 9 | **Cloud KMS** | *Not used.* Env vars `CLOUD_KMS_*` exist in `.env.example` but code does application-layer AES-256-GCM (per `docs/architecture.md` correction) | Delete from env template; don't build a KMS equivalent |
| 10 | **Memorystore Redis** | Rate limiting (global HTTP + per-user WS turns) | `apps/api/src/lib/redis.ts` (ioredis, `REDIS_URL`), `src/lib/rate-limit.ts`, `src/app.ts` plugin wiring, Terraform/SMS nothing — instance referenced only via REDIS_URL. **Code is cloud-agnostic** |
| 11 | **Cloud Scheduler** | Provisioned (Terraform `google_project_service.cloud_scheduler`) for future push cron | Nothing consumes it (push/FCM is unbuilt — `okuvu-remaining-changes.md`) |
| 12 | **Cloud Build + Artifact Registry / GCR** | CI image builds | `cloudbuild.yaml`, both deploy scripts |
| 13 | **Cloud Monitoring/Logging** | Observability | Nothing in code (stdout JSON logs picked up by Cloud Run). On AWS → CloudWatch |
| 14 | **Firebase (mobile telemetry)** | Crashlytics + Analytics | `apps/mobile`: `main.dart`, `analytics_service.dart`, gradle files, `pubspec.yaml` |
| 15 | **Service accounts / ADC / Workload Identity** | All GCP client auth | `firebase-admin` `applicationDefault()` (`firebase-auth.ts`), `GOOGLE_APPLICATION_CREDENTIALS_JSON` env-var credential injection (`apps/api/src/lib/vertex-ai.ts` — used by Vercel-hosted test-harness), `GOOGLE_APPLICATION_CREDENTIALS` secret (Terraform), Cloud Run runtime SA |

### 2.2 Non-GCP services — verify, mostly unchanged

| Service | Used for | Touchpoints | Migration impact |
|---|---|---|---|
| **Neon** | Local dev DB (branch/developer) + CI DB | `docs/neon-setup.md`, `.env.example` DATABASE_URL, CI `CI_DATABASE_URL` secret, pool-error comments referencing Neon idle suspension | **None technically** — Neon is vendor-agnostic Postgres over TLS. Decision: keep (cheapest) or fold dev into RDS. If kept: nothing changes |
| **OpenRouter** | Primary LLM (Llama-3.1-8B) | `apps/api/src/lib/openrouter.ts`, `apps/worker/src/lib/openrouter.ts`, `OPENROUTER_*` env | None — plain HTTPS SaaS |
| **Brevo** | Transactional email (invites, waitlist) | `apps/api/src/lib/email.ts`, `apps/therapist-portal/src/lib/email.ts`, `BREVO_*` env | None |
| **Sarvam** | TTS — **stub only, never wired** (TTS is client-side `flutter_tts`) | `apps/api/src/lib/llm-provider.ts` (dead), `SARVAM_*` env, deploy script secret binding | None. Good moment to delete the stub + `SARVAM_API_KEY` secret binding |
| **SendGrid** | Placeholder only, unwired | `SENDGRID_*` env | None |
| **Google OAuth** | Therapist portal login | `apps/therapist-portal/src/lib/auth.ts`, `GOOGLE_CLIENT_ID/SECRET` | **Stays** — client IDs live in Google Cloud Console (auth product), not tied to GCP compute. Keep the Google project for OAuth even after AWS cutover |
| **Vercel** | Portal + test-harness hosting | `apps/*/vercel.json`, `next.config.ts` comments, `VERCEL_GIT_COMMIT_SHA` in `apps/test-harness/src/lib/run-identity.ts` | None required. Optional: move to AWS Amplify Hosting if you want single-vendor (extra work, not needed for the GCP exit) |
| **Sentry/Datadog etc.** | Not present (audit confirms) | — | N/A |
| **Discord/ClickUp/GitHub** | CI plumbing | `pr-review.yml` | None |

---

## 3. Target AWS architecture (proposed mapping)

| GCP today | AWS target | Rationale / notes |
|---|---|---|
| Cloud Run (API) | **AWS App Runner** (simplest) or **ECS Fargate + ALB** (more control, WebSockets-friendly) | API holds **WebSockets** — Fargate + ALB is the safer default; App Runner supports WS but fewer knobs. Container images from `apps/api/Dockerfile`, `apps/worker/Dockerfile` carry over nearly unchanged |
| Cloud Run (worker) | ECS Fargate service (private, no ALB) or AWS Batch | No longer needs public HTTP endpoints if consumed via SQS (see below) |
| Cloud SQL | **RDS PostgreSQL 16 + `pgvector`** (ap-south-1) | Supports the extension; enable SSL, backups, Multi-AZ for prod (mirrors ZONAL today) |
| Neon (dev/CI) | **Keep Neon** (recommended) or RDS dev instance | Zero code change if kept |
| Firebase Auth | **Amazon Cognito** user pool, phone-number sign-in via **SNS SMS** | Biggest single work item (mobile SDK + API verification + user migration + invite redemption semantics) |
| Vertex AI Gemini | **AWS Bedrock** (e.g. Claude / Llama family) as a new provider in the existing dispatcher | The `generate-content.ts` dispatcher pattern already abstracts providers — add `bedrock` alongside `openrouter`; keep or drop `gemini` path |
| Vertex AI text-embedding-004 | **Bedrock Titan Embeddings / Cohere via Bedrock** | ⚠️ dimension mismatch risk — see §6.3. Cheapest correct option: keep 768-dim by choosing a model with matching dims, else alter column + re-embed |
| Cloud Tasks | **SQS** queue + DLQ; worker consumes via SQS (poll) or a small HTTP adapter | Deletes the entire OIDC-auth middleware problem — SQS auth is IAM/transport-level |
| Cloud Scheduler | EventBridge Scheduler | Not needed yet (nothing consumes it) |
| Secret Manager | **AWS Secrets Manager** (or SSM Parameter Store) | Emergency-contact key + DATABASE_URL + any API keys |
| Memorystore | **ElastiCache for Redis** | `REDIS_URL` swap only |
| Cloud Storage | S3 | Only if you actually adopt object storage (currently unused) |
| Cloud KMS | KMS | Not used; optional envelope encryption later |
| Artifact Registry | **ECR** | |
| Cloud Build | **CodeBuild** or GitHub Actions | GitHub Actions already exists in-repo for CI — extending it for build/deploy avoids a new tool |
| Cloud Monitoring/Logging | CloudWatch Logs + alarms | API/worker already log structured JSON to stdout |
| IAM service account `evia-app` | **Task roles / instance roles** (IRSA not needed; ECS task roles) | Replaces ADC — AWS SDKs pick up task credentials automatically |
| Terraform GCP | **New Terraform AWS stack** (`infrastructure/aws/`): VPC, ECS, RDS, ElastiCache, SQS, Secrets Manager, ECR, Cognito, Bedrock model access, CloudWatch | Keep same module discipline as `infrastructure/gcp/evia-beta` |

---

## 4. Workplan — every change, by file

Legend: 🔴 rewrite required · 🟡 moderate edit · 🟢 delete/simplify · ⚪ untouched

### 4.1 apps/api

| File | Change |
|---|---|
| `package.json` 🔴 | Remove `@google-cloud/aiplatform`, `@google-cloud/tasks`, `@google-cloud/secret-manager`, `firebase-admin`. Add `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-sqs`, `@aws-sdk/client-secrets-manager`, `aws-jwt-verify` (Cognito) |
| `src/lib/vertex-ai.ts` 🔴 | Replace with a Bedrock client (`bedrock-invoke.ts` or similar) keeping the same `GenerateContentParams/Result` contract so the pipeline doesn't change. Move canned-mode logic into the new module unchanged |
| `src/lib/generate-content.ts` 🟡 | Dispatcher: `LLM_PROVIDER` gains `bedrock` (make it default or keep `openrouter` — decision §7); delete or keep `gemini` branch depending on whether you keep any GCP rollback |
| `src/lib/embedding.ts` 🔴 | Bedrock embeddings client. Output must match the DB vector dimension (§6.3) |
| `src/lib/summary-enqueue.ts` 🔴 | Cloud Tasks `createTask` → SQS `SendMessage` (payload identical `{session_id, user_id}`; keep the MAX_RETRIES/backoff loop or drop it — SQS handles delivery). Local-dev HTTP bypass branch can stay |
| `src/app.ts` 🟡 | Replace `validateCloudTasksConfig()` boot warning with SQS config validation (queue URL, region). `trustProxy: true` stays (ALB also proxies); update its comment |
| `src/lib/worker-health.ts` 🟡 | Env alias `CLOUD_TASKS_WORKER_URL` → new name (`WORKER_URL` stays primary). If worker is SQS-only, this health check changes meaning (TCP ping vs SQS queue depth) |
| `src/lib/firebase-auth.ts` 🔴 | Replace firebase-admin with Cognito verification: `aws-jwt-verify` (`JwtRsaVerifier` / `CognitoJwtVerifier`), issuer `https://cognito-idp.<region>.amazonaws.com/<poolId>` |
| `src/middleware/auth.ts` 🟡 | Same shape; `LOCAL_DEV_BYPASS_AUTH` and `LOAD_TEST_MODE` logic unchanged. UID semantics = Cognito `sub` |
| `src/routes/invites.ts` + `src/lib/auth-otp.ts` 🟡 | Logic unchanged, but the token being verified is now Cognito. Keep `firebase_uid` column name (§6.4) or rename in the same PR |
| `src/crypto/emergency-contact-encryption.ts` 🔴 | Replace SecretManagerServiceClient with `@aws-sdk/client-secrets-manager` (`GetSecretValue`, secret name `emergency-contact-key`). Keep env-var-first ordering (`EMERGENCY_CONTACT_ENCRYPTION_KEY` still wins — that's also your migration lever, §6.5) |
| `src/lib/redis.ts` ⚪ | Code unchanged; `REDIS_URL` now points at ElastiCache (`rediss://` if in-transit encryption enabled — ioredis handles TLS) |
| `src/lib/prisma.ts` ⚪ | DATABASE_URL swap only. Remove/keep the Neon idle-suspension comment as applicable |
| `src/lib/llm-provider.ts` 🟢 | Dead Sarvam stub — delete (and its test) while you're here |
| `src/agents/**` ⚪/🟡 | No code change unless you remove the Gemini path (then drop `GEMINI_*_MODEL` reads in `a9/agent.ts`, `a9-post/agent.ts`) |
| `src/env.ts`, `server.ts`, routes (except invites) ⚪ | Unchanged |
| `load-tests/k6-websocket-load.js`, `load-tests/config.js` 🟡 | Update default `WS_URL` from `*.run.app` to the new endpoint |
| `Dockerfile` ⚪ | Carries over as-is (node:22-alpine, pnpm). Verify AWS arch (x86 vs arm64) matches your Fargate config |

### 4.2 apps/worker

| File | Change |
|---|---|
| `package.json` 🔴 | Remove `@google-cloud/aiplatform`, `google-auth-library`. Add `@aws-sdk/client-bedrock-runtime` (+ `@aws-sdk/client-sqs` if you want DLQ/redrive tooling) |
| `src/middleware/oidc-auth.ts` 🔴→🟢 | **Delete or gut.** With SQS as transport, message authenticity comes from the SQS consumer itself (IAM), not per-request OIDC. If you keep an HTTP endpoint (e.g. for the test-harness's direct `POST /tasks/summary` path), replace OIDC with a shared-secret header check or keep a minimal verifier |
| `src/routes/summary.ts` 🔴 | If going SQS-consumer: add `src/consumer.ts` (sqs poll loop → `generateSessionSummary`). Keep the HTTP route for the test-harness/local-dev path behind the shared secret |
| `src/lib/vertex-ai.ts`, `embedding.ts`, `generate-content.ts` 🔴 | Mirror the API changes (§4.1) — same contracts |
| `src/lib/summary.ts` ⚪/🟡 | Unchanged except embedding provider behind `embedding.ts`. Raw SQL `::vector` stays |
| `src/scripts/backfill-embeddings.ts` ⚪ | Same; becomes the tool for §6.3 re-embedding if model changes |
| `src/lib/prisma.ts` ⚪ | DATABASE_URL swap only |
| `Dockerfile` ⚪ | Carries over |

### 4.3 apps/therapist-portal

| File | Change |
|---|---|
| `src/lib/auth.ts` ⚪ | **No change** — Google OAuth + NextAuth is cloud-neutral. Keep the Google Cloud Console OAuth client (you keep that project purely for auth) |
| `package.json` 🟢 | Remove `firebase`, `firebase-admin` (no runtime import found); remove `emulator` script + `firebase.json` if you drop the auth emulator |
| `src/lib/prisma.ts` ⚪ | DATABASE_URL |
| `vercel.json` ⚪ | Unchanged (if staying on Vercel) |
| `instrumentation.ts`, tRPC routers ⚪ | Unchanged |

### 4.4 apps/test-harness

| File | Change |
|---|---|
| `package.json` 🔴 | Remove `@google-cloud/tasks`, `@google-cloud/aiplatform` (present only because it direct-imports apps/api modules; align with API's new AWS deps) |
| `next.config.ts` 🔴 | Webpack externals list: replace `@google-cloud/tasks`, `@google-cloud/aiplatform`, `google-gax` with the new AWS SDKs (they also dynamically `require()` JSON config files — same externals treatment needed) |
| `src/lib/agent-adapter.ts` ⚪ | Direct `POST /tasks/summary` to worker keeps working if you keep an HTTP route (see §4.2) |
| `src/server/routers/conversation.ts` 🟡 | Comments/logic referencing Cloud Tasks env vars — update to SQS env vars |
| `firebase.json` 🟢 | Unused hosting config — delete |
| `vercel.json` ⚪ | Unchanged |

### 4.5 apps/mobile

| File | Change |
|---|---|
| `pubspec.yaml` 🔴 | Decide telemetry strategy first (§7-D5). **Option A (least work):** keep Firebase Auth/Crashlytics/Analytics by *keeping the Firebase project* — Firebase is multi-cloud; the backend moving to AWS does not force the mobile SDK off Firebase. **Option B (full exit):** remove all `firebase_*`, add `amplify_auth_cognito` (+ a crash/analytics replacement: Sentry + your choice) |
| `lib/src/core/auth_service.dart` 🔴 (Option B) | FirebaseAuth → Amplify Cognito (`Amplify.Auth.signInWithWebUI` or phone OTP flow); custom phone-OTP screens need Cognito custom auth flow or Hosted UI |
| `lib/main.dart` 🟡 (Option B) | Remove `Firebase.initializeApp` + Crashlytics wiring; init Amplify |
| `lib/src/core/analytics_service.dart` 🟡 | Swap FirebaseAnalytics backend (or keep — see Option A) |
| `lib/src/config/environment.dart` 🔴 | Replace `backend-971397352159.asia-south1.run.app` with the new AWS API endpoint (beta/prod) |
| `android/app/build.gradle` + `android/build.gradle` + `android/settings.gradle` 🔴 (B) | Remove google-services + crashlytics plugins and firebase-bom deps |
| `android/google-services.json` 🟢 (B) | Delete; Option B uses `amplifyconfiguration.dart` |
| `ios/` | Regenerate plugin registrant after pubspec change |
| `README.md` 🟡 | Flavors table — replace "GCP Cloud Run" with new endpoints |

> **Recommendation:** Option A for the beta window (mobile auth + crash telemetry keep working; backend cutover is the risky part), then Option B as a fast-follow. Mixing is safe: the mobile app talks to **your API**, and your API is what authenticates tokens — if API-side verification switches to Cognito, mobile auth *must* switch in lockstep (that's the one place A and B can't straddle; see §6.4 cutover).

### 4.6 Infrastructure / CI / config

| File | Change |
|---|---|
| `infrastructure/gcp/evia-beta/**` 🟢 | Keep frozen for reference during migration; delete after cutover + teardown |
| `infrastructure/aws/**` 🔴 (new) | Terraform: VPC/subnets/SGs, ECR repos, ECS cluster + task defs (api, worker) or App Runner, ALB, RDS Postgres + pgvector (parameter group: `shared_preload_libraries=pgvector` not needed; just `CREATE EXTENSION vector` in init), ElastiCache Redis, SQS queue + DLQ, Secrets Manager secrets, Cognito user pool + app client + SNS SMS config, CloudWatch log groups/alarms, Bedrock model-access enablement |
| `cloudbuild.yaml` 🟢/🔴 | Replace with either `buildspec.yml` (CodeBuild) or a GHA workflow: build both images → push ECR → **run `prisma migrate deploy`** (in a one-off ECS task or CodeBuild job with the RDS URL from Secrets Manager — replaces the Cloud SQL Proxy dance) → deploy |
| `scripts/deploy-beta.sh` 🔴 | Rewrite with AWS CLI: ECR login/build/push, `aws ecs update-service` (or `apprunner`), secrets from Secrets Manager, env vars for the new stack |
| `scripts/deploy-worker.sh` 🔴 | Same |
| `.github/workflows/ci.yml` 🟡 | Security-scan grep list: swap `service-account\.json|keyfile\.json|firebase-admin|adminsdk` for AWS equivalents (credentials file patterns, `Amplify` config leaks) — keep `.env` check; keep Neon `CI_DATABASE_URL` if Neon stays |
| `.env.example` 🔴 | Rewrite per §5 |
| `pnpm-workspace.yaml` 🟡 | Remove `packageExtensions['@google-cloud/aiplatform']`; remove `allowBuilds['@firebase/util']` only if mobile exits Firebase (workspace allowBuilds covers npm-side firebase packages pulled by portal — they're being removed anyway) |
| `README.md`, `docs/architecture.md`, `docs/adr/001-gcp-monorepo.md`, `AGENTS.md` 🔴 | Update stack table ("There is no AWS" → new reality), environments table, constraints list (asia-south1 → ap-south-1), supersede ADR-001a with a new ADR |

---

## 5. Environment variables — old → new

All Node apps load the **root** `.env` (`apps/api/src/env.ts`, `apps/api/prisma.config.ts`, worker same pattern).

| Old (GCP) | New (AWS) | Notes |
|---|---|---|
| `DATABASE_URL` (Cloud SQL / Neon) | `DATABASE_URL` (RDS / Neon) | Name unchanged; value swaps. Include `?sslmode=require` |
| `FIREBASE_PROJECT_ID` | `COGNITO_USER_POOL_ID` (+ `AWS_REGION`) | |
| `JWT_ISSUER` (`https://securetoken.google.com/evia-500215`), `JWT_AUDIENCE` (`okuvu-api`) | Cognito issuer `https://cognito-idp.<region>.amazonaws.com/<pool>`; audience = app client id | Current code never reads JWT_ISSUER/AUDIENCE (firebase-admin does its own); if you validate claims manually under Cognito, use these |
| `VERTEX_AI_PROJECT_ID`, `VERTEX_AI_LOCATION`, `VERTEX_AI_SA_KEY_PATH`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` | `AWS_REGION` (+ optional `BEDROCK_MODEL_ID_*`); delete SA-key paths entirely | AWS SDKs take region + task-role creds; the `GOOGLE_APPLICATION_CREDENTIALS_JSON` mechanism was only for Vercel — the new provider needs an equivalent **only if** test-harness still runs Bedrock server-side (Vercel: put a Bedrock access key in Vercel env, or keep those API keys server-side only) |
| `GEMINI_PRO_MODEL`, `GEMINI_FLASH_LITE_MODEL` | `BEDROCK_MODEL_ID_PRO`, `BEDROCK_MODEL_ID_LITE` (or drop if Gemini path is removed) | Watch the A9 tests that assert model strings |
| `CLOUD_TASKS_PROJECT_ID`, `CLOUD_TASKS_QUEUE`, `CLOUD_TASKS_LOCATION` | `SQS_QUEUE_URL` (+ `AWS_REGION`) | |
| `CLOUD_TASKS_WORKER_URL`, `WORKER_SERVICE_ACCOUNT_EMAIL` | delete (SQS) — or `WORKER_URL` + `WORKER_SHARED_SECRET` if you keep the HTTP path | `WORKER_URL` already exists as the primary in `worker-health.ts` |
| `REDIS_URL` | `REDIS_URL` (ElastiCache endpoint) | unchanged name |
| Secret Manager secrets (`DATABASE_URL`, `SARVAM_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `emergency-contact-key`, `LOAD_TEST_KEY`) | Secrets Manager equivalents | Drop `SARVAM_API_KEY` (stub) |
| `EMERGENCY_CONTACT_ENCRYPTION_KEY` | **unchanged name** | env-var-first ordering makes this your zero-downtime key migration lever (§6.5) |
| `GCP_BUCKET_TTS`, `GCP_BUCKET_ASSETS`, `GCP_TTS_URL_EXPIRY_SECONDS`, `GCP_ASSETS_URL_EXPIRY_SECONDS` | delete (unused) — or S3 equivalents if adopting storage | |
| `CLOUD_KMS_KEY_RING`, `CLOUD_KMS_KEY_NAME`, `CLOUD_KMS_LOCATION` | delete (never implemented) | |
| `LOCAL_DEV_BYPASS_AUTH`, `LOAD_TEST_MODE`, `LOAD_TEST_KEY`, `USE_CANNED_LLM_RESPONSE`, `USE_CANNED_TTS`, `SESSION_*`, `NEXTAUTH_*`, `GOOGLE_CLIENT_*`, `BREVO_*`, `OPENROUTER_*` | unchanged | Vendor-neutral |

Mobile (dart-defines / flavors): `BASE_URL`, `WS_URL`, `FLAVOR` unchanged; values change. `google-services.json` → `amplifyconfiguration.dart` (Option B).

---

## 6. Data migration plan

### 6.1 Database (Cloud SQL → RDS)
1. Provision RDS with `CREATE EXTENSION vector;` (verify `vector(768)` compatibility before cutover).
2. Cutover window: stop writes (or use a short maintenance window — beta-stage app), `pg_dump` from Cloud SQL → `pg_restore` into RDS. `vector` columns dump/restore cleanly as long as the extension exists first.
3. Update `DATABASE_URL` secrets (API, worker, portal) → redeploy.
4. Keep Cloud SQL read-only for N days as a fallback snapshot, then tear down with Terraform.
5. Neon (dev/CI): **decide** — keep (no work) or migrate each dev branch. Recommended: keep Neon.

### 6.2 Auth identity (Firebase Auth → Cognito) — *the hard one*
- **Every `User` row is keyed to Firebase by `firebase_uid`.** Two viable paths:
  - **A. Migrate identities:** export Firebase users (Admin SDK `listUsers`), import to Cognito (import job or scripted `AdminCreateUser` with phone), map old→new. Keep `firebase_uid` column storing the **new Cognito `sub`** (column name becomes a lie — acceptable short-term; rename in a later PR with a view/alias if you care).
  - **B. Re-enroll:** users re-verify phone on next login into the new backend. Simpler, but breaks invites mid-flight and loses `User` linkage for anyone who doesn't re-enroll.
- **Invite-linkage invariant to preserve:** portal `createClientWithInvite` creates a placeholder User (no uid) → `POST /invites/redeem` populates `firebase_uid` after phone-auth. This flow must be tested end-to-end against Cognito before beta (it's the only code path that *writes* the identity join).
- Sequencing: the API is the only auth verifier (mobile sends `Authorization: Bearer`). Cutover = API deployed with Cognito verifier + mobile build(s) using Cognito SDK **shipped together**; keep the Firebase-verifier build deployable for instant rollback.
- `LOCAL_DEV_BYPASS_AUTH`, `LOAD_TEST_MODE`, and test-harness's `test-user-*` synthetic users are verifier-independent — unaffected.

### 6.3 Embeddings — dimension contract
- Schema pins `vector(768)` (`SessionLog.summary_embedding`); Vertex `text-embedding-004` outputs 768.
- If the chosen Bedrock model outputs ≠ 768 (Titan v2 = 1024/512/256; many Cohere = 1024), either (a) pick a 768-dim model, or (b) `ALTER TYPE`/new column + **re-embed every existing summary** using `apps/worker/src/scripts/backfill-embeddings.ts` as the base script. Decide before writing `embedding.ts`.
- `Turn.model_version`/`prompt_version` provenance: new values (`e.g. bedrock/<model>`) will coexist with historical `gemini-2.5-flash` rows — that's by design (the columns document what produced content); update test-harness assertions that hardcode model strings.

### 6.4 Secrets
- `emergency-contact-key`: put the **same key value** into AWS Secrets Manager first; because the code prefers `EMERGENCY_CONTACT_ENCRYPTION_KEY` env, you can also mount it as env during transition. Existing `EmergencyContact.encrypted_*` rows decrypt unchanged — **do not rotate during migration** (would orphan ciphertext).
- `DATABASE_URL`, `LOAD_TEST_KEY`: recreate in Secrets Manager; update task definitions.

### 6.5 Queue in-flight work
- Cloud Tasks may hold retrying tasks at cutover. Before teardown: drain (observe queue depth → 0) or accept losing pending summary jobs — they're recoverable via `POST /cleanup/summary-reprocess` (worker route) which reprocesses stale `PENDING`/`FAILED` `SessionSummary` rows. Run it once post-cutover.

---

## 7. Decisions to lock before implementation

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Compute: App Runner vs ECS Fargate | App Runner (less ops, WebSocket limits) vs Fargate+ALB (standard) | **Fargate + ALB** — WebSocket-first product, mature autoscaling |
| D2 | LLM: add Bedrock vs OpenRouter-only | Bedrock as new default; `openrouter` stays; delete `gemini` | Add `bedrock` to dispatcher, keep `openrouter` fallback, drop `gemini` (full GCP exit) |
| D3 | Embeddings model | 768-dim model vs re-embed | Match 768 if a good model exists; else schedule re-embed |
| D4 | Neon | keep vs RDS dev | **Keep** — zero work, it was never GCP |
| D5 | Mobile Firebase | keep Firebase project (A) vs full exit (B) | **A for cutover**, B as fast-follow |
| D6 | Vercel (portal/harness) | keep vs Amplify Hosting | **Keep** — not a GCP dependency |
| D7 | Queue consumption model | SQS-poll worker vs HTTP worker + signed requests | **SQS-poll**; keep a shared-secret HTTP route only for test-harness/local-dev |
| D8 | Legal/DPDP | AWS ap-south-1 DPA + Bedrock data handling | **Blocking gate** — must be cleared before production data moves (mirrors the existing OpenRouter DPA review flag in `docs/architecture.md`) |

---

## 8. Suggested execution order

1. **Prep (no code changes):** D1–D8 decided; AWS account + ap-south-1 landing zone; Terraform `infrastructure/aws/` started (VPC → RDS+ElastiCache → ECR → ECS → SQS → Secrets → Cognito).
2. **Code PR #1 — LLM layer:** dispatcher + Bedrock client in api/worker (+ test-harness externals/deps), behind `LLM_PROVIDER` (default still `openrouter`). Pipeline tests green; no behavior change.
3. **Code PR #2 — queue:** `summary-enqueue.ts` → SQS; worker consumer + shared-secret HTTP fallback; delete OIDC middleware. Deploy in staging; verify summary/memory jobs end-to-end.
4. **Code PR #3 — auth:** Cognito verifier in API (flag-gated: `AUTH_PROVIDER=cognito|firebase`), invite-redemption tests against Cognito. Portal unchanged.
5. **Code PR #4 — mobile:** environment.dart endpoints; auth SDK swap (D5); new beta build.
6. **Data cutover:** RDS migration (§6.1) + secrets + Cognito identity import (§6.2) + deploy API/worker/portal; mobile beta pointed at new endpoint.
7. **Verify:** `/health`, WS chat turn (A1→A2→A9-post), session close → SQS → summary + embedding (check vector length), invite redeem E2E, rate limits via ElastiCache, emergency-contact decrypt of a pre-migration row, k6 load test with new `WS_URL`.
8. **Cleanup:** rewrite README/architecture/ADR-001a/env.example; delete Sarvam stub, dead GCP env vars, `firebase.json` files; teardown GCP (Cloud SQL last, after N-day soak).

---

## 9. Gotchas checklist (things that have bitten similar migrations)

- [ ] `trustProxy: true` must stay (ALB/Envoy in front of Fargate) or per-IP rate limiting collapses to one bucket — the failure mode is documented in `apps/api/src/app.ts`.
- [ ] `pool.on('error')` handlers exist because of Neon idle-kill; RDS doesn't idle-kill the same way but **keep the handlers** (they also catch failover resets).
- [ ] Cloud SQL Proxy migration step disappears with `cloudbuild.yaml` — make sure the replacement (CodeBuild/ECS one-off task) runs `prisma migrate deploy` **before** the new service goes live on every deploy.
- [ ] Worker's boot contract inverts: API's `assertWorkerReachable` (`server.ts`) pings `WORKER_URL` — with SQS-poll there may be no HTTP to ping; change the check (queue existence / recent-consumer heartbeat) or the API will refuse to boot (this is an intentional fail-fast you'll otherwise trip in staging).
- [ ] `apps/test-harness` webpack `extensionAlias` + externals pattern exists specifically because these cloud SDKs dynamically require JSON — replicate for AWS SDKs or every harness page 500s on Vercel.
- [ ] `GOOGLE_APPLICATION_CREDENTIALS_JSON` was the Vercel workaround for Vertex; Bedrock-from-Vercel needs its own credential story or the harness must not import the Bedrock module.
- [ ] Mobile `environment.dart` beta and prod **both** currently point at the same Cloud Run URL — don't reproduce that mistake; give AWS beta and prod distinct endpoints.
- [ ] CI's credential grep (`ci.yml`) and `LOCAL_DEV_BYPASS_AUTH` boot guards are cloud-neutral — keep them; just update the filename patterns.
- [ ] `Therapist_Portal_Test_Register.docx` / `docs/MOBILE_Feature_Test_Results.*` track current test status — re-run the relevant suites (api 470, worker 39, portal 33+ were the last known counts) after each PR; model-string literals in tests (`gemini-2.5-flash`) will need updating with the Bedrock PRs.

---

*Prepared by Buffy (Freebuff) from a full-repo search on 27 Sep 2026. Paths verified against the `develop` branch; re-verify line-level references before editing.*
