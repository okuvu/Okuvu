-- OKUVU v2.0 (okuvu-remaining-changes.md §E.2): optional per-case pipeline
-- context fields, mirroring apps/api's TestModeOptions inject* fields, so
-- a corpus case can exercise A2 under a specific language mode / homework /
-- toolkit / therapist-name context instead of always hitting defaults.

-- AlterTable
ALTER TABLE "CorpusCase" ADD COLUMN "language_mode" TEXT;
ALTER TABLE "CorpusCase" ADD COLUMN "homework_context" TEXT;
ALTER TABLE "CorpusCase" ADD COLUMN "toolkit" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CorpusCase" ADD COLUMN "therapist_name" TEXT;
