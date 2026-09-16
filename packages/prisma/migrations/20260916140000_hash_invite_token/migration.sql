-- InviteToken previously stored the plaintext invite code at rest. Hashing
-- is one-directional, so existing rows' plaintext codes can't be converted
-- to a hash after the fact. This feature shipped less than 24 hours before
-- this migration (20260915140000) and every code has a 7-day expiry, so
-- clearing the (small, recent) existing rows and having therapists hit
-- "Resend" for any still-pending client is the correct, and only possible,
-- path here -- there is no data-preserving alternative once you've decided
-- plaintext-at-rest is the thing being fixed.
DELETE FROM "InviteToken";

DROP INDEX "InviteToken_token_key";

ALTER TABLE "InviteToken" DROP COLUMN "token",
                          ADD COLUMN "token_hash" TEXT NOT NULL;

CREATE UNIQUE INDEX "InviteToken_token_hash_key" ON "InviteToken"("token_hash");
