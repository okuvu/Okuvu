-- Care plan labels for the sixteen worksheets that shipped before the labels
-- existed.
--
-- Owner's instruction, 26 Nov 2026: the sixteen original worksheets must carry
-- their care plan labels on a live system that has already run the old setup
-- file — without changing anything else about them.
--
-- Why a new migration and not an edit of the seed: the seed migration
-- (`20261109130000_seed_library_worksheets`) was edited in place to carry
-- `care_plans`, but an applied migration never re-runs. Every deployed database
-- applied the OLD bytes of that seed, which knew nothing about the column, and
-- then applied `20261124090000_worksheet_care_plans_and_sensitive_check`, which
-- adds the column with `DEFAULT '{}'` and backfills nothing. On those databases
-- all sixteen rows read as "not decided" — and the catalogue, the tests and a
-- freshly built database all look correct, because a fresh database runs the
-- edited seed. This file is the only path that reaches them.
--
-- Scope, deliberately:
--   • only `care_plans` is written. No label, status, sort order, body, approved
--     date or updated_at is touched — a row's other columns are what the owner
--     sees if he checks one of these sixteen, and this migration is not allowed
--     to move them.
--   • only rows whose `care_plans` is still empty are updated. A database that
--     already carries the labels (one built from the empty chain) is unchanged,
--     and a row someone labelled on purpose is never overwritten.
--   • keyed on `tool_id`, the natural key, so the statement does not depend on
--     the row ids the seed generator happens to emit.
--
-- The labels are the owner's, in his spelling, and match
-- `packages/shared-types/worksheets/*` and the eleven that are NOT in this file
-- (the Stress & Burnout, Anxiety & Worry and Low Mood batches) were seeded with
-- their labels in their own migrations.

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['anxiety_worry']::TEXT[]
 WHERE "tool_id" = 'ws_worry_tree' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['anxiety_worry']::TEXT[]
 WHERE "tool_id" = 'ws_thinking_trap' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['anxiety_worry', 'low_mood']::TEXT[]
 WHERE "tool_id" = 'ws_thought_record' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['low_mood']::TEXT[]
 WHERE "tool_id" = 'ws_small_things' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['low_mood']::TEXT[]
 WHERE "tool_id" = 'ws_three_good_things' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['low_mood']::TEXT[]
 WHERE "tool_id" = 'ws_kind_friend_letter' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['low_mood']::TEXT[]
 WHERE "tool_id" = 'ws_values_compass' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['stress_burnout']::TEXT[]
 WHERE "tool_id" = 'ws_energy_audit' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['stress_burnout']::TEXT[]
 WHERE "tool_id" = 'ws_hard_conversation' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['all']::TEXT[]
 WHERE "tool_id" = 'mood_checkin' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['all']::TEXT[]
 WHERE "tool_id" = 'ws_name_the_feeling' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['all']::TEXT[]
 WHERE "tool_id" = 'breathing' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['all']::TEXT[]
 WHERE "tool_id" = 'grounding_5431' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['all']::TEXT[]
 WHERE "tool_id" = 'ws_bring_to_session' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['all']::TEXT[]
 WHERE "tool_id" = 'ws_post_session' AND "care_plans" = ARRAY[]::TEXT[];

UPDATE "ToolRegistryEntry" SET "care_plans" = ARRAY['all']::TEXT[]
 WHERE "tool_id" = 'ws_safety_plan' AND "care_plans" = ARRAY[]::TEXT[];
