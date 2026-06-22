# Neon Local Database Setup

This guide gets you from zero to a working local PostgreSQL database in about 10 minutes, without needing GCP credentials or Cloud SQL Proxy.

**Why Neon instead of Cloud SQL?** Cloud SQL Proxy setup historically takes 1.5–2 hours per developer and is a common source of early debugging time lost to infrastructure. Neon is PostgreSQL-compatible, free for development use, and creates a working database connection in about 2 minutes.

---

## Step 1 — Create a Neon account

1. Go to [neon.tech](https://neon.tech) and sign up (free, no credit card required)
2. Create a new project — name it `evia-dev`
3. Note the **connection string** shown after project creation — you'll need it in Step 3

---

## Step 2 — Create your personal development branch

Neon has a branching feature similar to Git. Each developer gets their own branch so your migrations and test data don't interfere with others.

1. In the Neon dashboard, go to your `evia-dev` project
2. Click **Branches** → **New Branch**
3. Name your branch: `yourname-dev` (e.g. `priya-dev`, `arjun-dev`)
4. Branch **from**: `main` (the shared schema baseline — always branch from `main`, not from another developer's branch)
5. Click **Create Branch**

Your branch gets its own connection string. Copy it — you need it in the next step.

**Important:** Your personal Neon branch is your local development database. You work on it across all story branches — you don't create a new Neon branch per git story branch.

---

## Step 3 — Configure your local .env

```bash
# From the repo root
cp .env.example .env
```

Open `.env` and set `DATABASE_URL` to your Neon branch connection string:

```bash
DATABASE_URL="postgresql://[user]:[password]@[your-neon-host]/evia?sslmode=require"
```

The connection string comes from Neon's dashboard → your branch → **Connection Details** → copy the **Connection string** (Prisma format).

Also set:
```bash
LOCAL_DEV_BYPASS_AUTH="true"
```

This lets you make API calls without a real Firebase token during local development. Make sure this is never set to `true` in any cloud environment.

---

## Step 4 — Run the first migration

Once the Prisma schema exists (after E0-S03 is merged to `develop`), run:

```bash
cd apps/api
npx prisma migrate dev
```

This creates all the tables in your Neon branch. If E0-S03 hasn't landed yet, this step will fail — wait for it.

---

## Step 5 — Verify the connection

```bash
cd apps/api
npx prisma studio
```

This opens a browser-based GUI for your Neon database at `http://localhost:5555`. If you can see the tables, the connection is working correctly.

---

## Keeping Your Branch Up to Date

When new migrations land in `develop` and you pull them to your local git branch, run:

```bash
cd apps/api
npx prisma migrate dev
```

This applies any new migrations to your Neon branch. You don't need to manually sync your Neon branch with the `main` Neon branch — Prisma migrations handle this.

---

## Resetting Your Branch

If your local database gets into a bad state (e.g. from a failed migration or test data corruption):

**Option 1 — Reset migrations locally (keeps your Neon branch):**
```bash
cd apps/api
npx prisma migrate reset
# This drops all tables and re-runs all migrations from scratch
# Your Neon branch data is lost, but the schema is clean
```

**Option 2 — Delete and recreate your Neon branch:**
1. In Neon dashboard → Branches → your branch → Delete
2. Create a new branch from `main` with the same name
3. Update `DATABASE_URL` in your `.env` with the new connection string
4. Run `npx prisma migrate dev` again

Option 2 is slower but gives you a completely fresh database.

---

## Troubleshooting

**"Connection refused" or "ECONNREFUSED"**
- Check that `DATABASE_URL` in your `.env` is exactly the Neon connection string (not a placeholder)
- Make sure `sslmode=require` is at the end of the URL

**"SSL connection required"**
- Add `?sslmode=require` to the end of your DATABASE_URL if it's missing

**"Migration failed"**
- Run `npx prisma migrate reset` to start fresh, then `npx prisma migrate dev` again
- If the migration itself has an error, check with the Senior Engineer — don't try to manually patch the database

**"Cannot find module '@prisma/client'"**
- Run `npm install` from the repo root
- Then `cd apps/api && npx prisma generate` to regenerate the Prisma client

**Neon branch is slow or timing out**
- Neon's free tier has a compute budget. If your branch is idle for a while, the first connection takes a few seconds to wake it up. This is normal — the second connection will be fast.

---

## CI Database (develop Neon branch)

The CI pipeline (GitHub Actions) runs against a `develop` Neon branch maintained by the Senior Engineer. You don't interact with this branch directly — it exists only for CI. When your PR's CI run passes, it means your migrations and tests work against the shared `develop` schema state.

If CI fails with a database error on your PR but your local tests pass, tell the Senior Engineer — it likely means the `develop` Neon branch needs to have migrations re-applied.

---

## Staging and Production

| Environment | Database |
|---|---|
| Local dev | Neon (your personal branch) |
| CI | Neon (`develop` branch) |
| Staging (evia-beta) | Cloud SQL PostgreSQL (asia-south1) |
| Production (evia-production) | Cloud SQL PostgreSQL Multi-zone (asia-south1) |

Staging and production databases are managed by the Senior Engineer. You never connect directly to Cloud SQL from your local machine.
