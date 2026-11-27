-- Widen the access_mode CHECK so the therapist-only worksheet can exist.
--
-- The Exposure ladder (owner's approval, 24 Nov 2026) is `therapist_only`: built
-- by the therapist in the portal, never a Library card, never assignable, never
-- offered by chat. The column has carried a CHECK since 2026-11-09 that allows
-- only 'open', 'assigned' and 'in_session', and nothing widened it — so the
-- migration that inserts the ladder (20261124200000_seed_anxiety_worry_drafts)
-- and the one that approves it (20261124220000_approve_anxiety_worry_nine) both
-- fail on a production-shaped database with
--   23514 new row for relation "ToolRegistryEntry" violates check constraint
--         "ToolRegistryEntry_access_mode_check"
--
-- `schema.prisma` models `access_mode` as a bare `String`, and the api suites
-- build their database with `prisma db push`, which creates the column with no
-- constraint at all — so every test passes while `migrate deploy` dies. A local
-- rehearsal against a restored copy of production is the only thing that
-- surfaces this class, which is why it is a release gate.
--
-- The CHECK is widened rather than dropped: a typo in access_mode still fails
-- loudly, and the three values that were already legal keep their meaning
-- exactly. This migration changes no row — it only teaches the column one more
-- permitted value, so it is safe to run ahead of the inserts that need it.

ALTER TABLE "ToolRegistryEntry"
    DROP CONSTRAINT IF EXISTS "ToolRegistryEntry_access_mode_check";

ALTER TABLE "ToolRegistryEntry"
    ADD CONSTRAINT "ToolRegistryEntry_access_mode_check"
    CHECK ("access_mode" IN ('open', 'assigned', 'in_session', 'therapist_only'));
