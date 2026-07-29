-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "SessionLog" ADD COLUMN     "summary_embedding" vector(768);

-- CreateIndex
CREATE INDEX "SessionLog_summary_embedding_idx" ON "SessionLog" USING hnsw ("summary_embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);
