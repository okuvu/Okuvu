-- Step 7 — Updates list and emails.
--
-- 1. `Notification` gains `note_body` and `dedupe_key`.
--    `note_body` is a therapist's Treasure Box note held until the client taps
--    Keep; the approved Updates copy says only "Your therapist sent you
--    something for your Treasure Box", so the note text is stored here and read
--    later in the box, never on the row or on a lock screen.
--    `dedupe_key` makes the "something due today" row idempotent: it is derived
--    on read rather than written by an action, so without it every app open
--    would add another copy. Null for action-written rows, and a unique index
--    with NULLs allowed keeps those unaffected.
--
-- 2. `User` gains the email preference, the daily-cap record and the pause-link
--    token. `update_emails_enabled` defaults true, so nothing changes for a
--    client who has never opened Settings, and the in-app Updates list does not
--    read it at all — only the sender does.
--
-- 3. The four "Open when…" collections are renamed to the owner's approved
--    wording (9 Nov 2026). They are seeded per client on first open, so an
--    UPDATE by `system_key` is the only way a box created before this wording
--    arrived picks it up; a user-created collection has a null `system_key` and
--    is untouched.

ALTER TABLE "Notification"
    ADD COLUMN "note_body" TEXT,
    ADD COLUMN "dedupe_key" TEXT;

CREATE UNIQUE INDEX "Notification_dedupe_key_key" ON "Notification"("dedupe_key");

ALTER TABLE "User"
    ADD COLUMN "update_emails_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "last_update_email_at" TIMESTAMP(3),
    ADD COLUMN "email_update_token" TEXT;

CREATE UNIQUE INDEX "User_email_update_token_key" ON "User"("email_update_token");

UPDATE "TreasureCollection" SET "name" = 'Open when I’m anxious',    "updated_at" = CURRENT_TIMESTAMP WHERE "system_key" = 'anxious';
UPDATE "TreasureCollection" SET "name" = 'Open when I feel low',     "updated_at" = CURRENT_TIMESTAMP WHERE "system_key" = 'low';
UPDATE "TreasureCollection" SET "name" = 'Open when I’m overwhelmed',"updated_at" = CURRENT_TIMESTAMP WHERE "system_key" = 'overwhelmed';
UPDATE "TreasureCollection" SET "name" = 'Open when I need a win',   "updated_at" = CURRENT_TIMESTAMP WHERE "system_key" = 'win';
