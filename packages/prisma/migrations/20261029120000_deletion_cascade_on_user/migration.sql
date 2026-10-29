-- E16-S10 — make every child of "User" die with the subject.
--
-- Every FK to "User" was created with the Prisma default for a required
-- relation (ON DELETE RESTRICT, confdeltype = 'r'), so `DELETE FROM "User"`
-- failed while any child row existed and the account-deletion path had to
-- enumerate tables by hand — which it did incompletely (see E16-S7 probe:
-- JournalEntry, TherapistNote, Homework, Reminder, Appointment,
-- ClinicalAccessLog, TherapistClient, UserMemory, InviteToken and
-- UserToolPreference were all left behind).
--
-- This migration is the relation-level half of the fix. The erasure path
-- (apps/api/src/lib/account.ts) still deletes those tables explicitly, in
-- order, inside one transaction, because the tombstone row is RETAINED
-- (deleted_at set) rather than deleted — a cascade only fires on a real
-- `DELETE FROM "User"`. Keeping both means a future code path that hard-deletes
-- the row can no longer leak a client's clinical record, and today's path
-- does not depend on this migration having been applied.
--
-- Generated with:
--   prisma migrate diff --from-schema <pre-change schema.prisma> \
--                       --to-schema packages/prisma/schema.prisma --script
-- No table rewrite: DROP/ADD CONSTRAINT only revalidates the (small) tables.
-- DROP ... IF EXISTS keeps the migration re-runnable if a name ever drifts.

-- DropForeignKey
ALTER TABLE "ClinicalConfig" DROP CONSTRAINT IF EXISTS "ClinicalConfig_user_id_fkey";
ALTER TABLE "SafetyState" DROP CONSTRAINT IF EXISTS "SafetyState_user_id_fkey";
ALTER TABLE "SessionLog" DROP CONSTRAINT IF EXISTS "SessionLog_user_id_fkey";
ALTER TABLE "Turn" DROP CONSTRAINT IF EXISTS "Turn_user_id_fkey";
ALTER TABLE "SessionSummary" DROP CONSTRAINT IF EXISTS "SessionSummary_user_id_fkey";
ALTER TABLE "EngagementProfile" DROP CONSTRAINT IF EXISTS "EngagementProfile_user_id_fkey";
ALTER TABLE "UserMemory" DROP CONSTRAINT IF EXISTS "UserMemory_user_id_fkey";
ALTER TABLE "TherapistNote" DROP CONSTRAINT IF EXISTS "TherapistNote_client_user_id_fkey";
ALTER TABLE "TherapistClient" DROP CONSTRAINT IF EXISTS "TherapistClient_client_user_id_fkey";
ALTER TABLE "Homework" DROP CONSTRAINT IF EXISTS "Homework_client_user_id_fkey";
ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_user_id_fkey";
ALTER TABLE "ClinicalAccessLog" DROP CONSTRAINT IF EXISTS "ClinicalAccessLog_client_user_id_fkey";
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_client_user_id_fkey";
ALTER TABLE "InviteToken" DROP CONSTRAINT IF EXISTS "InviteToken_client_user_id_fkey";
ALTER TABLE "EmergencyContact" DROP CONSTRAINT IF EXISTS "EmergencyContact_user_id_fkey";
ALTER TABLE "MoodLog" DROP CONSTRAINT IF EXISTS "MoodLog_user_id_fkey";
ALTER TABLE "JournalEntry" DROP CONSTRAINT IF EXISTS "JournalEntry_user_id_fkey";
ALTER TABLE "UserToolPreference" DROP CONSTRAINT IF EXISTS "UserToolPreference_user_id_fkey";

-- AddForeignKey
ALTER TABLE "ClinicalConfig" ADD CONSTRAINT "ClinicalConfig_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SafetyState" ADD CONSTRAINT "SafetyState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionSummary" ADD CONSTRAINT "SessionSummary_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngagementProfile" ADD CONSTRAINT "EngagementProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TherapistNote" ADD CONSTRAINT "TherapistNote_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TherapistClient" ADD CONSTRAINT "TherapistClient_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicalAccessLog" ADD CONSTRAINT "ClinicalAccessLog_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteToken" ADD CONSTRAINT "InviteToken_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoodLog" ADD CONSTRAINT "MoodLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserToolPreference" ADD CONSTRAINT "UserToolPreference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
