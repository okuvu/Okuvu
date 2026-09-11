-- AlterTable
ALTER TABLE "Reminder"
  ADD COLUMN "tool_id" TEXT,
  ADD COLUMN "frequency" TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN "times" TEXT[] NOT NULL DEFAULT '{}';

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "ToolRegistryEntry"("tool_id") ON DELETE SET NULL ON UPDATE CASCADE;
