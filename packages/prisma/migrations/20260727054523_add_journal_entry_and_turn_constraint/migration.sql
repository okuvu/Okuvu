/*
  Warnings:

  - A unique constraint covering the columns `[session_id,turn_number,role]` on the table `Turn` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emotion" TEXT NOT NULL,
    "intensity" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalEntry_user_id_created_at_idx" ON "JournalEntry"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Turn_session_id_turn_number_role_key" ON "Turn"("session_id", "turn_number", "role");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
