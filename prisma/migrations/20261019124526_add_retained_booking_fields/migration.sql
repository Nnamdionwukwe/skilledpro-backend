-- AlterTable
ALTER TABLE "Booking"
  ADD COLUMN "location" TEXT,
  ADD COLUMN "workDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "workStart" TEXT,
  ADD COLUMN "workEnd" TEXT,
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "employeeNumber" TEXT,
  ADD COLUMN "managerName" TEXT;
