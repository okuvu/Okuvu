-- Therapist-portal wireframes, Phase 1: client status lifecycle
-- (Pending/Active/Ended, derived from these timestamps — see
-- TherapistClient's doc comments) and the "Request chat access" mechanism.
ALTER TABLE "TherapistClient" ADD COLUMN "chat_access_requested_at" TIMESTAMP(3);
ALTER TABLE "TherapistClient" ADD COLUMN "activated_at" TIMESTAMP(3);
ALTER TABLE "TherapistClient" ADD COLUMN "ended_at" TIMESTAMP(3);
