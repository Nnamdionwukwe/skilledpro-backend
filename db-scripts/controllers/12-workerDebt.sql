-- ============================================================
-- Controller: workerDebt
-- Serves: admin.debt.controller.js
--         worker.refund.controller.js (reads via Refund.workerDebts)
--         dispute.controller.js + refund.service.js (writers)
-- Depends on: 00-init.sql, 01-enums.sql, 02-auth.sql, 03-worker.sql, 07-refund.sql
-- ============================================================

-- Table: WorkerDebt
-- Tracks amounts a worker owes the platform. Created when a dispute refund
-- cannot be clawed back from the worker's available balance because the money
-- was already withdrawn. Auto-deducted from subsequent payouts (FIFO) until
-- CLEARED, or manually resolved by an admin (FORGIVEN / COLLECTION).
CREATE TABLE IF NOT EXISTS "WorkerDebt" (
    "id"              TEXT NOT NULL,
    "workerId"        TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,

    -- Amounts
    "amount"         DOUBLE PRECISION NOT NULL,                 -- original debt
    "amountPaid"     DOUBLE PRECISION NOT NULL DEFAULT 0,       -- auto-deducted so far
    "amountForgiven" DOUBLE PRECISION NOT NULL DEFAULT 0,       -- admin-forgiven portion
    "currency"       TEXT             NOT NULL DEFAULT 'NGN',

    -- Reason
    "reason"     TEXT NOT NULL,   -- "DISPUTE_REFUND" | "CHARGEBACK" | "FRAUD_REVERSAL" | "OTHER"
    "reasonNote" TEXT,

    -- Source refund (soft ref — FK deferred to 99-final-fks.sql)
    "refundId" TEXT,

    -- Status lifecycle: OUTSTANDING → CLEARED | FORGIVEN | COLLECTION
    "status" TEXT NOT NULL DEFAULT 'OUTSTANDING',

    -- Lifecycle timestamps
    "clearedAt"   TIMESTAMP(3),
    "forgivenAt"  TIMESTAMP(3),
    "forgivenById" TEXT,

    "markedCollectionAt"   TIMESTAMP(3),
    "markedCollectionById" TEXT,

    -- Free-form context (forgivenHistory, collectionNote, lastDeductionAt, etc.)
    "meta" JSONB,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerDebt_pkey" PRIMARY KEY ("id")
);


-- Indexes: WorkerDebt
CREATE INDEX IF NOT EXISTS "WorkerDebt_workerId_idx"        ON "WorkerDebt"("workerId");
CREATE INDEX IF NOT EXISTS "WorkerDebt_workerProfileId_idx" ON "WorkerDebt"("workerProfileId");
CREATE INDEX IF NOT EXISTS "WorkerDebt_status_idx"          ON "WorkerDebt"("status");
CREATE INDEX IF NOT EXISTS "WorkerDebt_reason_idx"          ON "WorkerDebt"("reason");
CREATE INDEX IF NOT EXISTS "WorkerDebt_createdAt_idx"       ON "WorkerDebt"("createdAt" DESC);

-- Foreign keys: WorkerDebt
ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_workerProfileId_fkey"
    FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_forgivenById_fkey"
    FOREIGN KEY ("forgivenById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_markedCollectionById_fkey"
    FOREIGN KEY ("markedCollectionById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- NOTE: WorkerDebt.refundId → Refund(id) FK lives in 99-final-fks.sql
--       because Refund is created before WorkerDebt.