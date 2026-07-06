-- CreateTable
CREATE TABLE "Therapist" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Therapist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Therapist_email_key" ON "Therapist"("email");

-- DropForeignKey
ALTER TABLE "TherapistNote" DROP CONSTRAINT "TherapistNote_therapist_id_fkey";

-- AddForeignKey
ALTER TABLE "TherapistNote" ADD CONSTRAINT "TherapistNote_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "Therapist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
