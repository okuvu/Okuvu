-- Repair migration: the eleven test-harness / evaluation tables and the six
-- enums they use were created with `prisma db push` during development and were
-- never committed as migrations. `prisma migrate deploy` on a clean database
-- therefore failed at 20260906120000_add_test_run_canned_flag with
--   42P01 relation "TestRun" does not exist
-- This migration creates exactly those tables, immediately before the first
-- migration that references them, so the history applies cleanly from empty.
-- DDL is generated from schema.prisma, not hand-written.

-- CreateEnum
CREATE TYPE "TestEnvironment" AS ENUM ('sandbox', 'staging', 'beta');

-- CreateEnum
CREATE TYPE "TestRunStatus" AS ENUM ('running', 'pass', 'halt', 'warning', 'error', 'incomplete');

-- CreateEnum
CREATE TYPE "CorpusCaseType" AS ENUM ('safety', 'fidelity', 'adversarial', 'persona');

-- CreateEnum
CREATE TYPE "CorpusDataOrigin" AS ENUM ('synthetic', 'paraphrased', 'real');

-- CreateEnum
CREATE TYPE "HarnessRole" AS ENUM ('PI', 'RATER', 'ENGINEER');

-- CreateEnum
CREATE TYPE "GateDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ModelConfigPin" (
    "id" TEXT NOT NULL,
    "environment" "TestEnvironment" NOT NULL,
    "model_version" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'gemini',
    "prompt_hash" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "safety_settings" TEXT NOT NULL,
    "suite_version" TEXT NOT NULL,
    "pinned_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelConfigPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptRegistryEntry" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "environment" "TestEnvironment" NOT NULL,
    "supersedes_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptRegistryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL,
    "environment" "TestEnvironment" NOT NULL,
    "altitude" INTEGER NOT NULL,
    "agent" TEXT,
    "status" "TestRunStatus" NOT NULL,
    "frozen_triple" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "canned" BOOLEAN NOT NULL DEFAULT false,
    "build_sha" TEXT,
    "corpus_version" TEXT,
    "run_mode" TEXT,
    "persona_id" TEXT,
    "persona_version" TEXT,
    "simulator_model" TEXT,
    "session_index" INTEGER,
    "turn_in_session" INTEGER,
    "gap_before_ms" INTEGER,
    "activated_agents" TEXT[],
    "manually_selected_agents" TEXT[],
    "dependency_graph" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestResultRow" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "signals" JSONB NOT NULL,
    "mock_mode" BOOLEAN NOT NULL DEFAULT false,
    "status" "TestRunStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestResultRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorpusCase" (
    "id" TEXT NOT NULL,
    "type" "CorpusCaseType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "input" TEXT NOT NULL,
    "expected_output" TEXT,
    "tags" TEXT[],
    "supersedes_id" TEXT,
    "data_origin" "CorpusDataOrigin" NOT NULL DEFAULT 'synthetic',
    "seed_id" TEXT,
    "adjudication_required" BOOLEAN NOT NULL DEFAULT false,
    "language_mode" TEXT,
    "homework_context" TEXT,
    "toolkit" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "therapist_name" TEXT,
    "turns" JSONB,
    "persona_meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorpusCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlindedReviewItem" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "rubric_scores" JSONB NOT NULL,
    "rater_id" TEXT,
    "unblinded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlindedReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRating" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "rater_id" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestBudget" (
    "id" TEXT NOT NULL,
    "environment" "TestEnvironment" NOT NULL,
    "monthly_cap_inr" DOUBLE PRECISION NOT NULL,
    "spent_inr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reset_month" TEXT NOT NULL,

    CONSTRAINT "TestBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestHarnessAccess" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "HarnessRole" NOT NULL,
    "environments" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestHarnessAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateSignOff" (
    "id" TEXT NOT NULL,
    "gate" TEXT NOT NULL,
    "run_id" TEXT,
    "environment" "TestEnvironment" NOT NULL,
    "signed_by" TEXT NOT NULL,
    "decision" "GateDecision" NOT NULL,
    "evidence" TEXT,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateSignOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BetaConsent" (
    "id" TEXT NOT NULL,
    "corpus_case_id" TEXT,
    "user_ref" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "consent_granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "BetaConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModelConfigPin_environment_created_at_idx" ON "ModelConfigPin"("environment", "created_at" DESC);

-- CreateIndex
CREATE INDEX "PromptRegistryEntry_agent_id_environment_created_at_idx" ON "PromptRegistryEntry"("agent_id", "environment", "created_at" DESC);

-- CreateIndex
CREATE INDEX "TestRun_environment_created_at_idx" ON "TestRun"("environment", "created_at" DESC);

-- CreateIndex
CREATE INDEX "TestResultRow_run_id_idx" ON "TestResultRow"("run_id");

-- CreateIndex
CREATE INDEX "CorpusCase_type_created_at_idx" ON "CorpusCase"("type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "CorpusCase_seed_id_idx" ON "CorpusCase"("seed_id");

-- CreateIndex
CREATE INDEX "BlindedReviewItem_run_id_idx" ON "BlindedReviewItem"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRating_item_id_rater_id_key" ON "ReviewRating"("item_id", "rater_id");

-- CreateIndex
CREATE UNIQUE INDEX "TestBudget_environment_key" ON "TestBudget"("environment");

-- CreateIndex
CREATE UNIQUE INDEX "TestHarnessAccess_email_key" ON "TestHarnessAccess"("email");

-- CreateIndex
CREATE INDEX "GateSignOff_gate_environment_signed_at_idx" ON "GateSignOff"("gate", "environment", "signed_at" DESC);

-- CreateIndex
CREATE INDEX "BetaConsent_user_ref_idx" ON "BetaConsent"("user_ref");

-- AddForeignKey
ALTER TABLE "TestResultRow" ADD CONSTRAINT "TestResultRow_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "TestRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRating" ADD CONSTRAINT "ReviewRating_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "BlindedReviewItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
