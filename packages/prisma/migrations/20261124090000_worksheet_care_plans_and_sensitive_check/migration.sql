-- Owner's rules for worksheets, 24 Nov 2026 — the two catalogue columns the
-- rules need. Additive only; nothing is backfilled and no existing row changes
-- meaning.
--
-- 1. `care_plans` — which care plan(s) a worksheet belongs to (anxiety_worry,
--    low_mood, stress_burnout, or `all`). It changes the ORDER a client sees,
--    never a badge: the client is not sent a plan name. `DEFAULT '{}'` means
--    every row that existed before this migration is "not decided", which orders
--    exactly where it ordered before.
-- 2. `sensitive_check` — true when a worksheet must also run the deeper risk
--    screen (eating and the body, days without sleep, wanting not to wake up,
--    wanting to hurt someone, self-harm). `DEFAULT false` is the safe default:
--    a row inserted without an explicit answer gets the ordinary shared screen,
--    and can never silently claim the deeper one.
--
-- The same two statements are also emitted by the generated seed migration
-- (`20261109130000_seed_library_worksheets`), so a database built from the empty
-- chain has the columns before the seed runs. This file uses IF NOT EXISTS so it
-- is a no-op there and does the work on a database that already applied the
-- seed — which is every deployed environment.
--
-- The CHECK on `care_plans` is the only thing stopping a typo ('low-mood',
-- 'Low Mood') from saving a label no reader will ever match.

ALTER TABLE "ToolRegistryEntry"
    ADD COLUMN IF NOT EXISTS "care_plans" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ToolRegistryEntry"
    ADD COLUMN IF NOT EXISTS "sensitive_check" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ToolRegistryEntry" DROP CONSTRAINT IF EXISTS "ToolRegistryEntry_care_plans_check";
ALTER TABLE "ToolRegistryEntry" ADD CONSTRAINT "ToolRegistryEntry_care_plans_check"
    CHECK ("care_plans" <@ ARRAY['anxiety_worry', 'low_mood', 'stress_burnout', 'all']::TEXT[]);

-- No new index on purpose. The client Library read is already covered by
-- `ToolRegistryEntry_kind_status_section_idx`, and the plan ordering is computed
-- after the fetch (there are sixteen rows, not sixteen thousand). A GIN index
-- would also be drift from `schema.prisma`, which cannot express one.
