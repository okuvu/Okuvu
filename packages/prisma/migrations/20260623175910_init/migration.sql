-- CreateEnum
CREATE TYPE "CarePlan" AS ENUM ('CP1', 'CP2', 'CP3');

-- CreateEnum
CREATE TYPE "AssignmentState" AS ENUM ('provisional', 'confirmed');

-- CreateEnum
CREATE TYPE "SafetyStateEnum" AS ENUM ('S0', 'S1', 'S2', 'S3', 'S4');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('SD', 'TL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalConfig" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "care_plan_id" "CarePlan" NOT NULL,
    "assignment_state" "AssignmentState" NOT NULL DEFAULT 'provisional',
    "confidence_at_last_eval" DOUBLE PRECISION,
    "turns_evaluated" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClinicalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyState" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "safety_state_current" "SafetyStateEnum" NOT NULL,
    "safety_state_at_last_session_end" "SafetyStateEnum",
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionLog" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_ended_at" TIMESTAMP(3),
    "turn_count" INTEGER NOT NULL DEFAULT 0,
    "session_feedback_score" INTEGER,

    CONSTRAINT "SessionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSummary" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "summary_text" TEXT NOT NULL,
    "last_updated_turn" INTEGER NOT NULL,
    "last_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementProfile" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_session_date" TIMESTAMP(3),
    "voice_mode_enabled" BOOLEAN NOT NULL DEFAULT false,
    "consent_1" BOOLEAN NOT NULL DEFAULT false,
    "consent_2" BOOLEAN NOT NULL DEFAULT false,
    "consent_3" BOOLEAN NOT NULL DEFAULT false,
    "consent_4" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EngagementProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapistNote" (
    "id" TEXT NOT NULL,
    "therapist_id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "note_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TherapistNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionLimit" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tier" "Tier" NOT NULL,
    "date_ist" DATE NOT NULL,
    "sessions_used" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "encrypted_name" TEXT NOT NULL,
    "encrypted_phone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_firebase_uid_key" ON "User"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalConfig_user_id_key" ON "ClinicalConfig"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyState_user_id_key" ON "SafetyState"("user_id");

-- CreateIndex
CREATE INDEX "SessionLog_user_id_session_started_at_idx" ON "SessionLog"("user_id", "session_started_at" DESC);

-- CreateIndex
CREATE INDEX "SessionSummary_user_id_created_at_idx" ON "SessionSummary"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SessionSummary_user_id_session_id_key" ON "SessionSummary"("user_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementProfile_user_id_key" ON "EngagementProfile"("user_id");

-- CreateIndex
CREATE INDEX "TherapistNote_client_user_id_created_at_idx" ON "TherapistNote"("client_user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SessionLimit_user_id_date_ist_key" ON "SessionLimit"("user_id", "date_ist");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyContact_user_id_key" ON "EmergencyContact"("user_id");

-- AddForeignKey
ALTER TABLE "ClinicalConfig" ADD CONSTRAINT "ClinicalConfig_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyState" ADD CONSTRAINT "SafetyState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSummary" ADD CONSTRAINT "SessionSummary_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSummary" ADD CONSTRAINT "SessionSummary_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "SessionLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementProfile" ADD CONSTRAINT "EngagementProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistNote" ADD CONSTRAINT "TherapistNote_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistNote" ADD CONSTRAINT "TherapistNote_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLimit" ADD CONSTRAINT "SessionLimit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
