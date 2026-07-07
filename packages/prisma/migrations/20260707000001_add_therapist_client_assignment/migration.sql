-- CreateTable
CREATE TABLE "TherapistClient" (
    "id" TEXT NOT NULL,
    "therapist_id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TherapistClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TherapistClient_therapist_id_client_user_id_key" ON "TherapistClient"("therapist_id", "client_user_id");

-- CreateIndex
CREATE INDEX "TherapistClient_client_user_id_idx" ON "TherapistClient"("client_user_id");

-- AddForeignKey
ALTER TABLE "TherapistClient" ADD CONSTRAINT "TherapistClient_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "Therapist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistClient" ADD CONSTRAINT "TherapistClient_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
