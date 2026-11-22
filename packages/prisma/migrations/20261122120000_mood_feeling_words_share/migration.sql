-- The mood check-in gets faces, feeling words, a strength slider and a
-- per-check-in share (owner's instruction, 22 Nov 2026).
--
-- `mood_value` stays 1-5 and is untouched: every check-in written before this
-- change keeps its meaning, and the faces (Awful / Low / Okay / Good / Great)
-- are a rendering of that value rather than a second scale. The strength the
-- client slides is 1-5 as well, and is deliberately NOT the 0-10
-- `intensity_0_10` column beside it — that one still belongs to the two screens
-- the approved document added, and to the demanding-worksheet gate.
--
-- `shared_with_therapist` defaults to false, so every existing check-in becomes
-- private when this lands. Nothing is backfilled: a check-in is shared only when
-- the client turns its own switch on.

ALTER TABLE "MoodLog" ADD COLUMN "feeling_words" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MoodLog" ADD COLUMN "feeling_other" TEXT;
ALTER TABLE "MoodLog" ADD COLUMN "strength_1_5" INTEGER;

ALTER TABLE "MoodLog" ADD COLUMN "shared_with_therapist" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MoodLog" ADD COLUMN "shared_at" TIMESTAMP(3);
ALTER TABLE "MoodLog" ADD COLUMN "unshared_at" TIMESTAMP(3);

-- The strength is 1-5 or absent. A wrong-scale write fails loudly rather than
-- storing a value no reader expects.
ALTER TABLE "MoodLog" ADD CONSTRAINT "MoodLog_strength_range"
    CHECK ("strength_1_5" IS NULL OR ("strength_1_5" >= 1 AND "strength_1_5" <= 5));

-- At most three words, as the screen allows. The api enforces the vocabulary;
-- this is the backstop against a row no screen could have produced.
ALTER TABLE "MoodLog" ADD CONSTRAINT "MoodLog_feeling_words_max"
    CHECK (array_length("feeling_words", 1) IS NULL OR array_length("feeling_words", 1) <= 3);

-- The therapist's only read path: shared check-ins for one client, newest
-- first. Private rows are never in the result, so the index matches the query.
CREATE INDEX "MoodLog_user_id_shared_with_therapist_date_ist_idx"
    ON "MoodLog"("user_id", "shared_with_therapist", "date_ist" DESC);
