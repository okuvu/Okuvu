-- CreateTable
CREATE TABLE "Turn" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Turn_session_id_turn_number_idx" ON "Turn"("session_id", "turn_number");

-- CreateIndex
CREATE INDEX "Turn_user_id_created_at_idx" ON "Turn"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "SessionLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
