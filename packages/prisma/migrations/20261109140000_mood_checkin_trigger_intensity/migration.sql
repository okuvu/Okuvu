-- The approved document adds two screens after the existing mood check-in:
-- "What was happening just before you felt this?" and "How strong is this
-- feeling right now?" (0-10).
--
-- The daily mood value stays 1-5 and is untouched. The intensity is 0-10 and
-- is stored separately, because the demanding-worksheet gate reads 0-10 and
-- mixing the two scales is exactly how a safety gate ends up wrong.

ALTER TABLE "MoodLog" ADD COLUMN "trigger_text" TEXT;
ALTER TABLE "MoodLog" ADD COLUMN "intensity_0_10" INTEGER;

ALTER TABLE "MoodLog" ADD CONSTRAINT "MoodLog_intensity_range"
    CHECK ("intensity_0_10" IS NULL OR ("intensity_0_10" >= 0 AND "intensity_0_10" <= 10));
