# Evia — Architecture Overview

> Last updated: June 2026 · Corresponds to Infrastructure Decision Record v3.0

---

## The Big Picture

Evia is three things running together:

1. **A Flutter mobile app** — the end-user experience (Android-first for MVP)
2. **A Node.js API** on GCP Cloud Run — the backend that handles all sessions, agents, and data
3. **A Next.js therapist portal** — a separate web app where licensed therapists supervise their clients

All three live in this monorepo. There is also a fourth deployable: **evia-worker**, a Node.js background service that handles async jobs (primarily the post-session summary pipeline).

---

## Infrastructure — GCP Only

Everything runs on GCP asia-south1 (Mumbai). There is no AWS. This is a deliberate decision (documented in ADR-001) made before any code was written, primarily for DPDP 2026 compliance (single GCP Data Processing Agreement covers compute, database, storage, auth, and LLM inference).

| Component | Service |
|---|---|
| Backend API + worker | Cloud Run (containerised Node.js) |
| Database | Cloud SQL PostgreSQL (Multi-zone) |
| Local dev database | Neon (PostgreSQL-compatible, branch per developer) |
| Auth — end users | Firebase Authentication (OTP/SMS) |
| Auth — therapists | Firebase Authentication (Google OAuth) |
| LLM — clinical agents | Vertex AI — Gemini 3.1 Pro |
| LLM — governance/summary | Vertex AI — Gemini 3.1 Flash-Lite |
| TTS | Sarvam Bulbul v2 |
| File storage | Cloud Storage + Cloud CDN |
| Encryption (emergency contacts) | Cloud KMS |
| Session rate limiting | Memorystore for Redis |
| Secrets | Secret Manager |
| Async jobs | Cloud Tasks (queue) + Cloud Scheduler (cron) |
| CI/CD | Cloud Build + Artifact Registry |
| Monitoring | Cloud Monitoring + Cloud Logging |

---

## Agent Architecture

The backend is not a single AI call — it is a pipeline of 5 agents that run on every user turn:

```
User message (USER_TURN)
        │
        ▼
   A9-pre (Flash-Lite)
   Governance pre-gate — checks content policy before anything else
        │
        ▼
   A1 (Gemini Pro)
   Safety gate — classifies safety state (S1-S4)
   S4 = crisis → immediately routes to crisis screen, bypasses all other agents
        │
        ▼
   A8 (code-only, no LLM)
   4-gate router — decides which therapeutic agent handles this turn
        │
        ▼
   A2 (Gemini Pro)
   Sole therapeutic agent for MVP — handles all 3 care plans (CP1/CP2/CP3)
        │
        ▼
   A13 (flutter_tts, no LLM)
   Text-to-speech — converts A2's response to audio
        │
        ▼
   AGENT_TURN frame sent to client
```

**Agents deferred to post-MVP:** A3–A7 (specialised therapeutic agents), A10B (offline insights), A11 (content library), A14 (assessment scoring), A15 (all 10 care plan domains).

**Memory pipeline (async, runs after session close):**
- A10A (Flash-Lite) — generates a structured session summary via Cloud Tasks queue
- E7-S04's fallback logic — uses raw turns if the summary isn't ready yet when the next session opens

---

## Database

Single PostgreSQL database (Neon for dev, Cloud SQL for staging/prod). ORM is Prisma.

Key tables and what owns them:
- `users`, `firebase_users` — auth and user identity
- `clinical_configs` — care plan assignment (provisional or confirmed), reasoning note from onboarding scoring
- `session_logs`, `session_turns` — every session and every message
- `session_limits` — rate limiting state (one row per user per day, IST-keyed)
- `session_summaries` — A10A's async output, read by A8's context bundle on next session open
- `mood_logs` — daily mood check-ins from the home screen (user_input tagged)
- `user_settings` — voice toggle and other preferences
- `emergency_contacts` — AES-256-GCM encrypted at application layer
- `safety_states` — current and historical safety state per user
- `therapists`, `therapist_client_assignments` — portal-side relationship
- `therapist_notes` — T-05 session notes (NEVER read by any agent)

The full schema is in `packages/prisma/schema.prisma`.

---

## Environments

| | dev | staging | prod |
|---|---|---|---|
| GCP Project | `evia-dev` | `evia-500215` | `evia-production` |
| Database | Neon (personal branch) | Cloud SQL | Cloud SQL (Multi-zone) |
| LLM | Vertex AI (dev quota) | Vertex AI | Vertex AI |
| Deployed from | Local machine | `main` branch (auto) | Git tag `v*` (manual) |

---

## Key Decisions Already Made — Do Not Relitigate

| Decision | What was decided | Why |
|---|---|---|
| Cloud provider | GCP only, no AWS | Single DPA for DPDP 2026 compliance; Vertex AI is already GCP |
| Monorepo tool | Plain pnpm workspaces, not Turborepo/Nx | Team size doesn't justify build-system overhead |
| Mobile framework | Flutter (Android-first) | Cross-platform coverage from one codebase |
| Backend framework | Fastify (not Express) | Better TypeScript support, lower overhead for WebSocket-heavy workload |
| ORM | Prisma | Type safety, migration management, Neon compatibility |
| TTS provider | Sarvam Bulbul v2 | Indian language support, neural quality, contractual relationship |
| Local dev database | Neon (not Cloud SQL Proxy) | Cloud SQL Proxy setup takes 1.5-2h per developer; Neon branches are instant |
| Session notes isolation | T-05 notes are never ingested into any agent | Deliberate clinical boundary — therapist controls what informs the AI |

Each of these is documented with full rationale in `docs/adr/`.

---

## DPDP 2026 Compliance Note

All user data — including session content sent to Gemini via Vertex AI — is processed within GCP asia-south1 (Mumbai). A single Google Cloud DPA covers compute, database, storage, auth, and LLM inference. Sarvam AI has a separate DPA (independent vendor).

**Legal counsel must confirm DPDP 2026 adequacy of GCP asia-south1 for mental health data before any production deployment with real user data.** This is a P0 pre-production blocker.
