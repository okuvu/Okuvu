-- Seed a client User row for Shubhangi so Google sign-in has an account to link
-- to. Mirrors what the therapist-portal Add-Client wizard creates: a
-- placeholder row with the email the client will sign in with and
-- auth_subject still NULL, so resolveGoogleAccount() takes the "linked" path
-- and binds the Google subject on first sign-in.
--
-- Idempotent twice over: the WHERE NOT EXISTS guard stops a second row if that
-- address is already seeded under a different id, and the fixed id +
-- ON CONFLICT keeps re-running this file a no-op.
BEGIN;

INSERT INTO "User"
  (id, phone_number, email, full_name, created_at, updated_at, auth_subject)
SELECT
  'd1b2c3d4-e5f6-4a71-9b2c-3d4e5f6a7b8c',
  '+919****0002',
  'alphashubhangi@gmail.com',
  'Shubhangi Goswami',
  now(),
  now(),
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "User"
  WHERE lower(email) = lower('alphashubhangi@gmail.com')
    AND deleted_at IS NULL
);

COMMIT;

SELECT count(*) AS matches,
       bool_or(auth_subject IS NULL) AS linkable,
       bool_and(deleted_at IS NULL) AS live
FROM "User"
WHERE lower(email) = lower('alphashubhangi@gmail.com');
