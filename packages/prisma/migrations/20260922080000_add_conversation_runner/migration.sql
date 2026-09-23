-- OKUVU — Simulated-Conversation Runner Spec v1.1, TH-S32: persona bank on
-- CorpusCase. A type='persona' case may carry its ordered seed script
-- (turns) and its persona library metadata (persona_meta) as nullable Json —
-- non-persona cases and pre-existing rows keep NULL (backfill-free, same
-- convention as the B2 identity columns).

ALTER TABLE "CorpusCase" ADD COLUMN "turns" JSONB,
                     ADD COLUMN "persona_meta" JSONB;

-- TH-S37: the ConversationRun grouping row for a simulated-conversation
-- batch — N sessions × M turns of one synthetic persona across a planned
-- gap schedule, driven by the /api/run-batch tick (TH-S35). Append-only
-- except the tick loop's mutable resume fields (status/next_step/cost).
CREATE TABLE "ConversationRun" (
    "id" TEXT NOT NULL,
    "environment" "TestEnvironment" NOT NULL,
    "persona_case_id" TEXT NOT NULL,
    "persona_id" TEXT NOT NULL,
    "persona_version" TEXT NOT NULL,
    "model" TEXT,
    "prompt_version" TEXT,
    "scheduler_mode" TEXT NOT NULL DEFAULT 'story-time',
    "gap_plan_ms" INTEGER[] NOT NULL,
    "turns_min" INTEGER NOT NULL,
    "turns_max" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "cost_ceiling_usd" DOUBLE PRECISION NOT NULL,
    "cost_estimates_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "next_step" JSONB,
    "sessions" JSONB NOT NULL DEFAULT '[]',
    "run_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "idempotency_key" TEXT NOT NULL,
    "cost_so_far_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "canned" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationRun_idempotency_key_key" ON "ConversationRun"("idempotency_key");
CREATE INDEX "ConversationRun_environment_created_at_idx" ON "ConversationRun"("environment", "created_at" DESC);
CREATE INDEX "ConversationRun_persona_case_id_idx" ON "ConversationRun"("persona_case_id");
CREATE INDEX "ConversationRun_status_idx" ON "ConversationRun"("status");

-- TH-S33/S34: per-run persona/simulator/session telemetry on TestRun —
-- nullable, populated only by the simulated-conversation runner.
ALTER TABLE "TestRun" ADD COLUMN "persona_id" TEXT,
                     ADD COLUMN "persona_version" TEXT,
                     ADD COLUMN "simulator_model" TEXT,
                     ADD COLUMN "session_index" INTEGER,
                     ADD COLUMN "turn_in_session" INTEGER,
                     ADD COLUMN "gap_before_ms" INTEGER;
