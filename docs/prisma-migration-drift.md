# Prisma Migration Drift — Handling Guide

> **Last updated:** July 2026

---

## What Is Schema Drift?

Schema drift occurs when the Prisma schema in `packages/prisma/schema.prisma` disagrees with the actual database schema. This typically happens in one of three ways:

1. **Local-only schema changes** — You edited `schema.prisma` but haven't generated a migration yet
2. **Stale branch** — Your personal Neon branch is behind the migration history in `develop`
3. **Merge conflict** — Two story branches added migrations with the same timestamp prefix

---

## Detecting Drift

```bash
cd apps/api
pnpm prisma migrate status
```

This shows whether the database matches the migration history. A clean state looks like:

```
Datasource: postgresql
Database: <your-neon-branch>

Status: Database is up-to-date
```

If it says `Drift detected` or lists pending migrations, proceed below.

---

## How Drift Happens (Common Scenarios)

### Scenario 1: You changed `schema.prisma` but forgot to create a migration

```bash
pnpm prisma migrate dev --name add_mood_log
```

This generates a new migration file under `packages/prisma/migrations/`.

### Scenario 2: You rebased on `develop` which has new migrations

After rebasing:

```bash
pnpm prisma migrate dev
```

Prisma detects the new migration files and applies them to your local Neon branch.

### Scenario 3: Migration timestamp conflict

Two story branches both generated a migration with the same timestamp (e.g. `20260708120000_*.sql`). During rebase, only one can win. The fix:

1. Let the winning migration keep its timestamp
2. Rename the losing migration to use a later timestamp (e.g. `20260708120001_*.sql`)
3. Run `pnpm prisma migrate dev` to sync

---

## The Drift Resolution Workflow

### Step 1 — Identify what's out of sync

```bash
cd apps/api

# Compare schema.prisma with the database
pnpm prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma

# List migration status
pnpm prisma migrate status
```

### Step 2 — Resolve

| State | Action |
|---|---|
| Local schema ahead of database | `pnpm prisma migrate dev --name <descriptive_name>` |
| Database ahead of local schema (rebase) | `pnpm prisma migrate dev` (applies new migrations) |
| Migration file conflict (timestamp collision) | Rename one migration's directory, then `pnpm prisma migrate dev` |
| Corrupted migration state | Reset your Neon branch, then re-run all migrations |

### Step 3 — Verify

```bash
pnpm prisma migrate status
# Expected: "Database is up-to-date"
```

---

## Resetting Your Neon Branch

If drift becomes unresolvable (e.g. manually-edited migration files, partially-applied state):

1. **Delete** your personal branch in the Neon dashboard
2. **Re-create** it from `main` with the same name
3. Update your `.env` `DATABASE_URL` if the connection string changed
4. Run all migrations from scratch:

```bash
cd apps/api
pnpm prisma migrate dev
```

5. Seed if needed: `pnpm prisma db seed`

---

## Preventing Drift in Team Workflows

- **Always run migrations** before pushing a story branch for review
- **Rebase on `develop` daily** to pick up other team members' migrations early
- **Never edit a migration file** after it's been committed — create a new migration instead
- **PR reviewers should check** that new migrations are included when `schema.prisma` changed

---

## CI Drift Check

The CI pipeline for PRs targeting `develop` runs:

```bash
pnpm prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
```

If this exits non-zero, CI fails. This ensures no PR merges with unresolved drift.
