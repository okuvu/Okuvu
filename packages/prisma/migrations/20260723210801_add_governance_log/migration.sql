-- AlterTable
ALTER TABLE "Turn" ADD COLUMN "is_a9_fallback" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GovernanceLog" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "gate" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "violation_type" TEXT,
    "confidence" TEXT NOT NULL,
    "blocked_content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovernanceLog_pkey" PRIMARY KEY ("id")
);
