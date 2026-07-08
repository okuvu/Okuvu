# Prisma Migration Drift — Sync Runbook

> **Use this runbook when** the schema in `packages/prisma/schema.prisma` and/or the migration files in `packages/prisma/migrations/` are no longer in sync with the actual state of a Neon database (typically the `main` branch in the shared `evia-dev` workspace, but the same procedure works for any Neon branch or Cloud SQL instance).
>
> Last incident this was used for: 2026-07-08 — see git history for `story/E0-S03-reset-neon-main-schema` and PR [#95](https://github.com/EviaAI/evia/pull/95).

---

## 1. Symptoms — when to suspect drift

- `pnpm prisma migrate status` reports a different migration state locally than what CI sees.
- A migration in `packages/prisma/migrations/` has a different timestamp in its folder name than the corresponding record in the database's `_prisma_migrations` table.
- `prisma migrate dev` warns about "drift detected" or refuses to create a new migration.
- App code references a model/column that exists in `schema.prisma` but the database query fails with `relation does not exist` or `column does not exist`.
- The Neon dashboard's SQL editor shows tables/indexes that don't match what `schema.prisma` would predict.

---

## 2. Repo layout (quick context)

| Path | What it is |
|---|---|
| `packages/prisma/schema.prisma` | Single source-of-truth Prisma schema (provider: `postgresql`, reads `DATABASE_URL` from `.env` via `packages/prisma/prisma.config.ts`) |
| `packages/prisma/migrations/` | Versioned migrations; each subdirectory is `<timestamp>_<name>/migration.sql` + `migration_lock.toml` |
| `packages/prisma/prisma.config.ts` | Loads `.env` and exposes `DATABASE_URL` to Prisma CLI |
| `apps/api/prisma.config.ts` | Alternate entry point — points `schema` at `packages/prisma/schema.prisma`. Per `CONTRIBUTING.md:49`, run `prisma` commands from `apps/api/` |
| `packages/prisma/seed.ts` | Seed script — 3 mock users with `CP1`/`CP2`/`CP3` clinical configs |
| `docs/neon-setup.md` | Neon workspace topology and personal-branch workflow |
| `CONTRIBUTING.md` | Branching, PR, and Prisma conventions — read this first |

**Two non-obvious things:**
1. We use **Prisma 7** (`prisma: ^7.8.0` per `packages/prisma/package.json:9`). Some CLI flags differ from Prisma 5/6 — see §6.
2. The `migrate dev` command is **interactive**. The `migrate deploy` command is **non-interactive** and is what CI uses (`CONTRIBUTING.md:215`). For sync operations against shared databases, **always use `migrate deploy`**.

---

## 3. Diagnosis — read-only, run these first

All commands run from `apps/api/` unless noted. They are read-only — they will not change anything.

### 3.1 Check what Prisma thinks the local state is

```powershell
cd apps/api
pnpm prisma migrate status
```

If the output says **"Database schema is up to date"** — there is no drift, you're done.

If it lists pending migrations, drift exists. Note the names and timestamps.

### 3.2 Check what migrations exist in `packages/prisma/migrations/`

```powershell
Get-ChildItem -Directory packages\prisma\migrations | Select-Object Name
```

### 3.3 Check what migrations the database has actually applied

```powershell
psql "$env:DATABASE_URL" -c "SELECT migration_name, finished_at, applied_steps_count, rolled_back_at FROM _prisma_migrations ORDER BY started_at;"
```

(If you don't have `psql` installed, the Neon dashboard's SQL editor runs the same query.)

### 3.4 Check the live database schema

Two ways:

**A. Generate the schema Prisma would *infer* from the DB and diff against `schema.prisma`:**

```powershell
cd packages/prisma
pnpm prisma db pull --print
```

This prints the live schema. Compare it to `schema.prisma` — every difference is real drift.

**B. Generate the SQL Prisma *thinks* is needed to bring the DB to the current schema:**

```powershell
cd packages/prisma
pnpm prisma migrate diff --from-url "$env:DATABASE_URL" --to-schema ./schema.prisma --script
```

(Prisma 7 requires `--from-url` for URL-based diffs; see §6 on the removed `--from-schema-datamodel` flag.)

If this prints `SELECT 1;` or is empty — DB and schema are in sync.

### 3.5 Compare an old migration's expected SQL to what was actually applied

```powershell
# Show the local migration SQL
Get-Content packages\prisma\migrations\<migration_name>\migration.sql
```

If the timestamps differ between the folder name and `_prisma_migrations.migration_name`, but the SQL is identical, you have a *renamed* migration — see Path A.3 in §4.1.

---

## 4. Decision tree — which path to take

```
Is there real schema drift (3.4 reports non-empty SQL or 3.1 lists pending migrations)?
├── NO  → Done. Verify with `prisma migrate status`.
└── YES
    │
    ├── Is the DB a *subset* of `schema.prisma` (DB is missing tables/columns that schema has)?
    │   ├── YES → Path A (apply delta migration)
    │   │         If delta == single model like MoodLog → one new migration
    │   │         If delta is scattered → one new migration OR a resolve-then-apply sequence
    │   │
    │   └── NO (DB has things schema doesn't)
    │       │
    │       ├── Is the drift small and well-understood (one off-by-one column, one orphan table)?
    │       │   └── YES → Path B (write a corrective migration)
    │       │
    │       └── Is the drift large, unclear, or the DB was seeded from a now-rolled-back branch?
    │           └── YES → Path C (nuke and pave) — see §5
    │
    └── Is the drift just a *timestamp mismatch* on the init migration (same SQL, different name)?
        └── YES → Path A.3 (resolve drift with `migrate resolve`)
```

When in doubt, ask the Senior Engineer before going to Path C. Path C is destructive.

---

## 5. Pre-flight checklist (any path that touches a shared DB)

These are the same gates as `docs/neon-setup.md` for any team-wide action.

- [ ] **Senior Engineer sign-off in writing** (team chat / PR comment) — required by `docs/neon-setup.md:14` (SR owns the workspace).
- [ ] **Team notified** at least 1 hour before: "Wiping Neon `<branch>` at <time>. All sibling personal branches may be affected. Push any unmerged migration work to git first."
- [ ] **Backup taken** — see §5.1.
- [ ] **`.env` is set** — `DATABASE_URL` points at the exact branch you're syncing (verify the host in the connection string).
- [ ] **You are on a `story/*` branch off `develop`** per `CONTRIBUTING.md:91`. Do not run destructive commands from `develop` or `main` directly.

### 5.1 Backup procedure

```powershell
$env:DATABASE_URL = (Get-Content .env | Select-String '^DATABASE_URL=').ToString().Split('=', 2)[1].Trim('"')
pg_dump "$env:DATABASE_URL" --schema-only --no-owner > "$env:USERPROFILE\Downloads\neon-<branch>-schema-backup-$(Get-Date -Format yyyyMMdd).sql"
pg_dump "$env:DATABASE_URL" --no-owner > "$env:USERPROFILE\Downloads\neon-<branch>-full-backup-$(Get-Date -Format yyyyMMdd).sql"
```

Store these in `~/Downloads/` (not in the repo). Confirm both files are non-empty before proceeding.

---

## 6. Prisma 7 CLI gotchas (different from Prisma 5/6)

| Old (Prisma 5/6) | New (Prisma 7) | Notes |
|---|---|---|
| `--from-schema-datamodel <path>` | `--from-schema <path>` | The `-datamodel` suffix was dropped |
| `--to-schema-datamodel <path>` | `--to-schema <path>` | Same |
| `--from-migrations <dir>` (no shadow DB needed) | `--from-migrations <dir>` (requires `datasource.shadowDatabaseUrl` in `prisma.config.ts`) | If you hit the shadow DB error, set the env var or use `--from-empty` + a temp-empty migration folder instead |
| `prisma.config.ts` (optional) | `prisma.config.ts` (required for `migrate dev` and most subcommands) | Repo already has this |
| `previewFeatures = ["..."]` in schema | `previewFeatures` block is unchanged but list of features has shifted | Not needed for this runbook |

---

## 7. Path A — Apply a delta migration (standard)

Use when the DB is a subset of `schema.prisma` and the delta is small and well-bounded.

### 7.1 Generate the delta SQL

```powershell
cd packages\prisma
pnpm prisma migrate diff --from-empty --to-schema ./schema.prisma --script > full.sql
# Then compare full.sql to the cumulative effect of the existing migrations.
# The delta is the difference.
```

If the delta is small (one model), hand-write or paste the delta into a new migration folder. If the delta is large or you can't easily diff, fall back to:

```powershell
# Move MoodLog out of schema.prisma temporarily
pnpm prisma migrate diff --from-empty --to-schema ./schema.prisma --script > no_moodlog.sql
# Restore MoodLog, then:
pnpm prisma migrate diff --from-empty --to-schema ./schema.prisma --script > with_moodlog.sql
# delta = with_moodlog.sql - no_moodlog.sql
```

(Use a diff tool — `git diff --no-index no_moodlog.sql with_moodlog.sql > delta.sql` works.)

### 7.2 Create the new migration folder

```powershell
New-Item -ItemType Directory -Path "packages\prisma\migrations\<YYYYMMDDHHMMSS>_<short_name>"
```

Timestamp convention: `YYYYMMDDHHMMSS` in UTC. Name in `lower_snake_case`.

### 7.3 Commit migration.sql

Write the delta SQL into `<folder>/migration.sql`. Do **not** edit any existing migration folder.

### 7.4 Commit + push + PR

```powershell
git checkout -b story/E<X>-S<YY>-<description> develop
git add packages\prisma\migrations\<new-folder>\
git commit -m "chore(prisma): <one-line summary>"
git push -u origin HEAD
gh pr create --base develop --title "..." --body-file <body.md>
```

PR must target `develop` (per `CONTRIBUTING.md:109`), even if the underlying change will deploy to Neon `main`.

### 7.5 Apply the migration

```powershell
cd apps\api
pnpm prisma migrate deploy
pnpm prisma migrate status    # expect: "Database schema is up to date"
pnpm prisma generate
```

### 7.6 Resolve drift with `migrate resolve` (Path A.3 — for timestamp-only drift)

If `schema.prisma` and the migration history are correct, but the DB has an orphan migration record with a different timestamp (e.g., `20260622152724_init` in DB vs `20260623175910_init` in git):

```powershell
# Mark the DB's orphan init as "rolled back" — does NOT touch tables, only edits _prisma_migrations
pnpm prisma migrate resolve --rolled-back 20260622152724_init

# Mark the git-canonical init as applied
pnpm prisma migrate resolve --applied 20260623175910_init

# Now apply any new pending migrations
pnpm prisma migrate deploy
```

`migrate resolve` is **non-destructive to tables** — it only edits the `_prisma_migrations` tracking table. Safe.

**Pre-condition:** the SQL of the git-canonical init must actually match what's in the DB. If it doesn't, use Path B or C.

---

## 8. Path B — Write a corrective migration

Use when the DB has things the schema doesn't, and the drift is small/clear.

1. Compare the live DB schema (`prisma db pull --print`) to `schema.prisma` and identify the extras.
2. Decide: are the extras *stale* (should be removed) or *forward-compatible* (should be in the schema)?
3. If **stale**: write a migration that drops them. Test the migration in a local Neon branch first.
4. If **forward-compatible**: update `schema.prisma` to match, and write a no-op migration that documents the reconciliation.
5. Apply with `migrate deploy` (not `migrate dev` — never use `dev` on a shared DB).

---

## 9. Path C — Nuke and pave (catastrophic only)

Use when the DB is in an unknown state, was seeded from a now-rolled-back branch, or the cumulative drift is too large to repair surgically. **This destroys all data on the target Neon branch.**

### 9.1 Pre-flight (mandatory)

All of §5, plus:
- [ ] **All other interns confirmed their migration work is committed to git** (you will delete their Neon personal branches).
- [ ] **`develop` Neon branch (used by CI per `docs/neon-setup.md:65`) is re-created after the wipe**, and the `CI_DATABASE_URL` GitHub secret is updated to its new connection string.

### 9.2 Pick a wipe method

**Method 3a — `DROP SCHEMA` in place (preserves connection string):**
- Connect via Neon SQL editor and run:
  ```sql
  DROP SCHEMA public CASCADE;
  CREATE SCHEMA public;
  GRANT ALL ON SCHEMA public TO <your_neon_user>;
  ```
- Pro: `DATABASE_URL` doesn't change, CI doesn't break.
- Con: irreversible, bypasses Neon's branch UI.

**Method 3b — Delete & recreate the branch in Neon UI:**
- Neon dashboard → Branches → `<branch>` → Delete → confirm.
- Create a new branch named `<branch>` from any parent.
- Pro: clean "this is a new branch" state.
- Con: new connection string, **must update** `CI_DATABASE_URL` secret and every dev's local `.env`.

### 9.3 Collapse migrations to a single `init` (if going for max simplicity)

```powershell
# Snapshot current state
git checkout -b story/E<X>-S<YY>-<description> develop
git add -A packages\prisma\
git commit -m "chore(prisma): snapshot before reset"

# Delete old migrations (keep migration_lock.toml)
Remove-Item -Recurse packages\prisma\migrations\2026*

# Generate new init from current schema
cd packages\prisma
pnpm prisma migrate diff --from-empty --to-schema ./schema.prisma --script
# Paste output into: packages\prisma\migrations\<timestamp>_init\migration.sql
```

### 9.4 Apply to Neon

```powershell
cd apps\api
pnpm prisma migrate deploy
pnpm prisma migrate status    # expect: "Database schema is up to date"
pnpm prisma generate
```

### 9.5 Re-seed (optional)

```powershell
cd ..\..\packages\prisma
pnpm exec tsx seed.ts
```

### 9.6 Post-hand-off

Post in team chat:
- "Neon `<branch>` reset and synced. Recreate your personal branches off `<branch>` per `docs/neon-setup.md:22`."
- "If you used Method 3b: the connection string changed. Get the new one from the SR and update your local `.env` and the `CI_DATABASE_URL` GitHub secret."

---

## 10. Post-sync verification (any path)

Run all of these to confirm the sync worked:

```powershell
cd apps\api

# 1. Prisma is happy
pnpm prisma migrate status    # expect: "Database schema is up to date"

# 2. Live DB matches schema.prisma
pnpm prisma migrate diff --from-url "$env:DATABASE_URL" --to-schema ..\..\packages\prisma\schema.prisma --script
# Expect: empty output or `SELECT 1;`

# 3. Prisma client regenerates cleanly
pnpm prisma generate

# 4. TypeScript still compiles
pnpm tsc --noEmit

# 5. Vitest still passes (uses the real DB via CI_DATABASE_URL)
pnpm vitest run
```

If any step fails, do **not** merge. Re-diagnose using §3 — the delta you applied may not match what the DB actually needs.

---

## 11. Common error patterns and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| `prisma migrate diff` errors with `--from-schema-datamodel` was removed | Prisma 7 renamed the flag | Use `--from-schema` / `--to-schema` (see §6) |
| `prisma migrate diff --from-migrations` errors with "you must set `datasource.shadowDatabaseUrl`" | Prisma 7 needs a shadow DB for migrations diff | Use `--from-empty` + compare to full schema, OR add `shadowDatabaseUrl` to `prisma.config.ts` |
| `migrate deploy` fails with `relation "X" already exists` | The DB has the table from a prior seed/revert; the migration is trying to recreate it | `pnpm prisma migrate resolve --applied <migration_name>`, then re-run `migrate deploy` |
| `migrate deploy` fails with `drift detected` | Local migration history doesn't match `_prisma_migrations` | Re-run §3 diagnosis, then either `migrate resolve` (Path A.3) or wipe (Path C) |
| `prisma db pull` produces a schema wildly different from `schema.prisma` | The DB is from a much older or newer branch state | Path C — confirm with SR before nuking |
| `psql`/`pg_dump` not found | PostgreSQL client not installed | Use the Neon dashboard SQL editor (it supports the same queries) |
| `migrate status` says "up to date" but the app fails with `column does not exist` | DB was hand-edited or seeded from a different branch | `prisma db pull` to see actual state, then Path B or C |
| Neon free-tier branch limit reached | Too many personal branches in the shared workspace | Follow `docs/neon-setup.md:46` cleanup protocol |

---

## 12. Prevention — how to avoid drift in the first place

- **Always commit new migrations in the same PR that changes `schema.prisma`.** Don't let them drift.
- **Never edit a migration folder after it has been merged to `develop`.** Write a follow-up migration instead.
- **Never run `prisma migrate dev` against the shared `develop` Neon branch.** Use a personal branch per `docs/neon-setup.md:22`.
- **Never hand-edit the `_prisma_migrations` table from SQL.** Use `prisma migrate resolve` (it's audited and reversible).
- **If you `git reset --hard` a branch that had a `migrate deploy` applied, the DB will be ahead of git.** Re-apply or use `migrate resolve --applied` to reconcile.
- **SR review:** per `CONTRIBUTING.md:213`, "Never edit `packages/prisma/schema.prisma` without first checking with the Senior Engineer." This is the single biggest drift-prevention control.

---

## 13. References

- `docs/neon-setup.md` — Neon workspace topology, free-tier limits, branch cleanup
- `docs/branching.md` — Branch naming and merge flow
- `CONTRIBUTING.md:91` — Always branch from `develop`
- `CONTRIBUTING.md:109` — PRs target `develop`, not `main`
- `CONTRIBUTING.md:213-215` — Prisma change rules
- `packages/prisma/schema.prisma` — current source-of-truth schema
- [Prisma 7 migrate diff docs](https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-diff)
- [Prisma 7 migrate resolve docs](https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-resolve)
