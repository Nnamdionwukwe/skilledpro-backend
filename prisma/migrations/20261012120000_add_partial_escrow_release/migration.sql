-- ── Partial escrow release ─────────────────────────────────────────────
-- Adds two scalar columns to Payment that track cumulative released
-- amounts, plus a new PaymentRelease table that records each release.

-- 1. New columns on Payment
ALTER TABLE "Payment"
  ADD COLUMN "releasedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "releaseCount"   INTEGER          NOT NULL DEFAULT 0;

-- 2. New PaymentRelease table
CREATE TABLE "PaymentRelease" (
  "id"                    TEXT NOT NULL,
  "paymentId"             TEXT NOT NULL,
  "amount"                DOUBLE PRECISION NOT NULL,
  "currency"              TEXT NOT NULL DEFAULT 'NGN',
  "note"                  TEXT,
  "releasedById"          TEXT NOT NULL,
  "workerPayoutAtRelease" DOUBLE PRECISION NOT NULL,
  "remainingBefore"       DOUBLE PRECISION NOT NULL,
  "remainingAfter"        DOUBLE PRECISION NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentRelease_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentRelease_paymentId_idx"    ON "PaymentRelease"("paymentId");
CREATE INDEX "PaymentRelease_releasedById_idx" ON "PaymentRelease"("releasedById");
CREATE INDEX "PaymentRelease_createdAt_idx"    ON "PaymentRelease"("createdAt" DESC);

ALTER TABLE "PaymentRelease"
  ADD CONSTRAINT "PaymentRelease_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentRelease"
  ADD CONSTRAINT "PaymentRelease_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
