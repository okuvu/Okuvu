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

## How auth works

The therapist portal uses two auth paths:

1. **Google OAuth** (primary) — therapist signs in with Google, the portal checks
   `prisma.therapist.findUnique({ where: { email } })`. If found, sign-in succeeds.
   If not found, sign-in is rejected with "unauthorized."
2. **Phone OTP** (fallback) — therapist enters their phone number, receives an OTP.
   Auth is handled by Firebase, and the therapist must still exist in the DB.

No separate allowlist configuration file exists. Presence in the `Therapist` table
is the gate.

## Before a walkthrough

1. Confirm the therapist's email
2. Run the seed script
3. Ask the therapist to sign in and confirm they can access the portal
4. If sign-in fails, check that the email matches exactly (case-insensitive query is NOT used)
