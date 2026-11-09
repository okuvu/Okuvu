-- The client's safety plan (worksheet 16, "My plan for hard moments") —
-- co-created during a session, written by the therapist, read by the client.
--
-- Additive only: one new table, no existing table or row changes.
--
-- Why a table of its own rather than a WorksheetResponse row:
--   WorksheetResponse is client-authored by design and carries NO therapist
--   column, because an unshared answer must be unreachable by a therapist
--   rather than filtered out of a list. A safety plan is the opposite shape —
--   the therapist authors it with the client and the client always reads it —
--   so expressing it there would mean adding a therapist column to every
--   worksheet answer and weakening that invariant for all of them.
--
-- Why the parts are not columns: the seven parts, their order and the client's
-- wording are the approved catalogue body (ToolRegistryEntry row
-- 'ws_safety_plan'), so a wording change is one row instead of one row per
-- client. `answers` is keyed by those field ids. The crisis numbers in part 5
-- are deliberately NOT stored: they are read from the central helpline list at
-- render time, so a number retired by clinical decision cannot survive inside
-- a plan written before it was retired.
--
-- One row per client (`user_id` unique): the plan is a living document that is
-- edited together, not a version history.

CREATE TABLE "SafetyPlan" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "therapist_contact" TEXT,
    "created_by_therapist_id" TEXT NOT NULL,
    "updated_by_therapist_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SafetyPlan_user_id_key" ON "SafetyPlan"("user_id");
CREATE INDEX "SafetyPlan_updated_at_idx" ON "SafetyPlan"("updated_at");

ALTER TABLE "SafetyPlan"
    ADD CONSTRAINT "SafetyPlan_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
