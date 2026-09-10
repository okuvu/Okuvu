-- CreateEnum
CREATE TYPE "HomeworkStatus" AS ENUM ('active', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "LanguageMode" AS ENUM ('english', 'mirror');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "language_mode" "LanguageMode" NOT NULL DEFAULT 'english';

-- AlterTable
ALTER TABLE "ClinicalConfig" ADD COLUMN "care_plan_focus" TEXT;

-- AlterTable
ALTER TABLE "TherapistClient" ADD COLUMN "chat_access_granted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Homework" (
    "id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "therapist_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "HomeworkStatus" NOT NULL DEFAULT 'active',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Homework_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Homework_client_user_id_status_assigned_at_idx" ON "Homework"("client_user_id", "status", "assigned_at" DESC);

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "Therapist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "homework_id" TEXT,
    "schedule_note" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_user_id_active_idx" ON "Reminder"("user_id", "active");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "Homework"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ToolRegistryEntry" (
    "id" TEXT NOT NULL,
    "tool_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "chat_guidable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolRegistryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ToolRegistryEntry_tool_id_key" ON "ToolRegistryEntry"("tool_id");

-- CreateTable
CREATE TABLE "CrisisResource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrisisResource_pkey" PRIMARY KEY ("id")
);

-- Seed: only the 3 tool ids already live in apps/api/src/lib/tool-card.ts —
-- the full registry is pending clinical review (see model doc comment).
INSERT INTO "ToolRegistryEntry" ("id", "tool_id", "label", "chat_guidable") VALUES
    ('a1e6f8b2-0a4c-4b3e-9f1d-2c3d4e5f6001', 'grounding_5431', '5-4-3-2-1 Grounding', true),
    ('a1e6f8b2-0a4c-4b3e-9f1d-2c3d4e5f6002', 'guided_breathing', 'Guided Breathing', true),
    ('a1e6f8b2-0a4c-4b3e-9f1d-2c3d4e5f6003', 'box_breathing', 'Box Breathing', true);

-- Seed: only the 2 numbers A1's prompt and A9-post's helpline-integrity
-- check already treat as approved — does not resolve the mobile app's
-- separate 5-number crisis_overlay.dart (see model doc comment).
INSERT INTO "CrisisResource" ("id", "name", "phone", "order") VALUES
    ('b2f7a9c3-1b5d-4c4f-8e2a-3d4e5f6a7001', 'iCall', '9152987821', 0),
    ('b2f7a9c3-1b5d-4c4f-8e2a-3d4e5f6a7002', 'Vandrevala Foundation', '1860-2662-345', 1);
