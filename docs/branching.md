# Evia — Branching Guide

---

## Branch Structure

```
main        ← always deployable to evia-500215 (staging)
develop     ← all story branches merge here first
story/*     ← one branch per ClickUp story (deleted after merge)
hotfix/*    ← P0 fixes only, direct to main (Sprint 4 only)
```

That's it. Two permanent branches. Everything else is transient.

---

## What Each Branch Does

### `main`
- Always represents a state that can be deployed to evia-500215 (staging)
- Cloud Build auto-deploys to evia-500215 on every merge to `main`
- Git tags on `main` trigger production deploys (`v1.0.0`, etc.)
- **No direct pushes** — everything goes through a PR

### `develop`
- The integration branch where story work accumulates before going to staging
- Story branches merge into `develop` via PR
- `develop` merges into `main` once per day (end of day, or when a logical batch of stories is ready)
- **No direct pushes** — everything goes through a PR

### `story/*`
- Created by the developer when they pick up a ClickUp story
- Named: `story/E{epic}-S{story}-short-description`
- Merged into `develop` via PR
- **Deleted automatically after merge** (GitHub is configured to do this)

### `hotfix/*`
- Used only during Sprint 4 for P0 bugs that need to go to staging immediately
- Branches from `main`, merges directly to `main`
- Must also be merged back into `develop` after merging to `main`

---

## The Flow

```
Intern starts a story
        │
        ▼
git checkout develop && git pull
git checkout -b story/E4-S02-websocket-turn-pipeline
        │
        │  ... builds and tests locally against Neon dev branch ...
        │
        ▼
git push origin story/E4-S02-websocket-turn-pipeline
Opens PR → develop
        │
        │  Reviewer checks AC from ClickUp task
        │  CI must pass (tsc + vitest + flutter test where applicable)
        │
        ▼
PR merges to develop
Story branch auto-deleted
        │
        │  (End of day, or when a logical batch is ready)
        │
        ▼
Senior Engineer opens PR: develop → main
Merges → Cloud Build deploys to evia-500215
        │
        │  (After E12-S05 HALT sign-off + E13-S04 P0 fixes complete)
        │
        ▼
git tag v1.0.0 && git push origin v1.0.0
Cloud Build deploys to evia-production
(Manual approval required in GCP Console before the deploy runs)
```

---

## Creating a Story Branch

```bash
# Always start from develop
git checkout develop
git pull origin develop

# Create your branch
git checkout -b story/E4-S02-websocket-turn-pipeline

# Work, commit, push
git add .
git commit -m "feat(E4-S02): WebSocket turn pipeline with A8 routing"
git push origin story/E4-S02-websocket-turn-pipeline

# Open PR on GitHub targeting develop
```

---

## Naming Convention

```
story/E{epic}-S{story}-short-description

Examples:
story/E0-S01-monorepo-setup
story/E0-S03-prisma-schema
story/E4-S02-websocket-turn-pipeline
story/E6-S02-crisis-screen
story/E9-S02-emergency-contact-encryption
story/E12-S01-vitest-rate-limiter
story/E13-S01-internal-dogfooding

Hotfixes (Sprint 4 only):
hotfix/p0-crisis-screen-offline-render
hotfix/p0-rate-limiter-race-condition
```

Keep the description short but specific. Avoid generic names like `story/E4-S02-fix` or `story/backend-work`.

---

## Branch Protection Rules

Both `main` and `develop` have GitHub branch protection enabled:

| Rule | `main` | `develop` |
|---|---|---|
| Require PR before merging | ✅ | ✅ |
| Require 1 approving review | ✅ | ✅ |
| Require CI to pass | ✅ | ✅ |
| No direct pushes (including Senior Engineer) | ✅ | ✅ |
| No force push | ✅ | ✅ |
| No deletion | ✅ | ✅ |

**Who reviews what:**
- Backend and infra PRs → Senior Engineer reviews
- Flutter and portal PRs → Lead Developer reviews
- If the Senior Engineer opens a PR, the Lead Developer reviews (and vice versa)

---

## Keeping Your Branch Up to Date

If your story takes more than a day, rebase on `develop` daily to avoid large merge conflicts at PR time:

```bash
git fetch origin
git rebase origin/develop
# resolve any conflicts, then:
git push origin story/E4-S02-websocket-turn-pipeline --force-with-lease
```

Use `--force-with-lease` (not `--force`) — this is safe because nobody else works on your story branch.

---

## Neon Branches and Git Branches

Each developer has a personal Neon database branch for local development. These are independent of git branches — you don't create a new Neon branch per story branch. Your single personal Neon branch (`your-name-dev`) is your development database, regardless of which story branch you're on.

There is also a `develop` Neon branch (maintained by the Senior Engineer) that CI runs against when testing PRs to `develop`. You don't interact with this branch directly.

See [docs/neon-setup.md](neon-setup.md) for how to create and use your personal Neon branch.

---

## Production Deploys

Production deploys happen via Git tags on `main`. Only the Senior Engineer creates production tags.

```bash
# After E12-S05 HALT sign-off and E13-S04 P0 fix completion:
git checkout main
git pull origin main
git tag -a v1.0.0 -m "EVIA MVP v1.0.0 — post-HALT sign-off and P0 fixes"
git push origin v1.0.0
```

Cloud Build detects the tag and triggers the production pipeline. A manual approval step in GCP Console is required before the actual deploy runs — the Senior Engineer must explicitly click Approve in the Cloud Build UI. This prevents an accidental tag from going live.

---

## What Not to Do

- **Don't branch from `main`** for story work — always branch from `develop`
- **Don't open PRs directly to `main`** for story work — only P0 hotfixes go directly to `main`
- **Don't merge your own PR** — wait for a review, even if CI passes
- **Don't create long-lived feature branches** — one story, one PR, merge when done
- **Don't commit with `--no-verify`** — if pre-commit hooks fail, fix the underlying issue
