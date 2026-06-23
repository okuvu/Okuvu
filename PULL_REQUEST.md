**Story:** E0-S01 — Monorepo Structure

**ClickUp task:** <!-- paste link here -->

---

## What changed

Set up the pnpm-workspaces monorepo foundation for the EVIA codebase. Created root workspace configuration via `pnpm-workspace.yaml`, four scoped workspace packages (`@evia/backend`, `@evia/therapist-portal`, `@evia/prisma`, `@evia/shared-types`), and a `scripts/` directory. The Flutter `apps/mobile` is excluded from workspaces. All workspace dependencies use `workspace:*` protocol. Out-of-scope developer tooling files (`.opencode/`, `graphify-out/`, `AGENTS.md`) are gitignored.

---

## Changes

**Created:**
- `package.json` — pnpm-only root config with `packageManager` pin + Node engine constraint
- `pnpm-workspace.yaml` — workspace config with `apps/*` and `packages/*` globs
- `apps/backend/package.json` — `@evia/backend` with `workspace:*` deps + `dev` script stub
- `apps/therapist-portal/package.json` — `@evia/therapist-portal` with `workspace:*` deps
- `packages/prisma/package.json` — `@evia/prisma` with `main`/`types` forward-looking stubs
- `packages/prisma/index.ts` — placeholder re-export (filled in E0-S03)
- `packages/shared-types/package.json` — `@evia/shared-types` with TypeScript `exports` map
- `packages/shared-types/index.ts` — TypeScript stub (replaces CommonJS)
- `scripts/.gitkeep` — placeholder to track the directory

**Deleted:**
- `package-lock.json` — npm lockfile; pnpm uses `pnpm-lock.yaml`
- `packages/shared-types/index.js` — replaced with TypeScript equivalent

**Modified:**
- `.gitignore` — restored pnpm lockfile comments, ignore `package-lock.json`, ignore dev tooling artifacts (`.opencode/`, `graphify-out/`, `AGENTS.md`)
- `README.md` — pnpm setup instructions, `scripts/` in tree diagram, fixed dev command, corrected clone URL

---

## Test evidence

**Validation output (clean install):**
```
$ pnpm install
Scope: all 5 workspace projects
Lockfile is up to date
Done in 441ms

$ pnpm ls --recursive --depth=0
@evia/backend
├── @evia/prisma@link:../../packages/prisma
└── @evia/shared-types@link:../../packages/shared-types

@evia/therapist-portal
├── @evia/prisma@link:../../packages/prisma
└── @evia/shared-types@link:../../packages/shared-types

4 packages in 5 projects
```

**Acceptance criteria:**
- [x] Fresh clone + `pnpm install` from root succeeds — zero errors, zero warnings
- [x] Each app folder has its own `package.json` with `workspace:*` protocol references to `@evia/prisma` and `@evia/shared-types`
- [x] `apps/mobile` is NOT a workspace member — confirmed via `pnpm ls`
- [x] README documents folder structure and exact commands to run each app locally
- [x] Two sequential `pnpm install` runs produce no changes to lockfile
- [x] Out-of-scope files (`.opencode/`, `graphify-out/`, `AGENTS.md`) are gitignored — not included in this PR

---

## Checklist

- [ ] `.env.example` updated — N/A, no new env vars
- [x] No credentials, service account keys, or `.env` values committed
- [ ] `LOCAL_DEV_BYPASS_AUTH` not hardcoded — N/A, no auth code
- [ ] No new types duplicating `packages/shared-types/` — N/A, stub only
- [x] AI Coding Notes from ClickUp spec checked: plain pnpm workspaces, no Turborepo/Nx, mobile excluded, `.gitignore` correct
- [x] Story acceptance criteria are all met
