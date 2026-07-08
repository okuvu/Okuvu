-- CreateTable
CREATE TABLE "MoodLog" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mood_value" INTEGER NOT NULL,
    "date_ist" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'user_input',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoodLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MoodLog_user_id_date_ist_key" ON "MoodLog"("user_id", "date_ist");

-- CreateIndex
CREATE INDEX "MoodLog_user_id_date_ist_idx" ON "MoodLog"("user_id", "date_ist" DESC);

-- AddForeignKey
ALTER TABLE "MoodLog" ADD CONSTRAINT "MoodLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
