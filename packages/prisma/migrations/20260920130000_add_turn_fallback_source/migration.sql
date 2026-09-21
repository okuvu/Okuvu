-- OKUVU — Plumbing Fixes & Rationale v1.0, A4: record WHICH mechanism
-- produced a substitute reply on assistant turns (null when the content is
-- genuinely A2's model output). Nullable + backfill-free: all existing rows
-- predate the flag, and every legacy block path (a9_pre_blocked /
-- a9_post_blocked / a9_post_unavailable / deterministic_grounding /
-- a2_degraded) is still identifiable from is_a9_fallback / GovernanceLog
-- rows, so no existing row becomes wrong — there is no data-preserving
-- backfill to write.

ALTER TABLE "Turn" ADD COLUMN "fallback_source" TEXT;
