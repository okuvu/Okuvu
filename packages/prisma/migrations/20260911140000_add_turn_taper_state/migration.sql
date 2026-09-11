-- OKUVU v2.0 (okuvu-remaining-changes.md §B.2): persist A2's S-07
-- taper_state/closure_offered signal instead of silently discarding it.

-- AlterTable
ALTER TABLE "Turn" ADD COLUMN "taper_state" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Turn" ADD COLUMN "closure_offered" BOOLEAN NOT NULL DEFAULT false;
