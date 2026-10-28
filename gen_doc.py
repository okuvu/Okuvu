from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()
style = doc.styles['Normal']
style.font.name = 'Calibri'
style.font.size = Pt(11)

def add_title(text, size=20, color=(41, 47, 56)):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    r.bold = True
    r.font.size = Pt(size)
    r.font.color.rgb = RGBColor(*color)

def add_heading(text, level=1):
    return doc.add_heading(text, level=level)

def add_para(text, bold=False, italic=False):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.bold = bold
    r.italic = italic

add_title("Okuvu - Complete Technology Stack & Tech Inventory", 20)
add_para("Suvok Systems LLP · Bengaluru · Confidential", italic=True)
add_para("Version 2.0 (AWS stack)", italic=True)
add_para("Prepared for: learning the full codebase technology landscape")
doc.add_paragraph()

add_heading("1. Project Overview", 1)
add_para("Okuvu is an AI-powered mental wellness companion for Indian Gen Z, built on a supervised therapist-led model. Users interact with an AI agent (A2) in bounded daily sessions; a licensed therapist oversees care plans and session notes via a separate portal. This document inventories every technology, library, framework, and service used in the project.")
add_para("Migration note (October 2026): this inventory now describes the AWS stack, which replaced a Google Cloud stack. Cloud Run -> ECS Fargate, Cloud SQL -> RDS for PostgreSQL, Cloud Tasks -> SQS, Memorystore -> ElastiCache (Valkey), Secret Manager -> AWS Secrets Manager, Cloud KMS/Storage -> AWS KMS/S3, Cloud Build/Artifact Registry -> CodeBuild/ECR, Vertex AI (Gemini) -> Amazon Bedrock (Nova Pro + Titan Embeddings V2), Firebase Auth -> a Cognito user pool. Everything is pinned to ap-south-1 (Mumbai). The authoritative contract is docs/AWS-CUTOVER-SPEC.md.", italic=True)

add_heading("2. Repo Structure (Monorepo)", 1)
code = [
    "okuvu/",
    "  apps/",
    "    mobile/              Flutter app (Android-first MVP)",
    "    api/                 Node.js/TypeScript backend — @okuvu/api",
    "    therapist-portal/    Next.js therapist portal — @okuvu/therapist-portal",
    "    worker/              Background worker (SQS consumer) — @okuvu/worker",
    "    test-harness/        Next.js test/evaluation harness — @okuvu/test-harness",
    "  packages/",
    "    prisma/              Prisma schema + client — @okuvu/prisma",
    "    shared-types/        TS types shared across apps — @okuvu/shared-types",
    "  scripts/               Deployment & utility scripts",
    "  infrastructure/aws/    Terraform for the beta stack (VPC, RDS, ECS, ALB, SQS, S3, KMS, ECR)",
    "  load-tests/            k6 WebSocket load test scripts",
    "  docs/                  Architecture decisions, setup guides",
]
for line in code:
    p = doc.add_paragraph(line)
    p.paragraph_format.left_indent = Inches(0.25)
add_para("Package manager: pnpm@11.8.0. Node.js >=20. Strict pnpm per-package isolation.", italic=True)

add_heading("3. Mobile App — Flutter", 1)
add_para("Framework: Flutter (Android-first MVP, iOS-ready). SDK >=3.0.0 <4.0.0. Android min SDK 21. Material Design.")
add_heading("3.1 Key Flutter Packages", 2)
table = doc.add_table(rows=1, cols=3)
table.style = 'Light Grid Accent 1'
hdr = table.rows[0].cells
hdr[0].text = 'Package'
hdr[1].text = 'Version'
hdr[2].text = 'Purpose'
packages = [
    ("flutter_tts", "^4.2.5", "Text-to-speech (device TTS)"),
    ("flutter_riverpod", "^3.3.2", "Reactive state management"),
    ("go_router", "^17.3.0", "Declarative navigation / routing"),
    ("dio", "^5.9.2", "HTTP client (API calls + Cognito OTP form posts)"),
    ("web_socket_channel", "^3.0.1", "WebSocket client for live chat sessions"),
    ("connectivity_plus", "^7.2.0", "Network connectivity monitoring"),
    ("url_launcher", "^6.3.0", "Open URLs (links, emergency resources)"),
    ("fl_chart", "^0.69.0", "Charts (progress/mood graphs)"),
    ("shared_preferences", "^2.2.3", "Local key-value storage"),
    ("lucide_icons_flutter", "^3.1.20", "Icon set"),
    ("speech_to_text", "^7.5.0", "Speech-to-text input"),
    ("permission_handler", "^13.0.2", "Runtime permissions"),
    ("share_plus", "^13.3.0", "Share content"),
]
for pkg, ver, purpose in packages:
    row = table.add_row().cells
    row[0].text = pkg
    row[1].text = ver
    row[2].text = purpose
add_heading("3.2 Dev Dependencies", 2)
for d in ["patrol ^4.7.1 (E2E instrumentation testing)", "flutter_lints ^6.0.0", "flutter_test, integration_test", "flutter_launcher_icons ^0.14.2"]:
    add_para(d)
add_heading("3.3 Dart Source Highlights", 2)
for f, desc in [
    ("main.dart", "App entry point"),
    ("app.dart", "Root widget / provider tree"),
    ("config/app_config.dart", "Flavor + environment config (dev/beta/prod)"),
    ("core/dio_client.dart", "HTTP client"),
    ("core/auth_service.dart", "Auth + token intercept"),
    ("core/websocket_service.dart", "Live session WebSocket"),
    ("core/tts_service.dart", "Text-to-speech wrapper"),
    ("features/chat/", "Chat screen, messages, tool cards, grounding, breathing visuals"),
    ("features/home/", "Home screen, today card, breathing, mood check-in, appointments"),
    ("features/intake/", "Onboarding, care plan, cold start"),
    ("features/journal/", "Journal entry + list + provider"),
    ("features/progress/", "Mood/progress screen + provider"),
    ("features/settings/", "Profile, language, notifications, emergency contact, privacy, voice, quote of day"),
    ("features/crisis/", "Crisis overlay (offline-safe resource list)"),
    ("features/auth/", "OTP login, waitlist screen"),
    ("router/router.dart", "GoRouter configuration"),
    ("theme/app_theme.dart", "App theme + design tokens"),
]:
    add_para(f"{f}: {desc}")

add_heading("4. Backend API — Node.js / TypeScript / Fastify", 1)
add_para("Framework: Fastify 5.x (HTTP server) + tsx (dev watcher) + TypeScript 5.x + Vitest (tests).")
add_heading("4.1 Key npm Dependencies", 2)
table = doc.add_table(rows=1, cols=3)
table.style = 'Light Grid Accent 1'
hdr = table.rows[0].cells
hdr[0].text = 'Package'
hdr[1].text = 'Version'
hdr[2].text = 'Purpose'
api_deps = [
    ("fastify", "^5.3.2", "HTTP server / REST framework"),
    ("@fastify/rate-limit", "^11.2.0", "Rate limiting (middleware)"),
    ("@fastify/websocket", "^11.0.0", "WebSocket support (live chat/sessions)"),
    ("@prisma/adapter-pg", "^7.8.0", "Prisma adapter for PostgreSQL"),
    ("@prisma/client", "^7.8.0", "Prisma ORM client"),
    ("prisma", "^7.8.0", "DB migration/client tooling"),
    ("ioredis", "^5.4.1", "Redis client (caching, session state)"),
    ("pg", "^8.22.0", "PostgreSQL driver"),
    ("dotenv", "^16.4.7", "Environment configuration"),
    ("@aws-sdk/client-bedrock-runtime", "^3", "Bedrock (Nova Pro chat, Titan Embeddings V2)"),
    ("@aws-sdk/client-sqs", "^3", "Summary/memory job queue"),
    ("@aws-sdk/client-s3", "^3", "Uploads, cached TTS audio, presigned URLs"),
    ("@aws-sdk/client-secrets-manager", "^3", "Runtime secret retrieval"),
    ("@aws-sdk/client-kms", "^3", "Envelope encryption (emergency contacts)"),
    ("@okuvu/prisma", "workspace", "Shared Prisma layer"),
    ("@okuvu/shared-types", "workspace", "Shared TypeScript types"),
]
for pkg, ver, purpose in api_deps:
    row = table.add_row().cells
    row[0].text = pkg
    row[1].text = ver
    row[2].text = purpose
add_heading("4.2 Scripts", 2)
for s in ["dev: tsx watch src/server.ts", "build: tsc && cp src/prompts/*.txt dist/prompts/", "start: node dist/server.js", "typecheck: tsc --noEmit", "test: vitest run", "test:watch: vitest", "test:load: k6 run load-tests/k6-websocket-load.js"]:
    add_para(s)
add_heading("4.3 The A-Pipeline (AI Agents)", 2)
add_para("Core feature: AI agent pipeline. Each user turn flows through:")
agents = [
    ("A1", "Clinical safety gate (LLM) - classifies risk S0-S4; non-negotiable first pass"),
    ("A2", "Support companion (LLM) - main AI chat response"),
    ("A9-pre", "Pre-governance gate (LLM) - policy check"),
    ("A9-post", "Post-content review (LLM)"),
    ("journal-prompt", "Chat->journal handoff prompt"),
    ("a8-router", "Router/decision logic"),
    ("orchestrator", "Coordinates pipeline, fallbacks, retries, latency"),
]
for a, d in agents:
    add_para(f"{a}: {d}")
libs4 = [
    "embedding.ts (vector embeddings)",
    "openrouter.ts (OpenRouter fallback)",
    "bedrock.ts (Bedrock client - Nova Pro / Titan Embeddings V2)",
    "generate-content.ts (single dispatcher: Bedrock or OpenRouter)",
    "memory-retrieval.ts",
    "retrieved-context-cache.ts (Redis)",
    "quote-of-day.ts",
    "care-plan.ts",
    "homework.ts",
    "canned-response.ts",
    "today-card.ts",
    "tool-card.ts",
    "sessions.ts",
    "appointments.ts",
    "invites.ts",
    "auth-otp.ts",
    "cognito-auth.ts (Cognito JWT verification)",
    "rate-limit.ts",
    "redis.ts",
    "session-open/close.ts",
    "worker-health.ts",
    "summary-enqueue.ts",
    "progress.ts",
    "email.ts",
]
for lib in libs4:
    add_para(f"Lib: {lib}")
add_heading("4.4 Routes", 2)
for r in ["account", "appointments", "auth", "health", "invites", "journal", "progress", "sessions", "settings", "users", "waitlist", "websocket"]:
    add_para(r)
add_heading("4.5 Tests", 2)
add_para("Many unit tests under src/__tests__/ (a1, a2, a8-router, a9, a9-post, account-delete, agent-context, appointments, auth, auth-verify-otp, care-plan, email, emergency-contact, error-handler, generate-content, health, invite-token-hash, invites, journal, journal-prompt-agent, llm-provider, mood-checkin, openrouter, orchestrator, orchestrator modes/latency, production-bypass, progress-mood, quote-of-day, rate-limit, session-close/open, sessions-srs, settings, users-consent, users-today-and-tool, waitlist, websocket-session-idor, welcome).")

add_heading("5. Background Worker — Node.js / TypeScript", 1)
add_para("Purpose: SQS consumer - drains background jobs (session summarization, memory extraction, embedding backfill, retention cleanup) from evia-beta-summary-jobs (DLQ after 3 receives). Runs as ECS Fargate service evia-beta-worker in the private subnets, no load balancer, no public ingress.")
add_heading("5.1 Key Dependencies", 2)
for d in ["@okuvu/prisma", "@okuvu/shared-types", "@aws-sdk/client-bedrock-runtime (Nova Pro + Titan Embeddings V2)", "@aws-sdk/client-sqs (job consumption)", "@prisma/adapter-pg, @prisma/client, pg", "fastify ^5.3.2", "dotenv"]:
    add_para(d)
add_heading("5.2 Routes / Jobs", 2)
for r in ["health.ts", "summary.ts (session summarization)", "beta-retention.ts (beta cleanup job)", "cleanup.ts"]:
    add_para(r)
libs5 = [
    "embedding.ts",
    "generate-content.ts",
    "memory-extraction.ts",
    "openrouter.ts",
    "prisma.ts",
    "summary.ts",
    "bedrock.ts",
    "scripts/backfill-embeddings.ts",
]
for lib in libs5:
    add_para(f"Lib: {lib}")

add_heading("6. Therapist Portal — Next.js", 1)
add_para("Framework: Next.js 16 (App Router) + React 19 + tRPC + NextAuth (Auth.js) + TypeScript + Tailwind CSS 4.")
add_heading("6.1 Key Dependencies", 2)
table = doc.add_table(rows=1, cols=3)
table.style = 'Light Grid Accent 1'
hdr = table.rows[0].cells
hdr[0].text = 'Package'
hdr[1].text = 'Version'
hdr[2].text = 'Purpose'
portal_deps = [
    ("next", "^16.2.10", "React framework"),
    ("react / react-dom", "^19.2.7", "UI"),
    ("@trpc/*", "^11.18.0", "tRPC RPC (type-safe API)"),
    ("next-auth", "^4.24.14", "Authentication - CognitoProvider (therapist user pool)"),
    ("jose", "^5", "Cognito id-token verification in the NextAuth callback"),
    ("@prisma/*", "^7.8.0", "DB access"),
    ("@okuvu/prisma", "workspace", "Shared"),
    ("@okuvu/shared-types", "workspace", "Shared"),
    ("@tanstack/react-query", "^5.101.2", "Server state"),
    ("zod", "^4.4.3", "Schema validation"),
    ("@tailwindcss/postcss / tailwindcss", "^4.3.2", "Styling"),
]
for pkg, ver, purpose in portal_deps:
    row = table.add_row().cells
    row[0].text = pkg
    row[1].text = ver
    row[2].text = purpose
add_heading("6.2 Features / Pages", 2)
for area, pages in [
    ("Dashboard", ["/dashboard (client table)"]),
    ("Clients", ["/clients/[id] — home, program, tools, reminders, homework, notes, report, appointment, schedule"]),
    ("Auth", ["/auth (Sign in)"]),
    ("Schedule", ["/schedule"]),
    ("Admin", ["/admin (Add-client wizard)"]),
]:
    add_para(area)
    for p in pages:
        add_para(f"  - {p}")
add_heading("6.3 Data / API", 2)
for r in ["trpc routers: _app, admin, appointments, clients, homework, notes, reminders, report-card, users, waitlist", "trpc/provider.tsx, trpc/client.ts", "auth.ts, auth-provider.tsx (NextAuth), prisma.ts, email.ts, invite-token-hash.ts, format.ts"]:
    add_para(r)

add_heading("7. Test Harness — Next.js", 1)
add_para("Purpose: Automated eval / A/B / regression harness for the A-pipeline. Runs on port 3002. Deployed to Vercel.")
add_heading("7.1 Key Dependencies", 2)
for d in ["Next.js, React 19, tRPC, Vitest, @tanstack/react-query", "@aws-sdk/client-bedrock-runtime (inherited via the @okuvu/api modules it direct-imports)", "xlsx ^0.18.5 (Excel export)", "zod, next-auth (CognitoProvider), pg", "@okuvu/api, @okuvu/prisma, @okuvu/shared-types (workspaces)"]:
    add_para(d)
add_heading("7.2 Build Configuration Highlights", 2)
add_para("The harness direct-imports @okuvu/api source files (which use ESM .js -> .ts imports). Workarounds in next.config.ts:")
for c in [
    "outputFileTracingRoot + outputFileTracingIncludes to ship prompt files",
    "webpack extensionAlias: '.js' -> '.ts' + '.tsx'",
    "NormalModuleReplacementPlugin: ../prompts/index.js -> generated prompt-shim.ts",
    "config.externals for @aws-sdk/client-bedrock-runtime, @aws-sdk/client-sqs, next-auth (server-only libs marked external)",
]:
    add_para(c)
add_heading("7.3 Pages / Features", 2)
for page, desc in [
    ("Pipeline", "Agent toggle, pipeline diagram, agent trace panel"),
    ("Simulator", "Scenario batteries, persona/persona-pair runner"),
    ("Determinism", "A8 state matrix, run diff view"),
    ("Corpus", "Case editor, bulk import (CSV), consent panel"),
    ("Results", "Comparison view, run list/detail"),
    ("Review", "Kappa results, rater progress, rubric form"),
    ("Sampling", "Sampling config/progress console"),
    ("Fault Injection", "Fault console, fault configs"),
    ("CI", "Gate status, regression runs (GitHub Actions integration)"),
]:
    add_para(f"{page}: {desc}")
add_heading("7.4 tRPC Routers (Test Harness)", 2)
for r in ["ci.ts", "consent.ts", "conversation.ts", "corpus.ts", "dashboard.ts", "determinism.ts", "faultInjection.ts", "pipeline.ts", "results.ts", "results-export.ts", "review.ts", "scorecard.ts", "simulator.ts", "singleAgent.ts", "stochastic.ts", "testConfig.ts", "example.ts"]:
    add_para(r)
add_heading("7.5 Tests", 2)
add_para("Hundreds of vitest tests under src/__tests__/ (pipeline, determinism, fault-injection, review, kappa, simulator, corpus, canned-mode, continuity-asserts, dependency-graph, judge, run-diff, scorecard, etc.).")

add_heading("8. Database & ORM", 1)
add_para("Database: PostgreSQL (Neon for local dev; Amazon RDS for PostgreSQL 16 for staging/beta/prod, private subnets, 7-day backups, credentials in Secrets Manager as evia-beta/database).")
add_para("ORM: Prisma 7.x — @prisma/client, @prisma/adapter-pg, prisma (CLI)")
add_heading("8.1 Models", 2)
for m in ["User", "Therapist", "ClinicalConfig", "EmergencyContact", "EngagementProfile", "UserMemory", "MoodLog", "SafetyState", "SessionLog", "SessionSummary", "TherapistClient", "TherapistNote", "Homework", "Reminder", "Appointment", "InviteToken", "WaitlistEntry", "NotificationPreference", "Turn", "JournalEntry", "ClinicalAccessLog", "TestRun", "CorpusCase", "GateSignOff", "PromptRegistryEntry", "ModelConfigPin", "BaselineArchive"]:
    add_para(m)
add_heading("8.2 Prisma Migrations", 2)
add_para("~40 migrations (2026-06-23 -> 2026-09-22) covering the full feature surface (add_turn_model, add_therapist_model, add_journal_entry, add_mood_log, add_s06_inference_fields, add_governance_log, add_user_memory_table, add_summary_embedding, add_client_lifecycle_and_chat_access_request, add_appointment, add_invite_token_and_client_intake_fields, add_waitlist_entry, add_notification_preferences, add_homework_reminder_language_mode_registries, add_reminder_frequency_tool_link, drop_session_limit_and_tier, add_turn_taper_state, add_turn_s07_signal_fields, add_conversation_runner, add_turn_fallback_source, add_test_run_status_incomplete, etc.).")
add_heading("8.3 Manual SQL & Seed", 2)
for d in ["packages/prisma/enable_vector.sql", "packages/prisma/manual-migrations/001_test_harness_beta_rls.sql (Row-Level Security for test harness; hand-written, NOT via prisma migrate; must be run manually per environment)", "packages/prisma/seed.ts (seeds 3 test users + care plans in a transaction); seed-load-test.ts"]:
    add_para(d)

add_heading("9. Authentication & Identity", 1)
table = doc.add_table(rows=1, cols=3)
table.style = 'Light Grid Accent 1'
hdr = table.rows[0].cells
hdr[0].text = 'Layer'
hdr[1].text = 'Provider'
hdr[2].text = 'Details'
auth_rows = [
    ("Mobile users", "Amazon Cognito user pool (phone OTP)", "OTP login via plain HTTPS form posts from Flutter; the pool sub is stored in User.auth_subject"),
    ("Therapist portal", "Cognito therapist pool + NextAuth CognitoProvider", "Portal session is NextAuth (JWT); identity comes from Cognito, not Google federation"),
    ("API token verification", "Cognito JWKS + node:crypto", "RS256, iss/exp/token_use/audience checks in apps/api/src/lib/cognito-auth.ts"),
    ("Internal / worker-to-worker", "VPC-internal (no public ingress)", "Tasks reach the worker over the private subnets; the old OIDC verifier is gone"),
    ("Local dev bypass", "LOCAL_DEV_BYPASS_AUTH", "Allows API calls without a real Cognito token (dev only, never in a deployed task)"),
]
for l, p, d in auth_rows:
    row = table.add_row().cells
    row[0].text = l
    row[1].text = p
    row[2].text = d
add_heading("9.1 Never-Committed Secrets", 2)
for s in ["COGNITO_THERAPIST_CLIENT_SECRET (therapist app client secret; Secrets Manager when deployed)", "EMERGENCY_CONTACT_ENCRYPTION_KEY (base64 32-byte AES-256-GCM key, or via CONTACTS_KMS_KEY_ARN)", "OPENROUTER_API_KEY", "SARVAM_API_KEY", "NEXTAUTH_SECRET", "AWS credentials: IAM task roles in deployed environments, never in the repo"]:
    add_para(s)

add_heading("10. AI / LLM Integration", 1)
add_heading("10.1 Providers", 2)
table = doc.add_table(rows=1, cols=3)
table.style = 'Light Grid Accent 1'
hdr = table.rows[0].cells
hdr[0].text = 'Provider'
hdr[1].text = 'Models'
hdr[2].text = 'Used by'
for l, p, d in [
    ("Amazon Bedrock (ap-south-1, in-region)", "amazon.nova-pro-v1:0 (chat), amazon.titan-embed-text-v2:0 (768-dim embeddings)", "Clinical agents A1/A2/A9-pre/A9-post, summaries, memory extraction, harness judge/case-factory"),
    ("OpenRouter (comparison / escape hatch)", "meta-llama/llama-3.1-8b-instruct (default)", "A/B comparison runs; harness LLM_PROVIDER=openrouter path"),
]:
    row = table.add_row().cells
    row[0].text = l
    row[1].text = p
    row[2].text = d
add_heading("10.2 LLM Architecture", 2)
for d in ["generate-content.ts — single generateContent dispatcher (Bedrock or OpenRouter)", "provider-config.ts — resolves region, model ids, embedding width and queue URL from env", "bedrock.ts, openrouter.ts — provider-specific clients", "embedding.ts — vector embeddings (Titan Embeddings V2 -> pgvector, memory & recall)", "agents/ — A1 safety gate, A2 companion, A9 pre/post governance, journal-prompt, a8-router, orchestrator", "Pricing used by harness cost estimates (ap-south-1, on-demand, AWS Price List API): Nova Pro $0.94/1M input and $3.76/1M output tokens; Titan Embeddings V2 $0.024/1M input tokens"]:
    add_para(d)
add_heading("10.3 Text-to-Speech", 2)
for d in ["Sarvam TTS (Bulbul v2) — SARVAM_TTS_MODEL='bulbul:v2', SARVAM_DEFAULT_LANGUAGE='en-IN'", "Flutter TTS wrapper (tts_service.dart)", "Amazon S3 bucket (S3_UPLOADS_BUCKET) + presigned URLs for cached TTS audio and assets", "AWS KMS customer-managed keys (contacts, data, secrets) for encryption"]:
    add_para(d)
add_heading("10.4 Voice Mode", 2)
for d in ["voice toggle widget + voice_settings_notifier.dart (settings)", "tts_service.dart + voice_toggle.dart widgets"]:
    add_para(d)

add_heading("11. Real-Time / WebSocket", 1)
add_para("Libraries: @fastify/websocket (API) + web_socket_channel (Flutter mobile client)")
add_para("API route: websocket.ts (live chat sessions). Session lifecycle: SESSION_OPEN -> USER_TURN -> AGENT_TURN -> SESSION_CLOSE. Frame types defined in @okuvu/shared-types.")

add_heading("12. Caching & Queueing (AWS Services)", 1)
table = doc.add_table(rows=1, cols=3)
table.style = 'Light Grid Accent 1'
hdr = table.rows[0].cells
hdr[0].text = 'AWS Service'
hdr[1].text = 'Purpose'
hdr[2].text = 'Used in'
for l, p, d in [
    ("ElastiCache for Valkey", "Caching (retrieved-context-cache), session coordination; TLS via rediss://", "API"),
    ("ioredis", "Redis client in API", "API"),
    ("Amazon SQS", "Background job queue evia-beta-summary-jobs + DLQ, 3-receive redrive", "API + Worker"),
    ("@aws-sdk/client-sqs", "Node client for enqueueing and consuming jobs", "API + Worker"),
    ("Amazon S3", "Uploads, TTS audio + assets; presigned URLs", "API + Mobile"),
    ("AWS Secrets Manager", "DB credentials + runtime secrets, injected into ECS task definitions", "API + Worker"),
    ("AWS KMS", "CMKs: contacts (envelope AES-256-GCM), data, secrets", "API"),
    ("Amazon ECS on Fargate", "Hosts api (behind the ALB) + worker (queue consumer)", "Deployment"),
    ("Amazon ECR + AWS CodeBuild", "Image registry + CI/CD builds", "Deployment"),
]:
    row = table.add_row().cells
    row[0].text = l
    row[1].text = p
    row[2].text = d

add_heading("13. Infrastructure & Deployment", 1)
add_heading("13.1 Environments", 2)
table = doc.add_table(rows=1, cols=3)
table.style = 'Light Grid Accent 1'
hdr = table.rows[0].cells
hdr[0].text = 'Environment'
hdr[1].text = 'AWS account / region'
hdr[2].text = 'Provisioned by'
for l, p, d in [
    ("Dev", "developer's own, ap-south-1", "Local machine (Neon DB)"),
    ("Beta / Staging", "beta account, ap-south-1", "CodeBuild on main (auto)"),
    ("Prod", "prod account, ap-south-1", "Git tag v* (manual approval)"),
]:
    row = table.add_row().cells
    row[0].text = l
    row[1].text = p
    row[2].text = d
add_heading("13.2 Terraform (IaC)", 2)
for f in ["infrastructure/aws/evia-beta/: providers.tf, variables.tf, outputs.tf, locals.tf, terraform.tfvars.example", "vpc.tf, rds.tf, elasticache.tf, s3.tf, kms.tf, secrets.tf (data layer)", "ecr.tf, ecs.tf, alb.tf, iam.tf, sqs.tf, observability.tf (compute, registry, queue, monitoring)"]:
    add_para(f)
add_heading("13.3 Deploy & Build Scripts", 2)
for s in ["scripts/deploy-beta.sh (apps/api -> docker build -> ECR push -> new task-definition revision -> update evia-beta-api -> wait services-stable)", "scripts/deploy-worker.sh (same flow for evia-beta/worker -> evia-beta-worker)", "buildspec.yml (CodeBuild: pnpm install -> prisma generate -> typecheck -> vitest -> docker build + ECR push -> prisma migrate deploy (in-VPC) -> ECS rollout)", ".github/workflows/ci.yml (PR checks; on merge to main an OIDC-authenticated ECR image push)", "apps/api/Dockerfile, apps/worker/Dockerfile (multi-stage Node 22 Alpine, pnpm)"]:
    add_para(s)

add_heading("14. CI/CD & DevOps", 1)
for d in ["AWS CodeBuild — builds, tests, migrates and rolls out on main (buildspec.yml)", "Amazon ECR — container image storage (evia-beta/api, evia-beta/worker; scan-on-push, lifecycle retention)", "Amazon ECS Fargate — API + worker runtime behind an ALB (/health target-group checks)", "Vercel — test-harness hosting (vercel.json in apps/test-harness)", "GitHub Actions — PR CI + regression workflow (referenced by test-harness CI router + GITHUB_TOKEN)", "pnpm workspaces — monorepo dependency management"]:
    add_para(d)

add_heading("15. Build & Test Tools", 1)
table = doc.add_table(rows=1, cols=3)
table.style = 'Light Grid Accent 1'
hdr = table.rows[0].cells
hdr[0].text = 'Tool'
hdr[1].text = 'Purpose'
hdr[2].text = 'Where'
for l, p, d in [
    ("pnpm 11.8.0", "Package manager / workspaces", "Root, all apps"),
    ("Node.js 20+", "JS runtime", "All TS/Node apps"),
    ("TypeScript 5.x", "Type-safety", "API, worker, portal, harness, shared-types"),
    ("tsc / tsx", "Compile + dev runner", "API, worker"),
    ("Vitest 3.x", "Unit/integration tests", "API, worker, portal, harness, shared-types, mobile"),
    ("Flutter test + patrol", "Dart unit + E2E integration tests", "Mobile"),
    ("k6", "WebSocket load testing", "load-tests/ (API test:load script)"),
    ("Prisma", "DB migrations + ORM", "All apps (via packages/prisma)"),
    ("tRPC", "Type-safe RPC", "Portal, harness"),
    ("NextAuth", "Auth", "Portal, harness"),
    ("PostgreSQL", "Database", "Local (Neon) + RDS (beta/prod)"),
    ("Terraform >= 1.9", "Infrastructure as code", "infrastructure/aws/evia-beta/"),
]:
    row = table.add_row().cells
    row[0].text = l
    row[1].text = p
    row[2].text = d

add_heading("16. Design / Branding", 1)
for d in ["Fonts: Poppins (Light/Regular/SemiBold) bundled as Flutter assets + web CSS", "Design docs: docs/design/EVIA_Mobile_Design.md, docs/design/EVIA_Therapist_Portal_Design.md (authoritative design specs)"]:
    add_para(d)

add_heading("17. Local Development Setup Summary", 1)
for s in [
    "Node.js 20+ + pnpm 9+",
    "Flutter 3.x (stable)",
    "Neon dev DB (local) — docs/neon-setup.md",
    "AWS CLI v2 — for ECR/ECS inspection and deploys (aws sts get-caller-identity must work)",
    "Bedrock model access in ap-south-1 — Nova Pro + Titan Embeddings V2 (bedrock:InvokeModel)",
    "Cognito therapist app client — only for real sign-in; otherwise HARD_HARNESS_LOCAL_DEV_BYPASS_AUTH",
    "Copy .env.example -> .env and fill: DATABASE_URL, LOCAL_DEV_BYPASS_AUTH, AWS_REGION, BEDROCK_MODEL_ID, SQS_SUMMARY_QUEUE_URL, Cognito pool/client vars, Sarvam key",
    "pnpm install (root) -> pnpm --filter @okuvu/prisma exec prisma generate -> prisma migrate dev",
    "Start backend + portal; run Flutter with --flavor dev --dart-define=FLAVOR=dev",
]:
    add_para(s)

add_heading("18. Key Constraints (from README)", 1)
for c in [
    "A1 safety gate is non-negotiable — runs on every user turn.",
    "Crisis endpoints are never rate-limited (S3/S4 bypasses caps).",
    "AWS credentials never go in the repo — Secrets Manager + IAM task roles only.",
    "Therapist portal session notes (T-05) are never ingested into any agent (clinical boundary).",
    "All user data stays in ap-south-1 (Mumbai) — one region covers compute, DB, storage, auth and LLM inference (DPDP compliance).",
]:
    add_para(c)

add_heading("19. Documentation References (for further learning)", 1)
table = doc.add_table(rows=1, cols=2)
table.style = 'Light Grid Accent 1'
hdr = table.rows[0].cells
hdr[0].text = 'Doc'
hdr[1].text = 'Covers'
docs_refs = [
    ("docs/architecture.md", "High-level architecture"),
    ("docs/adr/", "Architecture Decision Records (monorepo, WebSocket auth, harness isolation, etc.)"),
    ("docs/AWS-CUTOVER-SPEC.md", "Authoritative cutover contract (env vars, replacements)"),
    ("docs/branching.md", "Git branching strategy"),
    ("docs/neon-setup.md", "Local Neon dev DB"),
    ("docs/fastify_healthCheck_JWT.md", "Fastify auth details"),
    ("docs/okuvu-v2.0/*", "v2.0 parity, specs, system prompts for A1-A9"),
    ("docs/test-harness/*", "Harness runbook, engineer/rater/sme guides"),
    ("docs/supervised-beta/*", "Supervised beta docs (consent, ethics, roster, completion)"),
]
for d, c in docs_refs:
    row = table.add_row().cells
    row[0].text = d
    row[1].text = c

doc.save("Okuvu_Tech_Stack_Summary.docx")
print("Saved Okuvu_Tech_Stack_Summary.docx")
