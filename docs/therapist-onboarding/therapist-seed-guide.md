# Therapist Seed Guide

Before walkthroughs can begin, each participating therapist must have an account
in the `therapist` database table. This is the allowlist mechanism inherited from
E10-S01 — only seeded emails can sign in to the therapist portal.

## Prerequisites

- Access to a local or development database
- `DATABASE_URL` configured in `.env`
- Dependencies installed (`pnpm install`)

## Seed a single therapist

```bash
cd apps/therapist-portal
npx tsx src/scripts/seed-therapist.ts therapist@example.com
```

This upserts a therapist record by email. If the email already exists, it's a no-op.

## Verify the therapist was seeded

```bash
# Connect to your database and check:
SELECT id, email, created_at FROM "Therapist" WHERE email = 'therapist@example.com';
```

## Seed multiple therapists (batch)

Use the batch script to seed several therapists in a single command:

```bash
cd apps/therapist-portal
npx tsx src/scripts/seed-therapists-batch.ts \
  therapist1@example.com \
  therapist2@example.com \
  therapist3@example.com
```

Or pipe from a file (one email per line):

```bash
npx tsx src/scripts/seed-therapists-batch.ts $(cat emails.txt)
```

## Seed the beta therapists in production

`evia-beta-postgres` is not publicly accessible, so `DATABASE_URL` cannot be
pointed at it from a laptop — the batch script above only works against a local
or otherwise reachable database. For production, run the idempotent SQL through
the in-VPC runner (`scripts/in-vpc-db-task.sh`), which composes `DATABASE_URL`
from the `${NAME_PREFIX}/database` secret inside a one-off ECS task:

```bash
bash scripts/in-vpc-db-task.sh --sql-file scripts/seed-beta-therapists.sql
```

`scripts/seed-beta-therapists.sql` seeds exactly the three beta accounts
(`ananya.rao@okuvu.in`, `priya.nair@okuvu.in`, `rohan.mehta@okuvu.in`) and is
safe to re-run: existing rows are left alone (`ON CONFLICT (email) DO UPDATE`
only fills in a missing `name`). It prints the rows it wrote.

Skipping this step is the classic failure: Cognito accepts the password, the
hosted UI redirects back with a code, the code exchange succeeds, and NextAuth
still answers `/auth?error=unauthorized` because the email is not in the table.

## How auth works

Sign-in is Amazon Cognito only: the therapist pool (`evia-beta-therapists`)
with email as the username, reached through the portal's NextAuth Cognito
provider (authorization-code flow). The legacy Firebase phone-OTP and Google
OAuth paths are gone; see
[cognito-provisioning.md](./cognito-provisioning.md) for how accounts and
passwords are created.

Two gates must both pass:

1. **Cognito** — a confirmed user in the therapist pool (`/auth` redirects to
   the pool's hosted domain; there is no local login form).
2. **`Therapist` table** — the `signIn` callback in
   `apps/therapist-portal/src/lib/auth.ts` looks the email up; an account
   absent here is rejected with `?error=unauthorized`.

No separate allowlist configuration file exists. Presence in the `Therapist`
table is the gate.

## Before a walkthrough

1. Confirm the therapist's email
2. Run the seed script
3. Ask the therapist to sign in and confirm they can access the portal
4. If sign-in fails, check that the email matches exactly (case-insensitive query is NOT used)
