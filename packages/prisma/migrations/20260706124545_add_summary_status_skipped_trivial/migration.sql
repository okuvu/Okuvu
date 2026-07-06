-- CreateEnum
CREATE TYPE "SummaryStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'SKIPPED_TRIVIAL');

-- AlterTable
ALTER TABLE "SessionSummary" ADD COLUMN     "status" "SummaryStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "summary_text" DROP NOT NULL;
