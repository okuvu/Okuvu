-- Working goals: the therapist's own order, so "one at a time" has a next.
--
-- `ClientGoal` already existed as an unordered list that only a homework
-- assignment could point at. Therapy works through goals in a sequence the
-- therapist chooses, so the sequence has to be stored rather than inferred from
-- creation order: a goal written in the first session often belongs last.
--
-- Additive only. Every existing row keeps `position = 0` and the list falls
-- back to `created_at`, which is the order those rows were already read in —
-- but they are renumbered below so the backfilled rows do not all tie.

ALTER TABLE "ClientGoal"
    ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

UPDATE "ClientGoal" AS g
SET "position" = ordered.rn::int
FROM (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "therapist_id", "client_user_id"
            ORDER BY "created_at" ASC, "id" ASC
        ) - 1 AS rn
    FROM "ClientGoal"
) AS ordered
WHERE g."id" = ordered."id";
