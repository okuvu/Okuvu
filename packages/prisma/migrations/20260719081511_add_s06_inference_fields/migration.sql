-- AlterTable
ALTER TABLE "ClinicalConfig" ADD COLUMN     "care_plan_review_flagged" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SessionLog" ADD COLUMN     "crisis_flag_detected" BOOLEAN NOT NULL DEFAULT false;
