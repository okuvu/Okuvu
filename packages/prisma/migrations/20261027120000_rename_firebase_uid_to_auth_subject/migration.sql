-- The identity provider moved from Firebase Auth to Amazon Cognito.
-- The stored value is now a Cognito `sub` claim, not a Firebase uid, so the
-- column is renamed to describe what it holds rather than the vendor that
-- issued it. Data is preserved in place: existing rows keep their identifier
-- and are re-linked on first sign-in with the new provider.

ALTER TABLE "User" RENAME COLUMN "firebase_uid" TO "auth_subject";
ALTER INDEX "User_firebase_uid_key" RENAME TO "User_auth_subject_key";
