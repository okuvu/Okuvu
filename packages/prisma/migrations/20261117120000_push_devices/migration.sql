-- Push notifications — the delivery half of the Updates inbox.
--
-- 1. `DeviceToken` is the address book. One row per handset install, deduped on
--    the FCM token rather than the user: a reinstall mints a new token and the
--    old one dies, and two accounts on one shared phone must not both receive
--    the first account's alerts. `onDelete: Cascade` so closing an account takes
--    its push addresses with it — an erased client must stop buzzing.
--
-- 2. Two switches, deliberately separate. `push_notifications_enabled` gates
--    therapist sends (homework, reminders, session changes);
--    `broadcast_push_enabled` gates admin broadcasts (service news, greetings).
--    One switch for both would let a chatty broadcast teach a client to turn the
--    app off, and then they miss the therapist.
--
-- 3. `last_broadcast_at` is the daily cap's record for the broadcast class,
--    written before the fan-out so two campaigns in one IST day cannot buzz the
--    same phone twice. It mirrors `last_update_email_at` and covers only the
--    broadcast class — never a therapist's send.
--
-- Defaults are true so nothing changes for a client who has never opened
-- Settings, and the in-app Updates list does not read either switch.

ALTER TABLE "User"
    ADD COLUMN "push_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "broadcast_push_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "last_broadcast_at" TIMESTAMP(3);

CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");
CREATE INDEX "DeviceToken_user_id_idx" ON "DeviceToken"("user_id");

ALTER TABLE "DeviceToken"
    ADD CONSTRAINT "DeviceToken_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
