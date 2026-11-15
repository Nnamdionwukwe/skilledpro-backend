-- AlterTable
ALTER TABLE "VideoCall"
  ALTER COLUMN "bookingId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "jobApplicationId" TEXT,
  ADD COLUMN IF NOT EXISTS "callType" TEXT NOT NULL DEFAULT 'BOOKING';

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VideoCall_jobApplicationId_key"
  ON "VideoCall"("jobApplicationId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "VideoCall"
    ADD CONSTRAINT "VideoCall_jobApplicationId_fkey"
    FOREIGN KEY ("jobApplicationId") REFERENCES "JobApplication"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;