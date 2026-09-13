-- ============================================================
-- Controller: refund
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: Refund
CREATE TABLE IF NOT EXISTS "Refund" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "workerId" TEXT,
    "adminId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "platformFeeRefunded" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workerAmountDeducted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refundType" "RefundType" NOT NULL DEFAULT 'FULL',
    "percentage" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "adminNotes" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);


-- Indexes: Refund
CREATE UNIQUE INDEX IF NOT EXISTS "Refund_reference_key" ON "Refund"("reference");
CREATE INDEX IF NOT EXISTS "Refund_bookingId_idx" ON "Refund"("bookingId");
CREATE INDEX IF NOT EXISTS "Refund_paymentId_idx" ON "Refund"("paymentId");
CREATE INDEX IF NOT EXISTS "Refund_hirerId_idx" ON "Refund"("hirerId");
CREATE INDEX IF NOT EXISTS "Refund_workerId_idx" ON "Refund"("workerId");
CREATE INDEX IF NOT EXISTS "Refund_adminId_idx" ON "Refund"("adminId");
CREATE INDEX IF NOT EXISTS "Refund_status_idx" ON "Refund"("status");
CREATE INDEX IF NOT EXISTS "Refund_reference_idx" ON "Refund"("reference");
CREATE INDEX IF NOT EXISTS "Refund_createdAt_idx" ON "Refund"("createdAt" DESC);

-- Foreign keys: Refund
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

