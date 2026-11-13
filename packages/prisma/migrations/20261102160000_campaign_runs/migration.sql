-- TH-S38 — the /campaign screen: operator-created batches of simulated
-- conversations, one ConversationRun group per persona.
--
-- Why a table rather than a naming convention on ConversationRun: a campaign
-- result is only worth reading if it is attributable to the conditions that
-- produced it. The plan (sessions, turn range, gaps, seed), the persona
-- snapshot, the judge setting and the ceiling are frozen on this row at start,
-- so editing a persona or a parameter afterwards cannot silently rewrite what a
-- past result meant. The alternative — deriving a "campaign" from an
-- idempotency_key prefix — carries no label, no judge flag and no creator.
--
-- `prompt_versions` is deliberately absent: the harness records prompt/model
-- provenance per run (TestRun.frozen_triple + run identity header), and a
-- second copy here would be a stamp that drifts.

-- ── 1. The campaign row ──────────────────────────────────────────────────
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "environment" "TestEnvironment" NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'in-process',
    "personas" JSONB NOT NULL,
    "sessions" INTEGER NOT NULL,
    "turns_min" INTEGER NOT NULL,
    "turns_max" INTEGER NOT NULL,
    "gap_plan_ms" INTEGER[] NOT NULL,
    "scheduler_mode" TEXT NOT NULL DEFAULT 'story-time',
    "seed" INTEGER NOT NULL,
    "language_mode" TEXT NOT NULL DEFAULT 'english',
    "judge_enabled" BOOLEAN NOT NULL DEFAULT true,
    "cost_ceiling_usd" DOUBLE PRECISION NOT NULL,
    "cost_estimates_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "planned_turns" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Campaign_environment_created_at_idx"
    ON "Campaign"("environment", "created_at" DESC);

-- ── 2. The link from a run group, and the judge's verdict ────────────────
-- ON DELETE SET NULL, not CASCADE: deleting a campaign must never delete the
-- TestRun evidence underneath it. The groups survive as ordinary run-batch
-- groups; only the grouping is lost.
ALTER TABLE "ConversationRun" ADD COLUMN "campaign_id" TEXT;
ALTER TABLE "ConversationRun" ADD COLUMN "incomplete_reason" TEXT;
ALTER TABLE "ConversationRun" ADD COLUMN "judge_verdicts" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX "ConversationRun_campaign_id_idx" ON "ConversationRun"("campaign_id");

ALTER TABLE "ConversationRun"
    ADD CONSTRAINT "ConversationRun_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "Campaign"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
