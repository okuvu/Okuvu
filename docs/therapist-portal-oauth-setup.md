# Therapist Portal — Unauthorized Login: Diagnosis & Fix

> **⚠️ SECURITY NOTICE:** The Google OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`) are for local development only. Never commit them.

---

## Overview

When signing into the therapist portal at `http://localhost:3000`, you may see:

> "Your Google account is not authorized to access this portal."

This means Google OAuth succeeded (your account is valid) but the portal's authorization check rejected it — your email is not in the `therapist` table.

---

## Root Cause

The portal uses NextAuth v4 with Google OAuth. In the `signIn` callback (`apps/therapist-portal/src/lib/auth.ts:22-40`), the portal queries the `therapist` table via Prisma. If your Google account email is not found in that table, the callback returns `'/auth?error=unauthorized'`, triggering the red error banner.

This is **not** a Google Cloud configuration issue — the OAuth handshake completes successfully. It is purely a database seeding issue.

---

## How We Identified It

The API terminal showed this log line:

```
[AUTH] Unauthorized sign-in attempt: your-email@gmail.com
```

This is emitted by `auth.ts:38` when the Prisma lookup returns `null`. Checking the `therapist` table directly confirmed the email was missing:

```bash
psql "$DATABASE_URL" -c "SELECT email FROM therapist;"
```

---

## Fix

Insert your Google account email into the `therapist` table:

```bash
psql "$DATABASE_URL" -c "
INSERT INTO therapist (id, email, name, created_at, updated_at)
VALUES (gen_random_uuid(), 'your-email@gmail.com', 'Your Name', NOW(), NOW());
"
```

Verify it took effect:

```bash
psql "$DATABASE_URL" -c "SELECT id, email, name FROM therapist;"
```

Sign out of the portal and sign back in — it should work.

---

## Preventing This in the Future

- If you're setting up a fresh database, run any seed scripts that populate the `therapist` table (or run the INSERT above as part of setup).
- If you switch to a different Neon branch (e.g., after a reset), remember to re-seed your therapist email — branches are independent copies and won't carry over your manual INSERT unless it was committed in a migration.
- If you use a different Google account, repeat the INSERT with the new email.

---

## Reference

- **NextAuth config:** `apps/therapist-portal/src/lib/auth.ts`
- **Therapist table schema:** `packages/prisma/schema.prisma`
- **Local database setup:** `docs/neon-setup.md`
