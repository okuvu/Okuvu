-- Worry time and the exposure ladder (owner's brief, 24 November 2026).
--
-- Two features that are more than a worksheet body: worry time needs a parked
-- list that survives between sessions and a daily reminder to look at it, and
-- the exposure ladder is built by the therapist, step by step, with each step
-- unlocked deliberately.
--
-- Additive only. No existing table is altered, and nothing here touches a row
-- a client already has.
--
-- `time_ist` is "HH:MM" in the client's own day; the CHECK is what stops a typo
-- saving a time no sender will ever match. `difficulty` and the two run ratings
-- are 0-100, the owner's scale for the ladder, and the CHECKs are the only thing
-- between a bad write and a number nobody can interpret.
--
-- Neither feature carries content text in a flag or a log: a parked worry and a
-- ladder label are the client's own words and live only on their own rows.

CREATE TABLE "WorryTimeSetting" (
    "user_id" TEXT NOT NULL,
    "time_ist" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_reminded_on" DATE,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorryTimeSetting_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "WorryTimeSetting"
    ADD CONSTRAINT "WorryTimeSetting_time_ist_check"
    CHECK ("time_ist" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "WorryTimeSetting"
    ADD CONSTRAINT "WorryTimeSetting_minutes_check"
    CHECK ("minutes" >= 5 AND "minutes" <= 60);

ALTER TABLE "WorryTimeSetting"
    ADD CONSTRAINT "WorryTimeSetting_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorryParked" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'parked',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "WorryParked_pkey" PRIMARY KEY ("id")
);

-- The client's own review answer, not a score: parked / still bothering / not
-- anymore. A fourth value would be a typo no reader would ever match.
ALTER TABLE "WorryParked"
    ADD CONSTRAINT "WorryParked_status_check"
    CHECK ("status" IN ('parked', 'still', 'released'));

CREATE INDEX "WorryParked_user_id_status_created_at_idx"
    ON "WorryParked"("user_id", "status", "created_at");

ALTER TABLE "WorryParked"
    ADD CONSTRAINT "WorryParked_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ExposureStep" (
    "id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "tool_id" TEXT NOT NULL DEFAULT 'ws_exposure_ladder',
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "unlocked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExposureStep_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ExposureStep"
    ADD CONSTRAINT "ExposureStep_difficulty_check"
    CHECK ("difficulty" >= 0 AND "difficulty" <= 100);

ALTER TABLE "ExposureStep"
    ADD CONSTRAINT "ExposureStep_position_check"
    CHECK ("position" >= 0);

CREATE INDEX "ExposureStep_client_user_id_position_idx"
    ON "ExposureStep"("client_user_id", "position");

ALTER TABLE "ExposureStep"
    ADD CONSTRAINT "ExposureStep_client_user_id_fkey"
    FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ExposureStepRun" (
    "id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "before" INTEGER NOT NULL,
    "after" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExposureStepRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ExposureStepRun"
    ADD CONSTRAINT "ExposureStepRun_before_check"
    CHECK ("before" >= 0 AND "before" <= 100);

ALTER TABLE "ExposureStepRun"
    ADD CONSTRAINT "ExposureStepRun_after_check"
    CHECK ("after" IS NULL OR ("after" >= 0 AND "after" <= 100));

CREATE INDEX "ExposureStepRun_step_id_created_at_idx"
    ON "ExposureStepRun"("step_id", "created_at");

CREATE INDEX "ExposureStepRun_client_user_id_created_at_idx"
    ON "ExposureStepRun"("client_user_id", "created_at");

ALTER TABLE "ExposureStepRun"
    ADD CONSTRAINT "ExposureStepRun_step_id_fkey"
    FOREIGN KEY ("step_id") REFERENCES "ExposureStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExposureStepRun"
    ADD CONSTRAINT "ExposureStepRun_client_user_id_fkey"
    FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A parked worry is a fourth client-typed surface that can carry a crisis, so a
-- SafetyFlag written from it identifies itself as `worry_parked`. The CHECK is
-- widened rather than dropped: a typo in a subject kind still fails loudly, and
-- the flag continues to carry a pointer and never the text.
ALTER TABLE "SafetyFlag" DROP CONSTRAINT IF EXISTS "SafetyFlag_subject_kind_check";
ALTER TABLE "SafetyFlag"
    ADD CONSTRAINT "SafetyFlag_subject_kind_check"
    CHECK (
        "subject_kind" IS NULL
        OR "subject_kind" IN ('journal_entry', 'worksheet_response', 'treasure_note', 'worry_parked')
    );
