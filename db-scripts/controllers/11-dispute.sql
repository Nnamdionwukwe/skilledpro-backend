-- ============================================================
-- Controller: dispute
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql, 05-booking.sql, 07-refund.sql
-- ============================================================

-- Table: Dispute
CREATE TABLE IF NOT EXISTS "Dispute" (
    "id"        TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,

    -- Who raised it
    "raisedById"   TEXT NOT NULL,
    "raisedByRole" "DisputeRaisedBy" NOT NULL,

    -- The other party at time of raising (denormalised for quick lookups)
    "againstId" TEXT NOT NULL,

    -- Details
    "reason"      TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence"    TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- State
    "status"                "DisputeStatus"   NOT NULL DEFAULT 'PENDING_REVIEW',
    "previousBookingStatus" "BookingStatus",  -- nullable

    -- Resolution
    "resolution"   "DisputeResolution",
    "resolvedById" TEXT,
    "resolvedAt"   TIMESTAMP(3),
    "adminNotes"   TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);


-- Indexes: Dispute
CREATE INDEX IF NOT EXISTS "Dispute_bookingId_idx"   ON "Dispute"("bookingId");
CREATE INDEX IF NOT EXISTS "Dispute_raisedById_idx"  ON "Dispute"("raisedById");
CREATE INDEX IF NOT EXISTS "Dispute_againstId_idx"   ON "Dispute"("againstId");
CREATE INDEX IF NOT EXISTS "Dispute_status_idx"      ON "Dispute"("status");
CREATE INDEX IF NOT EXISTS "Dispute_createdAt_idx"   ON "Dispute"("createdAt" DESC);

-- Foreign keys: Dispute
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_raisedById_fkey"
    FOREIGN KEY ("raisedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_againstId_fkey"
    FOREIGN KEY ("againstId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- NOTE: The FK from Refund.disputeId → Dispute(id) is declared in
--       99-final-fks.sql because Refund is created before Dispute.