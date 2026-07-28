-- CreateTable
CREATE TABLE "UserMemory" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "life_context" TEXT[],
    "recurring_themes" TEXT[],
    "what_helps" TEXT[],
    "what_doesnt_help" TEXT[],
    "significant_events" TEXT[],
    "current_stressors" TEXT[],
    "emotional_baseline" TEXT,
    "session_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMemory_user_id_key" ON "UserMemory"("user_id");

-- CreateIndex
CREATE INDEX "UserMemory_user_id_idx" ON "UserMemory"("user_id");

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
