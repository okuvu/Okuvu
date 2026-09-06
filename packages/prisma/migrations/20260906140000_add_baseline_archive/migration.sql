-- CreateTable
CREATE TABLE "BaselineArchive" (
    "id" TEXT NOT NULL,
    "environment" "TestEnvironment" NOT NULL,
    "label" TEXT NOT NULL,
    "run_ids" TEXT[],
    "pinned_by" TEXT NOT NULL,
    "pinned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaselineArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BaselineArchive_environment_label_pinned_at_idx" ON "BaselineArchive"("environment", "label", "pinned_at" DESC);
