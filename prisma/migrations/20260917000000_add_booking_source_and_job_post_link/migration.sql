-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('DIRECT', 'JOB_POST');

-- AlterTable: Booking
ALTER TABLE "Booking"
  ADD COLUMN "source" "BookingSource" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "jobPostId" TEXT,
  ADD COLUMN "selectedRateOption" TEXT,
  ADD COLUMN "jobRateSnapshot" JSONB;

-- CreateIndex
CREATE INDEX "Booking_jobPostId_idx" ON "Booking"("jobPostId");

-- AddForeignKey
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_jobPostId_fkey"
  FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
