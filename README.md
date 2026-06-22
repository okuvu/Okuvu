# Evia — AI Mental Wellness Companion

> Internal development repository — Suvok Systems LLP, Bengaluru
> **Confidential. Do not share outside the engineering team.**

---

## What This Is

Evia is an AI-powered mental wellness companion for Indian Gen Z, built on a supervised therapist-led model. Users interact with an AI agent (A2) in bounded daily sessions; a licensed therapist oversees care plans and session notes via a separate portal.

**This repo is the complete MVP codebase.** It is a monorepo containing three deployable apps and two shared packages.

---

## Repo Structure

```
evia/
├── apps/
│   ├── mobile/               Flutter app (Android-first MVP)
│   ├── api/                  Node.js/TypeScript backend (Cloud Run)
│   ├── worker/               evia-worker background jobs (Cloud Run)
│   └── therapist-portal/     Next.js therapist portal
├── packages/
│   ├── prisma/               Prisma schema + generated client (shared)
│   └── shared-types/         TypeScript types shared across apps
├── infra/                    Cloud Build + Cloud Run configs
├── load-tests/               k6 WebSocket load test scripts
└── docs/                     Architecture decisions, setup guides
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | Flutter (Android-first, iOS ready) |
| Backend API | Node.js + TypeScript + Fastify |
| Background worker | Node.js + TypeScript (Cloud Tasks consumer) |
| Therapist portal | Next.js 14 (App Router) + tRPC + NextAuth |
| Database | PostgreSQL via Prisma (Neon for dev, Cloud SQL for staging/prod) |
| Auth | Firebase Authentication (OTP for users, Google OAuth for therapists) |
| LLM — Clinical agents | Gemini 3.1 Pro via Vertex AI (asia-south1) |
| LLM — Governance/summary | Gemini 3.1 Flash-Lite via Vertex AI |
| TTS | Sarvam Bulbul v2 |
| Infrastructure | GCP asia-south1 (Mumbai) — Cloud Run, Cloud SQL, Cloud Storage, Cloud KMS, Cloud Tasks, Secret Manager, Memorystore Redis |
| CI/CD | Cloud Build + Artifact Registry |

---

## Prerequisites

Before you can run anything locally, you need:

1. **Node.js 20+** and **npm 10+**
2. **Flutter 3.x** (stable channel)
3. **A Neon account** — [neon.tech](https://neon.tech) (free tier is enough)
4. **GCP credentials** for evia-dev — ask the Senior Engineer
5. **Firebase config** for evia-dev — ask the Senior Engineer

See [docs/neon-setup.md](docs/neon-setup.md) for the full local database setup guide.

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/suvoksystems/evia.git
cd evia

# 2. Copy env template and fill in your values
cp .env.example .env
# Edit .env with your Neon DATABASE_URL and dev credentials

# 3. Install all dependencies (runs from monorepo root)
npm install

# 4. Run the first database migration
cd apps/api && npx prisma migrate dev && cd ../..

# 5. Start the backend (from apps/api/)
cd apps/api && npm run dev

# 6. Start the Flutter app (from apps/mobile/)
cd apps/mobile && flutter run --flavor dev
```

---

## Environments

| Environment | GCP Project | Deployed from | Purpose |
|---|---|---|---|
| **dev** | `evia-dev` | Local machine | Individual story development |
| **staging** | `evia-beta` | `main` branch (auto) | Integration, dogfooding, supervised beta |
| **prod** | `evia-production` | Git tag `v*` (manual approval) | Live users |

---

## Branching

```
main        ← always deployable to evia-beta (staging)
develop     ← story branches merge here first
story/*     ← one branch per ClickUp story (deleted after merge)
hotfix/*    ← P0 fixes only, direct to main
```

See [docs/branching.md](docs/branching.md) for the full branching guide.

---

## Sprint Plan

| Sprint | Scope | Stories | Hours |
|---|---|---|---|
| Sprint 1 — Foundation | Monorepo, DB, auth, agent pipeline | 21 | 59h |
| Sprint 2 — Core Features | WebSocket sessions, chat UI, safety, memory | 23 | 73h |
| Sprint 3 — Home, Settings, Therapist Portal | Home/progress screens, settings, full portal | 18 | 49h |
| Sprint 4 — Testing, Dogfooding & Beta | Automated tests, HALT sign-off, supervised beta | 9 | 63h |

All stories are tracked in ClickUp under the **Evia** folder.

---

## Key Constraints — Read Before You Build

1. **A1 safety gate is non-negotiable** — it runs on every single user turn, no exceptions, no bypass in any environment other than the explicitly-documented local dev bypass.
2. **Crisis endpoints are never rate-limited** — `safety_state = S3 or S4` bypasses all session/turn caps. Do not change this.
3. **GCP credentials never go in the repo** — Secret Manager only, injected at Cloud Run deploy time.
4. **Therapist portal session notes (T-05) are never ingested into any agent** — this is a deliberate clinical boundary, not an oversight.
5. **All user data stays in asia-south1 (Mumbai)** — single GCP DPA covers compute, DB, storage, auth, and LLM inference.

---

## Contacts

| Role | Responsibility |
|---|---|
| Senior Engineer | Backend, infra, GCP, PR reviews for all server-side code |
| Lead Developer | Flutter, therapist portal, PR reviews for all client-side code |
| Backend Interns (×4) | API endpoints, agents, DB queries |
| Flutter Interns (×4) | Mobile screens, widgets, state management |

---

*EVIA · Suvok Systems LLP · Bengaluru · Confidential*
