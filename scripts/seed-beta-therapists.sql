-- Seed the three beta therapist accounts into the portal's sign-in allowlist.
--
-- E16-S3. Cognito proves *who* the person is; this table decides whether that
-- identity may enter the portal at all (apps/therapist-portal/src/lib/auth.ts,
-- signIn callback). A therapist with a valid Cognito login and no row here is
-- rejected with /auth?error=unauthorized — which is the correct behaviour, but
-- it means a freshly provisioned pool has nobody who can actually get in.
--
-- Idempotent: re-running is a no-op for rows that already exist, and fills in a
-- name only where the row has none. Safe to run against production.
--
-- Run it from inside the VPC (RDS is not publicly accessible):
--   bash scripts/in-vpc-db-task.sh --sql-file scripts/seed-beta-therapists.sql
--
-- Single statement on purpose: scripts/in-vpc-db-task.sh prints result.rows, so
-- a multi-statement script would return `undefined`.

INSERT INTO "Therapist" (id, email, name, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'ananya.rao@okuvu.in',  'Dr. Ananya Rao',  now(), now()),
  (gen_random_uuid()::text, 'priya.nair@okuvu.in',  'Dr. Priya Nair',  now(), now()),
  (gen_random_uuid()::text, 'rohan.mehta@okuvu.in', 'Dr. Rohan Mehta', now(), now())
ON CONFLICT (email) DO UPDATE
  SET name = COALESCE("Therapist".name, EXCLUDED.name)
  WHERE "Therapist".name IS NULL
RETURNING email, id, name, created_at;
