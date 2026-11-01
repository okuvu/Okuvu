-- Seed a client User row for Rajwant so Google sign-in has an account to link
-- to. Mirrors what the therapist-portal Add-Client wizard creates: a
-- placeholder row with the email the client will sign in with and
-- auth_subject still NULL, so resolveGoogleAccount() takes the "linked" path
-- and binds the Google subject on first sign-in.
--
-- Idempotent: fixed id, ON CONFLICT DO NOTHING.
BEGIN;

INSERT INTO "User"
  (id, phone_number, email, full_name, created_at, updated_at, auth_subject)
VALUES
  ('c0a1b2c3-d4e5-4f60-8a9b-0c1d2e3f4a5b',
   '+919999000001',
   'rajwant@suvoksystem.com',
   'Rajwant',
   now(),
   now(),
   NULL)
ON CONFLICT (id) DO NOTHING;

COMMIT;

SELECT id, email, phone_number, auth_subject, deleted_at
FROM "User"
WHERE lower(email) = lower('rajwant@suvoksystem.com');
