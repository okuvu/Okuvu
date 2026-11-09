-- The safety recheck queue.
--
-- Owner's rule (9 Nov 2026): a failed or slow safety check is MODERATE CONCERN —
-- never safe, never crisis. The write is saved, the client is offered help, no
-- therapist alert fires, and this row is the promise that the text is screened
-- again once the classifier answers. Only that recheck can raise an alert.
--
-- Additive only: one new table, no existing table or row changes.
--
-- Why pointers and not text: `subject_kind` + `subject_id` name the journal
-- entry, worksheet response or Treasure note that could not be screened; the
-- sweep re-reads that row. Copying the text here would create a second store of
-- private writing with none of the first store's erasure path. The cascade
-- below is what guarantees an erasure request cannot leave unscreened text
-- referenced by this queue.
--
-- `abandoned_at` is kept rather than deleted on give-up: "we never managed to
-- screen this" is a fact an operator needs to be able to query afterwards.

CREATE TABLE "SafetyRecheck" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "subject_kind" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abandoned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyRecheck_pkey" PRIMARY KEY ("id")
);

-- One queue row per write: a retried save cannot enqueue the same row twice and
-- make one outage look like two.
CREATE UNIQUE INDEX "SafetyRecheck_subject_kind_subject_id_key" ON "SafetyRecheck"("subject_kind", "subject_id");
CREATE INDEX "SafetyRecheck_next_attempt_at_idx" ON "SafetyRecheck"("next_attempt_at");
CREATE INDEX "SafetyRecheck_user_id_created_at_idx" ON "SafetyRecheck"("user_id", "created_at");

ALTER TABLE "SafetyRecheck"
    ADD CONSTRAINT "SafetyRecheck_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
