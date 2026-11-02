-- Portal P0 — safety plumbing.
--
-- Four changes, all prerequisites for the redesigned Dashboard/Overview:
--   1. SafetyFlag: a per-event, timestamped, acknowledgable S3/S4 record.
--      SafetyState is current-state only (one row per user, overwritten every
--      turn), so a flag history cannot be served from it.
--   2. TherapistClient.client_label: the therapist's own name for a client.
--      Backfilled from User.full_name here, then made NOT NULL.
--   3. Chat access requires client approval: the 30-day window is measured
--      from chat_access_granted_at, so a request nobody answered opens nothing.
--      Every window that existed under the old ask-only rule is closed below.
--   4. The two-sided 18+ attestation, plus the registration → tester-access →
--      invite handover timestamps.
--
-- No backfill of SafetyFlag from AuditEvent, by decision: flags start at this
-- migration's date, and history before it stays in the audit chain.

-- CreateEnum
CREATE TYPE "SafetyFlagLevel" AS ENUM ('S3', 'S4');

-- ── 1. SafetyFlag ───────────────────────────────────────────────────────
CREATE TABLE "SafetyFlag" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "level" "SafetyFlagLevel" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "crisis_screen_shown" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "session_id" TEXT,
    "turn_id" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_therapist_id" TEXT,

    CONSTRAINT "SafetyFlag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SafetyFlag_user_id_occurred_at_idx" ON "SafetyFlag"("user_id", "occurred_at");
CREATE INDEX "SafetyFlag_user_id_acknowledged_at_idx" ON "SafetyFlag"("user_id", "acknowledged_at");
-- One flag per turn: a retried insert after a timeout must not count the same
-- crisis twice. Postgres treats multiple NULLs as distinct, so a flag written
-- without a turn id is still allowed.
CREATE UNIQUE INDEX "SafetyFlag_turn_id_key" ON "SafetyFlag"("turn_id");

ALTER TABLE "SafetyFlag" ADD CONSTRAINT "SafetyFlag_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. Client identity + attestations + invite handover ─────────────────
-- client_label is added nullable, backfilled, then tightened — a NOT NULL
-- column added to a populated table with no default fails the deploy.
ALTER TABLE "User"
  ADD COLUMN "age_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "age_declined_at" TIMESTAMP(3),
  ALTER COLUMN "phone_number" DROP NOT NULL;

ALTER TABLE "TherapistClient"
  ADD COLUMN "client_label" TEXT,
  ADD COLUMN "age_confirmed_by_therapist_at" TIMESTAMP(3),
  ADD COLUMN "age_confirmed_by_therapist_id" TEXT,
  ADD COLUMN "tester_access_added_at" TIMESTAMP(3),
  ADD COLUMN "invite_sent_at" TIMESTAMP(3),
  ADD COLUMN "chat_access_granted_at" TIMESTAMP(3),
  ADD COLUMN "chat_access_closed_at" TIMESTAMP(3);

-- Backfill: the therapist's existing record of the client's name, then the
-- local part of the sign-in address, then a neutral fallback. Never the id —
-- "User #E7D8" is the label this whole change removes.
UPDATE "TherapistClient" tc
SET "client_label" = COALESCE(
  NULLIF(BTRIM(u."full_name"), ''),
  NULLIF(SPLIT_PART(u."email", '@', 1), ''),
  'Client'
)
FROM "User" u
WHERE u."id" = tc."client_user_id";

UPDATE "TherapistClient" SET "client_label" = 'Client' WHERE "client_label" IS NULL;

ALTER TABLE "TherapistClient" ALTER COLUMN "client_label" SET NOT NULL;

-- ── 3. Close every chat window that was opened by an ask alone ──────────
-- Under the old rule the read window keyed on chat_access_requested_at and
-- ignored the client's grant entirely. Those windows are consent bugs, not
-- features: close them here rather than leaving them readable for up to 30
-- more days. chat_access_granted_at is deliberately NOT backfilled — a
-- pre-existing grant was never a window under the old rule, so treating it
-- as one now would hand out access no client re-approved.
UPDATE "TherapistClient"
SET "chat_access_closed_at" = NOW()
WHERE "chat_access_requested_at" IS NOT NULL
  AND "chat_access_closed_at" IS NULL;

-- Count of windows closed by the statement above, for the PR description and
-- the merge run on dev RDS:
--   SELECT COUNT(*) FROM "TherapistClient" WHERE "chat_access_closed_at" IS NOT NULL;
