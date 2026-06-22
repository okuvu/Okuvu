# Contributing to Evia

This guide is for the Evia engineering team. It covers local setup, our git workflow, PR process, and code conventions.

---

## Local Setup

### 1. Prerequisites

Install these before cloning the repo:

- **Node.js 20+** — check with `node -v`
- **pnpm 9+** — install with `npm install -g pnpm`, then check with `pnpm -v`
- **Flutter 3.x (stable)** — check with `flutter doctor`
- **Git** — check with `git --version`
- A **Neon account** at [neon.tech](https://neon.tech) (free tier)
- A code editor — VS Code with the Flutter and ESLint extensions recommended

### 2. Clone and install

```bash
git clone https://github.com/suvoksystems/evia.git
cd evia
pnpm install
```

`pnpm install` at the repo root installs dependencies for all workspace packages at once.

### 3. Set up your local database

Follow [docs/neon-setup.md](docs/neon-setup.md) — it takes about 10 minutes and gets you a working local PostgreSQL database without needing GCP credentials.

### 4. Configure your environment

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:
- `DATABASE_URL` — your Neon branch connection string (from the setup guide)
- `FIREBASE_ADMIN_SDK_PATH` — path to your Firebase dev service account JSON (get from Senior Engineer)
- `VERTEX_AI_SA_KEY_PATH` — path to your GCP dev service account JSON (get from Senior Engineer)
- Set `LOCAL_DEV_BYPASS_AUTH="true"` for local development so you don't need real Firebase tokens

### 5. Run the first migration

```bash
cd apps/api
pnpm prisma migrate dev
cd ../..
```

This creates all the tables in your Neon branch.

### 6. Start developing

```bash
# Backend API (from apps/api/)
cd apps/api && pnpm dev

# Therapist portal (from apps/therapist-portal/)
cd apps/therapist-portal && pnpm dev

# Flutter app (from apps/mobile/)
cd apps/mobile && flutter run --flavor dev
```

---

## Git Workflow

### Branch naming

```
story/E{epic}-S{story}-short-description    ← for all normal story work
hotfix/p0-short-description                 ← for P0 bugs during Sprint 4 only
```

Examples:
```
story/E0-S01-monorepo-setup
story/E4-S02-websocket-turn-pipeline
story/E9-S02-emergency-contact-encryption
hotfix/p0-crisis-screen-offline-render
```

### Starting a story

```bash
# Always branch from develop, not from main
git checkout develop
git pull origin develop
git checkout -b story/E4-S02-websocket-turn-pipeline
```

### Daily sync

Pull from develop every morning before starting work to stay up to date:

```bash
git fetch origin
git rebase origin/develop
```

### Opening a PR

1. Push your story branch: `git push origin story/E4-S02-websocket-turn-pipeline`
2. Open a PR on GitHub targeting **`develop`** (not `main`)
3. Fill in the PR template — all three sections are required
4. Assign a reviewer:
   - Backend/infra stories → Senior Engineer
   - Flutter/portal stories → Lead Developer
5. Wait for CI to pass before requesting review

### After your PR merges

Your story branch is deleted automatically (GitHub is configured to do this). No manual cleanup needed.

---

## Commit Messages

Use this format:

```
type(scope): short description

Optional longer explanation if needed.
```

**Type:**
- `feat` — a new feature or story implementation
- `fix` — a bug fix
- `chore` — build, config, tooling, dependency updates
- `test` — adding or updating tests
- `docs` — documentation changes only
- `refactor` — code change that neither fixes a bug nor adds a feature

**Scope:** the ClickUp story ID, e.g. `E4-S02`

Examples:
```
feat(E4-S02): WebSocket turn pipeline with A8 routing
fix(E6-S02): crisis screen renders correctly in airplane mode
chore(E0-S01): monorepo pnpm workspace setup
test(E12-S01): Vitest rate limiter concurrency test
```

Keep the first line under 72 characters. Reference the ClickUp story ID in the scope so the commit is traceable.

---

## PR Guidelines

### Size

One story = one PR. If a story is too large for one PR, split it into sub-tasks in ClickUp and open a PR per sub-task.

### PR template

Every PR must fill in all three sections of the template:
1. **Story** — the ClickUp story ID (e.g. `E4-S02`)
2. **What changed** — a brief description of what you built
3. **Test evidence** — how you verified it works

For backend stories, test evidence should include:
- A curl command or Postman screenshot showing the endpoint responding correctly
- The acceptance criteria from the ClickUp task, checked off

For Flutter stories, test evidence should include:
- A screenshot or screen recording of the UI
- Confirmation it runs on a real device (not just the emulator) for any story involving offline behavior or device hardware

### What reviewers look for

Reviewers will specifically check:
- The acceptance criteria from the ClickUp story spec are met
- No `.env` values or GCP credentials committed
- `LOCAL_DEV_BYPASS_AUTH` is not accidentally left `true` in production-bound code
- The story's AI Coding Notes section constraints are followed (especially the ones marked "common mistakes")
- New API endpoints have self-only authorization where required

---

## Code Conventions

### TypeScript (backend + portal)

- Strict mode on (`"strict": true` in tsconfig)
- No `any` — if you're reaching for `any`, use `unknown` and narrow it
- Export types from `packages/shared-types/` if they're needed in more than one app
- Never redefine types that already exist in `packages/shared-types/` — import them

### Flutter (mobile)

- Use Riverpod for state management — no `setState` in screens
- Screens live in `lib/screens/`, reusable widgets in `lib/widgets/`
- One file per screen, one file per non-trivial widget
- No hardcoded colors or sizes — use the theme

### Prisma (database)

- Never edit `packages/prisma/schema.prisma` without first checking with the Senior Engineer
- Never write raw SQL in application code — use Prisma's type-safe query API
- New migrations run via `pnpm prisma migrate dev` locally, `pnpm prisma migrate deploy` in CI

### Security rules (non-negotiable)

- GCP credentials: Secret Manager only, never environment variables in cloud environments
- `.env` files: local only, never committed
- `LOCAL_DEV_BYPASS_AUTH`: local only, must be `false` (or absent) in all cloud environments
- Emergency contact data: AES-256-GCM encryption before any write, never logged
- Therapist session notes: never referenced in any agent context bundle — architectural boundary

---

## Getting Help

Stuck on something? In order:

1. Check the ClickUp story spec — the "Development Notes" and "AI Coding Notes" sections often answer common questions
2. Ask in the team chat
3. Tag the Senior Engineer (backend/infra) or Lead Developer (Flutter/portal) directly

If you discover a bug in a **different** story while working on your own — log it in GitHub Issues with reproduction steps, don't fix it inline. That keeps PRs focused and bugs traceable.
