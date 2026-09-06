-- AlterTable
ALTER TABLE "CorpusCase" ADD COLUMN "seed_id" TEXT;
ALTER TABLE "CorpusCase" ADD COLUMN "adjudication_required" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "CorpusCase_seed_id_idx" ON "CorpusCase"("seed_id");
