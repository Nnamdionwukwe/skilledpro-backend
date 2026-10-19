-- AlterTable
ALTER TABLE "RetainedStaffMember"
  ADD COLUMN "location" TEXT,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;
