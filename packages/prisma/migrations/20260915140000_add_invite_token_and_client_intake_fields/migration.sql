-- Therapist-portal wireframes, Phase 3: Add-Client wizard + invite.

-- firebase_uid becomes nullable: the wizard creates a placeholder User
-- row before the client has ever opened the app (every prior User was
-- mobile-signup-first, where this was always known immediately).
-- Postgres treats multiple NULLs as distinct under a UNIQUE constraint,
-- so this does not weaken uniqueness for rows that do have one.
ALTER TABLE "User" ALTER COLUMN "firebase_uid" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "full_name" TEXT;
ALTER TABLE "User" ADD COLUMN "date_of_birth" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "gender" TEXT;

ALTER TABLE "ClinicalConfig" ADD COLUMN "presenting_issues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ClinicalConfig" ADD COLUMN "welcome_note" TEXT;
ALTER TABLE "ClinicalConfig" ADD COLUMN "display_abbreviation" TEXT;

CREATE TABLE "InviteToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "therapist_id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "redeemed_at" TIMESTAMP(3),

    CONSTRAINT "InviteToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InviteToken_token_key" ON "InviteToken"("token");
CREATE INDEX "InviteToken_client_user_id_idx" ON "InviteToken"("client_user_id");

ALTER TABLE "InviteToken" ADD CONSTRAINT "InviteToken_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "Therapist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InviteToken" ADD CONSTRAINT "InviteToken_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
