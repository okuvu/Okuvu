-- TH-S39 — transcript emails for the human clinical review loop.
--
-- One row per persona conversation mailed to the clinical reviewer. The
-- conversation itself is already durable (TestRun rows per turn); this table
-- records the delivery: rendered subject/body, recipient, Gmail message id,
-- and outcome. A failed send is retried from this row instead of re-running
-- the conversation, which is the whole point of storing the body.
--
-- No foreign keys on purpose: a transcript email outlives the campaign row it
-- came from (campaigns are a view over runs; the email is a record of what a
-- clinician was actually shown).

CREATE TABLE "TranscriptEmail" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "group_id" TEXT,
    "persona_id" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "turn_count" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider_message_id" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranscriptEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TranscriptEmail_group_id_idx" ON "TranscriptEmail"("group_id");
CREATE INDEX "TranscriptEmail_status_created_at_idx" ON "TranscriptEmail"("status", "created_at");
