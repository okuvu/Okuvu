-- Step 8 — finding and assigning exercises in the portal.
--
-- Three additive pieces. Nothing is backfilled and no existing row changes
-- meaning.
--
-- 1. `Homework.therapist_private_note` — the therapist's own line about an
--    assignment, never shown to the client. Nullable, so every existing
--    assignment simply has none.
-- 2. `ClientGoal` — the working goals an assignment can be linked to. The
--    clinical reasoning note is free text, so goals are their own rows: a
--    select needs something to list, and an assignment must still say what it
--    served after the goal wording is edited. `text` is stored on the goal and
--    copied into `Homework.therapy_goal` at assign time for that reason.
-- 3. `ExerciseSet` / `ExerciseSetItem` — a therapist's named set of approved
--    exercises, assignable in one go. Scoped to `therapist_id`: no row is
--    visible to another therapist, and there is deliberately no client column,
--    because a set is a saved shortcut, not a plan for a person.

ALTER TABLE "Homework"
    ADD COLUMN "therapist_private_note" TEXT;

CREATE TABLE "ClientGoal" (
    "id" TEXT NOT NULL,
    "therapist_id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientGoal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientGoal_therapist_id_client_user_id_status_idx"
    ON "ClientGoal"("therapist_id", "client_user_id", "status");

ALTER TABLE "ClientGoal" ADD CONSTRAINT "ClientGoal_therapist_id_fkey"
    FOREIGN KEY ("therapist_id") REFERENCES "Therapist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientGoal" ADD CONSTRAINT "ClientGoal_client_user_id_fkey"
    FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ExerciseSet" (
    "id" TEXT NOT NULL,
    "therapist_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseSet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExerciseSet_therapist_id_created_at_idx"
    ON "ExerciseSet"("therapist_id", "created_at" DESC);

ALTER TABLE "ExerciseSet" ADD CONSTRAINT "ExerciseSet_therapist_id_fkey"
    FOREIGN KEY ("therapist_id") REFERENCES "Therapist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ExerciseSetItem" (
    "id" TEXT NOT NULL,
    "set_id" TEXT NOT NULL,
    "tool_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExerciseSetItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExerciseSetItem_set_id_tool_id_key"
    ON "ExerciseSetItem"("set_id", "tool_id");

CREATE INDEX "ExerciseSetItem_set_id_sort_order_idx"
    ON "ExerciseSetItem"("set_id", "sort_order");

ALTER TABLE "ExerciseSetItem" ADD CONSTRAINT "ExerciseSetItem_set_id_fkey"
    FOREIGN KEY ("set_id") REFERENCES "ExerciseSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExerciseSetItem" ADD CONSTRAINT "ExerciseSetItem_tool_id_fkey"
    FOREIGN KEY ("tool_id") REFERENCES "ToolRegistryEntry"("tool_id") ON DELETE RESTRICT ON UPDATE CASCADE;
