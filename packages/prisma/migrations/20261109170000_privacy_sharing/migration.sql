-- Privacy and sharing (Step 6).
--
-- Three additive changes, no existing row is rewritten:
--
-- 1. `JournalEntry` gains the same per-item share triple `WorksheetResponse`
--    and `TreasureNote` already carry. Until now a journal entry had no share
--    state at all, which is why it could not be shared without inventing a
--    second rule for it.
-- 2. `Homework` gains `last_completed_at`. A repeating assignment stays
--    `active` after the client does it, is hidden for the rest of that IST day,
--    and comes back on its next due day; only a one-off assignment closes.
-- 3. `HomeworkCompletion` records each "done" tap, so a repeating assignment
--    keeps a history rather than overwriting one timestamp. It carries no
--    client text: the assignment holds the therapist's words.
--
-- Defaults are the load-bearing part: `shared_with_therapist` defaults false,
-- so every existing journal entry is Private the moment this lands. Nothing is
-- backfilled and nothing starts shared.

ALTER TABLE "JournalEntry"
    ADD COLUMN "shared_with_therapist" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "shared_at" TIMESTAMP(3),
    ADD COLUMN "unshared_at" TIMESTAMP(3);

CREATE INDEX "JournalEntry_user_id_shared_with_therapist_idx" ON "JournalEntry"("user_id", "shared_with_therapist");

ALTER TABLE "Homework"
    ADD COLUMN "last_completed_at" TIMESTAMP(3);

CREATE INDEX "Homework_client_user_id_last_completed_at_idx" ON "Homework"("client_user_id", "last_completed_at");

CREATE TABLE "HomeworkCompletion" (
    "id" TEXT NOT NULL,
    "homework_id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'client',
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeworkCompletion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HomeworkCompletion_homework_id_completed_at_idx" ON "HomeworkCompletion"("homework_id", "completed_at" DESC);
CREATE INDEX "HomeworkCompletion_client_user_id_completed_at_idx" ON "HomeworkCompletion"("client_user_id", "completed_at" DESC);

ALTER TABLE "HomeworkCompletion"
    ADD CONSTRAINT "HomeworkCompletion_homework_id_fkey"
    FOREIGN KEY ("homework_id") REFERENCES "Homework"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HomeworkCompletion"
    ADD CONSTRAINT "HomeworkCompletion_client_user_id_fkey"
    FOREIGN KEY ("client_user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
