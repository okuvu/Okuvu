-- Mood and intensity become optional on a journal entry.
--
-- Journaling is the point; labelling the feeling is a helper. Until now the
-- Save button stayed disabled until a mood chip was picked, and the API
-- rejected a body without one — so a client who wanted to write and not name
-- a feeling could not save at all. Both columns are now nullable and only
-- `content` is required.
--
-- Dropping NOT NULL is additive in the direction that matters: rows written
-- before this migration keep their values, and a client on an older build
-- (which still sends both fields) is unaffected. Old builds CANNOT save a
-- mood-less entry — they never could — so the app and this migration ship in
-- the same release.
--
-- No backfill: a NULL here means "the client did not say", which is a real
-- answer and must not be guessed into 'other' / 1 — that would make a blank
-- indistinguishable from a deliberate "other, mildly".

ALTER TABLE "JournalEntry" ALTER COLUMN "emotion" DROP NOT NULL;
ALTER TABLE "JournalEntry" ALTER COLUMN "intensity" DROP NOT NULL;
