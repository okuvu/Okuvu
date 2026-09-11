-- OKUVU v2.0 (okuvu-remaining-changes.md §C.2): persist the remaining S-07
-- boolean fields A2 computes every turn (frustration_event/
-- homework_referenced/therapist_referral) instead of discarding them, same
-- as taper_state/closure_offered (§B.2).

-- AlterTable
ALTER TABLE "Turn" ADD COLUMN "frustration_event" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Turn" ADD COLUMN "homework_referenced" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Turn" ADD COLUMN "therapist_referral" BOOLEAN NOT NULL DEFAULT false;
