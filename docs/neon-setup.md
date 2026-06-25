# Local Database Setup via Neon

**⚠️ SECURITY NOTICE: LOCAL DEVELOPMENT ONLY**
This database environment is strictly for local development. **Never** insert real user data, PII, or sensitive health information into these databases. Use only synthetic/mock data. **Never** commit your `DATABASE_URL` to version control.

> **Operational model:** We use a shared team workspace (`evia-dev`) rather than individual Neon accounts. This keeps free-tier branch limits manageable and simplifies credential management during the MVP. Interns do not need to create their own Neon account — the Senior Engineer will add you to the workspace.

## Overview
We use [Neon](https://neon.tech/) to provide zero-friction local Postgres databases via branching. This eliminates the need for local Docker containers or complex Cloud SQL Proxy setups.

## Step-by-Step Guide (Est. Time: 5 mins)

### 1. Access the Project & Account Setup
1. Go to [Neon.tech](https://neon.tech/) and log in (or create a free account if you don't have one).
2. Ask the Senior Engineer for an invite to the shared `evia-dev` workspace if you don't already have access.
3. Navigate to the **evia-dev** project.

### 2. Create Your Personal Branch
*To isolate your work, you will create a personal branch off the main schema.*
1. On the left sidebar, click **Branches**.
2. Click the **New Branch** button.
3. **CRITICAL:** Ensure the **Parent branch** is set to `main`. Do not branch off another intern's branch.
4. Name your branch using the convention: `<yourname>-dev` (e.g., `ishaan-dev`).
5. Click **Create branch**.

### 3. Connect to Your Database
1. Copy the `.env.example` file to create your local `.env` file:
   `cp .env.example .env`
2. In Neon, once your branch is created, a "Connection Details" modal will appear.
3. Select **Prisma** from the connection snippet dropdown.
4. Check the **"Show password"** box.
5. Copy the entire `DATABASE_URL="postgresql://..."` string.
6. Paste this directly into your local `.env` file.

You are now ready for E0-S03's migration step.
### 4. Verify the Connection (Optional)
If you want to confirm the database is reachable before E0-S03's migration step:
```bash
psql "$DATABASE_URL" -c "SELECT 1;"
# Expected: " ?column?  --- 1"
## Troubleshooting & Cleanup

### Free Tier Cleanup Protocol
Neon's free tier is limited to **10 concurrent branches**. To stay under this limit:
- Keep only your personal branch (`<yourname>-dev`) and avoid creating extra ad-hoc branches.
- Once a feature is merged to `main` and you no longer need your personal branch for active development, delete it via the Neon dashboard to free up a slot.
- If you hit the branch limit during normal work, look for stale or unused branches in the dashboard and delete them.

### Corrupted Branch / Resetting
If your branch becomes corrupted or your schema gets out of sync, simply recreate it:
1. In the Neon dashboard, delete your personal branch.
2. Create a fresh branch from `main` using the same name (`<yourname>-dev`).
3. Copy the new `DATABASE_URL` and update your `.env` file.
4. Once E0-S03 has landed, run `cd apps/api && pnpm prisma migrate dev` to re-apply the schema.

### Common Issues

| Symptom | Likely Cause | Fix |
|---|---|---|
| `ECONNREFUSED` when connecting | Wrong `DATABASE_URL` or branch was deleted | Double-check your `.env` and verify the branch exists in the Neon dashboard |
| `sslmode` or TLS errors | Missing `sslmode=require` in connection string | Neon requires SSL — ensure your `DATABASE_URL` includes `?sslmode=require`; the Prisma snippet from the dashboard includes it by default |
| "Branch limit reached" in Neon | Too many branches on the free tier | Follow the Cleanup Protocol above to remove stale branches |

CI Database (develop Neon branch)
CI runs against a develop Neon branch maintained by the Senior Engineer. You don't interact with this branch directly — it exists only for CI.
Environment Overview
Environment	Database	Managed By
Local dev	Neon (your personal branch)	You
CI	Neon (develop branch)	Senior Engineer
Staging (evia-500215)	Cloud SQL PostgreSQL	Senior Engineer
Production (evia-production)	Cloud SQL PostgreSQL Multi-zone	Senior Engineer
