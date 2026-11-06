-- Client notifications: one row per client-facing event, read by the app's
-- bell / badge / inbox.
--
-- Why this table exists: homework, reminders and appointments were written by
-- the therapist portal and then sat in their own tables until the client
-- happened to open the app (GET /users/me/today). There was no record of "this
-- therapist action was announced to this client", so there was nothing for a
-- badge to count, nothing for an inbox to list, and nothing for a future push
-- sender to hang off. This table is that record.
--
-- Additive only: no existing column or row changes. Nothing reads it yet at the
-- moment of this migration — the API route, the portal emitters and the app's
-- inbox ship in the same release, and a client on an older build simply never
-- calls the new route.
--
-- No backfill on purpose. Existing homework/reminders/appointments were never
-- announced, so inventing rows for them would show every client an inbox full
-- of "new" items the day they update, with timestamps they never saw arrive.
-- The inbox starts empty and fills from the next therapist action.

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "homework_id" TEXT,
    "appointment_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- Inbox read: one client, newest first.
CREATE INDEX "Notification_user_id_created_at_idx" ON "Notification"("user_id", "created_at" DESC);

-- Badge count: unread rows for one client.
CREATE INDEX "Notification_user_id_read_at_idx" ON "Notification"("user_id", "read_at");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
