-- E17-S4 — append-only, tamper-evident audit chain.
--
-- One row per safety-relevant event; `hash = sha256(prev_hash + body)` where
-- `body` is the canonical JSON text that was sealed (see
-- apps/api/src/lib/audit-chain.ts). Additive only: no existing table is
-- touched, so this migration is safe to deploy against the live database.
--
-- `seq` is app-assigned and contiguous from 1 (gap-freeness is verified), and
-- `prev_hash` is UNIQUE so two tasks cannot fork the chain off one head — the
-- loser gets a unique violation and retries behind the winner.

-- CreateTable
CREATE TABLE "AuditEvent" (
    "seq" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_prev_hash_key" ON "AuditEvent"("prev_hash");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_hash_key" ON "AuditEvent"("hash");

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");
