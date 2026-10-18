-- ============================================================
-- Controller: retainedStaff
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql, 05-booking.sql,
--             06-payment.sql, 07-refund.sql, 09-adminLog.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- NEW ENUMS
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "RetainedStaffStatus" AS ENUM ('ACTIVE','PAUSED','ENDED','TERMINATED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PayFrequency" AS ENUM ('WEEKLY','BIWEEKLY','SEMI_MONTHLY','MONTHLY','QUARTERLY','ON_DEMAND');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RetainedCycleStatus" AS ENUM ('SCHEDULED','AWAITING_PAYMENT','HELD','PARTIALLY_RELEASED','RELEASED','CANCELLED','FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RetainedCycleType" AS ENUM ('REGULAR','MANUAL','BONUS','REIMBURSEMENT','FINAL_SETTLEMENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RetainedPaymentMethod" AS ENUM ('ESCROW','DIRECT_TRANSFER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RetainedDocumentType" AS ENUM ('CONTRACT','NDA','ID','CERTIFICATION','OFFER_LETTER','PAYSLIP','OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RetainedDocumentStatus" AS ENUM ('PENDING','SIGNED','VERIFIED','REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ────────────────────────────────────────────────────────────
-- EXTEND EXISTING ENUMS
-- ────────────────────────────────────────────────────────────
ALTER TYPE "BookingSource"    ADD VALUE IF NOT EXISTS 'RETAINED_STAFF';
ALTER TYPE "BookingStatus"    ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT';
ALTER TYPE "BookingStatus"    ADD VALUE IF NOT EXISTS 'PAID';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_STAFF_ADDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_STAFF_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_STAFF_PAUSED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_STAFF_RESUMED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_STAFF_ENDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_STAFF_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_STAFF_RATE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_STAFF_DOCUMENT_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_STAFF_DOCUMENT_VERIFIED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_STAFF_DOCUMENT_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_CYCLE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_CYCLE_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_CYCLE_PAYMENT_MADE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_CYCLE_RELEASED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_CYCLE_REFUNDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_CYCLE_DISPUTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETAINED_CYCLE_CRON_GENERATED';

ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'RETAINED_STAFF_MEMBER';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'RETAINED_STAFF_CYCLE';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'RETAINED_STAFF_DOCUMENT';

-- ────────────────────────────────────────────────────────────
-- BOOKING: address nullable (needed for retained cycles)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Booking" ALTER COLUMN "address" DROP NOT NULL;

-- ────────────────────────────────────────────────────────────
-- RetainedStaffMember
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RetainedStaffMember" (
  "id"                  TEXT PRIMARY KEY,
  "hirerId"             TEXT NOT NULL,
  "workerId"            TEXT NOT NULL,
  "jobTitle"            TEXT NOT NULL,
  "department"          TEXT,
  "employmentType"      TEXT NOT NULL DEFAULT 'FULL_TIME',
  "description"         TEXT,
  "payRate"             DOUBLE PRECISION NOT NULL,
  "currency"            TEXT NOT NULL DEFAULT 'NGN',
  "payFrequency"        "PayFrequency" NOT NULL DEFAULT 'MONTHLY',
  "overtimeRate"        DOUBLE PRECISION,
  "bonusEnabled"        BOOLEAN NOT NULL DEFAULT true,
  "currencyLocked"      BOOLEAN NOT NULL DEFAULT false,
  "workDays"            TEXT[] DEFAULT ARRAY[]::TEXT[],
  "workStart"           TEXT,
  "workEnd"             TEXT,
  "timezone"            TEXT NOT NULL DEFAULT 'Africa/Lagos',
  "status"              "RetainedStaffStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pausedAt"            TIMESTAMP(3),
  "endedAt"             TIMESTAMP(3),
  "endReason"           TEXT,
  "nextCycleAt"         TIMESTAMP(3),
  "totalPaidLifetime"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalHeld"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cyclesCount"         INTEGER NOT NULL DEFAULT 0,
  "lastPaidAt"          TIMESTAMP(3),
  "employeeNumber"      TEXT,
  "managerName"         TEXT,
  "emergencyContact"    TEXT,
  "notes"               TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "RetainedStaffMember_hirerId_status_idx"
  ON "RetainedStaffMember"("hirerId","status");
CREATE INDEX IF NOT EXISTS "RetainedStaffMember_workerId_status_idx"
  ON "RetainedStaffMember"("workerId","status");
CREATE INDEX IF NOT EXISTS "RetainedStaffMember_hirerId_workerId_idx"
  ON "RetainedStaffMember"("hirerId","workerId");
CREATE INDEX IF NOT EXISTS "RetainedStaffMember_nextCycleAt_idx"
  ON "RetainedStaffMember"("nextCycleAt");
CREATE INDEX IF NOT EXISTS "RetainedStaffMember_createdAt_idx"
  ON "RetainedStaffMember"("createdAt" DESC);

-- Only one ACTIVE membership per (hirer, worker)
CREATE UNIQUE INDEX IF NOT EXISTS "RetainedStaffMember_active_unique"
  ON "RetainedStaffMember"("hirerId","workerId")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "RetainedStaffMember"
  DROP CONSTRAINT IF EXISTS "RetainedStaffMember_hirerId_fkey";
ALTER TABLE "RetainedStaffMember"
  ADD CONSTRAINT "RetainedStaffMember_hirerId_fkey"
  FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "RetainedStaffMember"
  DROP CONSTRAINT IF EXISTS "RetainedStaffMember_workerId_fkey";
ALTER TABLE "RetainedStaffMember"
  ADD CONSTRAINT "RetainedStaffMember_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT;

-- ────────────────────────────────────────────────────────────
-- RetainedPayrollCycle
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RetainedPayrollCycle" (
  "id"                 TEXT PRIMARY KEY,
  "memberId"           TEXT NOT NULL,
  "hirerId"            TEXT NOT NULL,
  "workerId"           TEXT NOT NULL,
  "type"               "RetainedCycleType" NOT NULL DEFAULT 'REGULAR',
  "periodStart"        TIMESTAMP(3) NOT NULL,
  "periodEnd"          TIMESTAMP(3) NOT NULL,
  "payDate"            TIMESTAMP(3) NOT NULL,
  "label"              TEXT,
  "baseAmount"         DOUBLE PRECISION NOT NULL,
  "bonusAmount"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "deductionAmount"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "grossAmount"        DOUBLE PRECISION NOT NULL,
  "netAmount"          DOUBLE PRECISION NOT NULL,
  "currency"           TEXT NOT NULL DEFAULT 'NGN',
  "platformFee"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "workerPayout"       DOUBLE PRECISION NOT NULL,
  "notes"              TEXT,
  "status"             "RetainedCycleStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "paymentMethod"      "RetainedPaymentMethod" NOT NULL DEFAULT 'ESCROW',
  "bookingId"          TEXT UNIQUE,
  "autoGenerated"      BOOLEAN NOT NULL DEFAULT false,
  "cronLockKey"        TEXT UNIQUE,
  "paidAt"             TIMESTAMP(3),
  "releasedAt"         TIMESTAMP(3),
  "cancelledAt"        TIMESTAMP(3),
  "failureReason"      TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "RetainedPayrollCycle_memberId_status_idx"
  ON "RetainedPayrollCycle"("memberId","status");
CREATE INDEX IF NOT EXISTS "RetainedPayrollCycle_hirerId_status_idx"
  ON "RetainedPayrollCycle"("hirerId","status");
CREATE INDEX IF NOT EXISTS "RetainedPayrollCycle_workerId_status_idx"
  ON "RetainedPayrollCycle"("workerId","status");
CREATE INDEX IF NOT EXISTS "RetainedPayrollCycle_payDate_idx"
  ON "RetainedPayrollCycle"("payDate");
CREATE INDEX IF NOT EXISTS "RetainedPayrollCycle_status_payDate_idx"
  ON "RetainedPayrollCycle"("status","payDate");
CREATE INDEX IF NOT EXISTS "RetainedPayrollCycle_period_idx"
  ON "RetainedPayrollCycle"("periodStart","periodEnd");
CREATE INDEX IF NOT EXISTS "RetainedPayrollCycle_createdAt_idx"
  ON "RetainedPayrollCycle"("createdAt" DESC);

ALTER TABLE "RetainedPayrollCycle"
  DROP CONSTRAINT IF EXISTS "RetainedPayrollCycle_memberId_fkey";
ALTER TABLE "RetainedPayrollCycle"
  ADD CONSTRAINT "RetainedPayrollCycle_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "RetainedStaffMember"("id") ON DELETE CASCADE;

ALTER TABLE "RetainedPayrollCycle"
  DROP CONSTRAINT IF EXISTS "RetainedPayrollCycle_hirerId_fkey";
ALTER TABLE "RetainedPayrollCycle"
  ADD CONSTRAINT "RetainedPayrollCycle_hirerId_fkey"
  FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "RetainedPayrollCycle"
  DROP CONSTRAINT IF EXISTS "RetainedPayrollCycle_workerId_fkey";
ALTER TABLE "RetainedPayrollCycle"
  ADD CONSTRAINT "RetainedPayrollCycle_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "RetainedPayrollCycle"
  DROP CONSTRAINT IF EXISTS "RetainedPayrollCycle_bookingId_fkey";
ALTER TABLE "RetainedPayrollCycle"
  ADD CONSTRAINT "RetainedPayrollCycle_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────
-- RetainedStaffDocument
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RetainedStaffDocument" (
  "id"             TEXT PRIMARY KEY,
  "memberId"       TEXT NOT NULL,
  "type"           "RetainedDocumentType" NOT NULL,
  "title"          TEXT NOT NULL,
  "fileUrl"        TEXT NOT NULL,
  "mimeType"       TEXT,
  "sizeBytes"      INTEGER,
  "status"         "RetainedDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "uploadedById"   TEXT NOT NULL,
  "signedAt"       TIMESTAMP(3),
  "expiresAt"      TIMESTAMP(3),
  "rejectionNote"  TEXT,
  "meta"           JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "RetainedStaffDocument_memberId_idx"
  ON "RetainedStaffDocument"("memberId");
CREATE INDEX IF NOT EXISTS "RetainedStaffDocument_type_idx"
  ON "RetainedStaffDocument"("type");
CREATE INDEX IF NOT EXISTS "RetainedStaffDocument_status_idx"
  ON "RetainedStaffDocument"("status");

ALTER TABLE "RetainedStaffDocument"
  DROP CONSTRAINT IF EXISTS "RetainedStaffDocument_memberId_fkey";
ALTER TABLE "RetainedStaffDocument"
  ADD CONSTRAINT "RetainedStaffDocument_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "RetainedStaffMember"("id") ON DELETE CASCADE;

ALTER TABLE "RetainedStaffDocument"
  DROP CONSTRAINT IF EXISTS "RetainedStaffDocument_uploadedById_fkey";
ALTER TABLE "RetainedStaffDocument"
  ADD CONSTRAINT "RetainedStaffDocument_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT;

-- ────────────────────────────────────────────────────────────
-- RetainedStaffNote
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RetainedStaffNote" (
  "id"         TEXT PRIMARY KEY,
  "memberId"   TEXT NOT NULL,
  "authorId"   TEXT NOT NULL,
  "title"      TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "category"   TEXT NOT NULL DEFAULT 'GENERAL',
  "isPrivate"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "RetainedStaffNote_memberId_createdAt_idx"
  ON "RetainedStaffNote"("memberId","createdAt" DESC);

ALTER TABLE "RetainedStaffNote"
  DROP CONSTRAINT IF EXISTS "RetainedStaffNote_memberId_fkey";
ALTER TABLE "RetainedStaffNote"
  ADD CONSTRAINT "RetainedStaffNote_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "RetainedStaffMember"("id") ON DELETE CASCADE;

ALTER TABLE "RetainedStaffNote"
  DROP CONSTRAINT IF EXISTS "RetainedStaffNote_authorId_fkey";
ALTER TABLE "RetainedStaffNote"
  ADD CONSTRAINT "RetainedStaffNote_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT;

-- ────────────────────────────────────────────────────────────
-- RetainedStaffRevision
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RetainedStaffRevision" (
  "id"           TEXT PRIMARY KEY,
  "memberId"     TEXT NOT NULL,
  "changedById"  TEXT NOT NULL,
  "field"        TEXT NOT NULL,
  "oldValue"     JSONB,
  "newValue"     JSONB,
  "reason"       TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "RetainedStaffRevision_memberId_createdAt_idx"
  ON "RetainedStaffRevision"("memberId","createdAt" DESC);

ALTER TABLE "RetainedStaffRevision"
  DROP CONSTRAINT IF EXISTS "RetainedStaffRevision_memberId_fkey";
ALTER TABLE "RetainedStaffRevision"
  ADD CONSTRAINT "RetainedStaffRevision_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "RetainedStaffMember"("id") ON DELETE CASCADE;

ALTER TABLE "RetainedStaffRevision"
  DROP CONSTRAINT IF EXISTS "RetainedStaffRevision_changedById_fkey";
ALTER TABLE "RetainedStaffRevision"
  ADD CONSTRAINT "RetainedStaffRevision_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT;

-- ────────────────────────────────────────────────────────────
-- LINK RETAINED CYCLES FROM Dispute / Refund
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "retainedCycleId" TEXT;
CREATE INDEX IF NOT EXISTS "Dispute_retainedCycleId_idx"
  ON "Dispute"("retainedCycleId");

ALTER TABLE "Dispute"
  DROP CONSTRAINT IF EXISTS "Dispute_retainedCycleId_fkey";
ALTER TABLE "Dispute"
  ADD CONSTRAINT "Dispute_retainedCycleId_fkey"
  FOREIGN KEY ("retainedCycleId") REFERENCES "RetainedPayrollCycle"("id") ON DELETE SET NULL;

ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "retainedCycleId" TEXT;
CREATE INDEX IF NOT EXISTS "Refund_retainedCycleId_idx"
  ON "Refund"("retainedCycleId");

ALTER TABLE "Refund"
  DROP CONSTRAINT IF EXISTS "Refund_retainedCycleId_fkey";
ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_retainedCycleId_fkey"
  FOREIGN KEY ("retainedCycleId") REFERENCES "RetainedPayrollCycle"("id") ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────
-- PERMANENT CONVERSATION PER MEMBERSHIP
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "retainedMemberId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_retainedMemberId_key"
  ON "Conversation"("retainedMemberId");

ALTER TABLE "Conversation"
  DROP CONSTRAINT IF EXISTS "Conversation_retainedMemberId_fkey";
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_retainedMemberId_fkey"
  FOREIGN KEY ("retainedMemberId") REFERENCES "RetainedStaffMember"("id") ON DELETE SET NULL;