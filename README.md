# Okuvu — AI Mental Wellness Companion

> Internal development repository — Suvok Systems LLP, Bengaluru
> **Confidential. Do not share outside the engineering team.**

---

## What This Is

Okuvu is an AI-powered mental wellness companion for Indian Gen Z, built on a supervised therapist-led model. Users interact with an AI agent (A2) in bounded daily sessions; a licensed therapist oversees care plans and session notes via a separate portal.

**This repo is the complete MVP codebase.** It is a monorepo containing three deployable apps and two shared packages.

---

## Migration note (October 2026)

The stack moved from Google Cloud to AWS. Cloud Run → ECS Fargate, Cloud SQL → RDS for PostgreSQL, Cloud Tasks → SQS, Memorystore → ElastiCache (Valkey), Secret Manager → AWS Secrets Manager, Cloud KMS/Storage → AWS KMS/S3, Cloud Build/Artifact Registry → CodeBuild/ECR, Vertex AI (Gemini) → Amazon Bedrock (Nova Pro + Titan Embeddings V2), and Firebase Auth → a Cognito user pool. Everything is pinned to **ap-south-1 (Mumbai)**.

The authoritative contract for the cutover is [`docs/AWS-CUTOVER-SPEC.md`](docs/AWS-CUTOVER-SPEC.md); the phased plan is [`docs/AWS-MIGRATION-PLAN.md`](docs/AWS-MIGRATION-PLAN.md). Where older docs in `docs/` still describe the previous stack, the spec wins.

### Public hostnames (no Google-managed DNS or certificates)

Cloud Run used to hand out `*.a.run.app` hostnames and Google-managed TLS certs. The AWS equivalents are Route53 alias records to the ALB plus an ACM certificate, both in `infrastructure/aws/evia-beta/dns.tf`:

| Hostname | Serves | Client that hardcodes it |
|---|---|---|
| `api.okuvu.in` | apps/api | `apps/mobile` `prod` flavour |
| `beta.api.okuvu.in` | apps/api | `apps/mobile` `beta` flavour |
| `portal.okuvu.in` | apps/therapist-portal | therapist browsers; Cognito callback URL |

`terraform apply` creates the zone and prints `route53_zone_nameservers`; those NS records must be pasted into Spaceship (the `okuvu.in` registrar) before anything resolves. That delegation is the only DNS step not in code.

---

## Repo Structure

```
okuvu/
├── apps/
│   ├── mobile/               Flutter app (Android-first MVP) — not an npm workspace member
│   ├── api/                  Node.js/TypeScript backend (ECS Fargate) — @okuvu/api
│   ├── worker/               Background worker (ECS Fargate, SQS consumer) — @okuvu/worker
│   └── therapist-portal/     Next.js therapist portal — @okuvu/therapist-portal (ECS Fargate, portal.okuvu.in)
├── packages/
│   ├── prisma/               Prisma schema + generated client (shared) — @okuvu/prisma
│   └── shared-types/         TypeScript types shared across apps — @okuvu/shared-types
├── infrastructure/aws/       Terraform for the beta stack (VPC, RDS, ElastiCache, ECS api/worker/portal, ALB, Route53 + ACM, SQS, S3, KMS, ECR, Cognito)
├── scripts/                  Deploy and utility scripts (ECR push + ECS rollout)
├── buildspec.yml             CodeBuild pipeline: test → build → migrate → deploy
├── load-tests/               k6 WebSocket load test scripts
└── docs/                     Architecture decisions, setup guides
```

---

## Tech Stack

| Layer                     | Technology                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Mobile                    | Flutter (Android-first, iOS ready)                                                                                    |
| Backend API               | Node.js + TypeScript + Fastify                                                                                        |
| Background worker         | Node.js + TypeScript (SQS consumer)                                                                                   |
| Therapist portal          | Next.js 16 (App Router) + tRPC + NextAuth (Cognito provider)                                                          |
| Database                  | PostgreSQL via Prisma (Neon for dev, Amazon RDS for staging/prod)                                                     |
| Auth                      | Amazon Cognito (phone OTP for users, therapist pool for portal sign-in)                                               |
| LLM — Clinical agents     | Amazon Nova Pro (`amazon.nova-pro-v1:0`) via Bedrock, in-region ap-south-1                                           |
| LLM — Embeddings          | Amazon Titan Text Embeddings V2 (`amazon.titan-embed-text-v2:0`), 768-dim                                            |
| LLM — Comparison path     | OpenRouter (LLM_PROVIDER=openrouter)                                                                                  |
| TTS                       | Sarvam Bulbul v2                                                                                                      |
| Infrastructure            | AWS ap-south-1 (Mumbai) — ECS Fargate, RDS, ElastiCache (Valkey), S3, KMS, SQS, Secrets Manager, CloudWatch           |
| CI/CD                     | AWS CodeBuild + Amazon ECR (+ GitHub Actions for PR checks)                                                           |

---

## Prerequisites

Before you can run anything locally, you need:

1. **Node.js 20+** and **pnpm 9+** — install pnpm with `npm install -g pnpm`, then check with `pnpm -v`
2. **Flutter 3.x** (stable channel)
3. **Access to the shared Neon workspace** — see [docs/neon-setup.md](docs/neon-setup.md)
4. **AWS CLI v2 credentials** for the dev account (`aws sts get-caller-identity` must succeed) with Bedrock model access enabled for Nova Pro and Titan Embeddings V2 in `ap-south-1` — ask the Senior Engineer
5. **Cognito therapist app client** credentials for dev — ask the Senior Engineer (optional: the harness's local-dev bypass works without them)

See [docs/neon-setup.md](docs/neon-setup.md) for the full local database setup guide.

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/OkuvuAI/okuvu.git
cd okuvu

# 2. Copy env template and fill in your values
cp .env.example .env
# Edit .env with your Neon DATABASE_URL and dev credentials

# 3. Install all dependencies (runs from monorepo root)
pnpm install

# 4. Run the first database migration (once Prisma is configured — E0-S03)
cd apps/api && pnpm prisma migrate dev && cd ../..

# 5. Start the backend (from apps/api/)
cd apps/api && pnpm run dev

# 6. Start the therapist portal (from apps/therapist-portal/)
cd apps/therapist-portal && pnpm dev

# 7. Start the Flutter app (from apps/mobile/)
cd apps/mobile && flutter run --flavor dev
```

---

## Environments

| Environment       | AWS account / region | Deployed from                   | Purpose                                  |
| ----------------- | -------------------- | ------------------------------- | ---------------------------------------- |
| **dev**           | developer's own, `ap-south-1` | Local machine         | Individual story development             |
| **beta/staging**  | beta account, `ap-south-1`    | `main` branch (auto)  | Integration, dogfooding, supervised beta |
| **prod**          | prod account, `ap-south-1`    | Git tag `v*` (manual approval) | Live users                     |

Every environment runs in `ap-south-1` (Mumbai); `infrastructure/aws/evia-beta/variables.tf` rejects any other region.

---

## Branching

```
main        ← always deployable to the beta account (staging)
develop     ← story branches merge here first
story/*     ← one branch per ClickUp story (deleted after merge)
hotfix/*    ← P0 fixes only, direct to main
```

See [docs/branching.md](docs/branching.md) for the full branching guide.

---

## Sprint Plan

| Sprint                                       | Scope                                           | Stories | Hours |
| -------------------------------------------- | ----------------------------------------------- | ------- | ----- |
| Sprint 1 — Foundation                       | Monorepo, DB, auth, agent pipeline              | 21      | 59h   |
| Sprint 2 — Core Features                    | WebSocket sessions, chat UI, safety, memory     | 23      | 73h   |
| Sprint 3 — Home, Settings, Therapist Portal | Home/progress screens, settings, full portal    | 18      | 49h   |
| Sprint 4 — Testing, Dogfooding & Beta       | Automated tests, HALT sign-off, supervised beta | 9       | 63h   |

All stories are tracked in ClickUp under the **Evia** folder.

---

## Key Constraints — Read Before You Build

1. **A1 safety gate is non-negotiable** — it runs on every single user turn, no exceptions, no bypass in any environment other than the explicitly-documented local dev bypass.
2. **Crisis endpoints are never rate-limited** — `safety_state = S3 or S4` bypasses all session/turn caps. Do not change this.
3. **AWS credentials never go in the repo** — Secrets Manager and IAM task roles only, injected into the ECS task definition at deploy time.
4. **Therapist portal session notes (T-05) are never ingested into any agent** — this is a deliberate clinical boundary, not an oversight.
5. **All user data stays in ap-south-1 (Mumbai)** — one AWS region covers compute, DB, storage, auth, and LLM inference (DPDP compliance).

---

## Contacts

| Role                  | Responsibility                                                 |
| --------------------- | -------------------------------------------------------------- |
| Senior Engineer       | Backend, infra, AWS, PR reviews for all server-side code       |
| Lead Developer        | Flutter, therapist portal, PR reviews for all client-side code |
| Backend Interns (×4) | API endpoints, agents, DB queries                              |
| Flutter Interns (×4) | Mobile screens, widgets, state management                      |

---

*OKUVU · Suvok Systems LLP · Bengaluru · Confidential*
