-- Copy revision v1 §13 — the landing page's waitlist form split into two:
-- a client asking for a place, and a therapist asking for a walkthrough.
--
-- The therapist's answers land in nullable columns so the split needs no
-- backfill: every existing row is a client row, which is exactly what
-- `kind`'s default says. Nothing is dropped and nothing is renamed, so the
-- previous deploy keeps working against this schema.

ALTER TABLE "WaitlistEntry"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'client',
  ADD COLUMN "name" TEXT,
  ADD COLUMN "organisation" TEXT,
  ADD COLUMN "caseload" TEXT,
  ADD COLUMN "has_therapist" BOOLEAN;
