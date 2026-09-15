-- OKUVU mobile wireframe round 2, Phase 7: real Settings > Notifications.
-- Inert preference booleans — no push/FCM delivery exists yet.

ALTER TABLE "User" ADD COLUMN "appointment_reminders_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "chat_nudges_enabled" BOOLEAN NOT NULL DEFAULT true;
