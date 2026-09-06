-- CreateTable
CREATE TABLE "ClinicalAccessLog" (
    "id" TEXT NOT NULL,
    "therapist_id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalAccessLog_client_user_id_created_at_idx" ON "ClinicalAccessLog"("client_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ClinicalAccessLog_therapist_id_created_at_idx" ON "ClinicalAccessLog"("therapist_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "ClinicalAccessLog" ADD CONSTRAINT "ClinicalAccessLog_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "Therapist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAccessLog" ADD CONSTRAINT "ClinicalAccessLog_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
