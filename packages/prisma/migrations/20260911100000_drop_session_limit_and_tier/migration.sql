-- OKUVU v2.0: retire the daily session-slot limit (continuous chat, no caps).
-- Dropping the table also drops its FK constraint and unique index.

-- DropTable
DROP TABLE "SessionLimit";

-- DropEnum
DROP TYPE "Tier";
