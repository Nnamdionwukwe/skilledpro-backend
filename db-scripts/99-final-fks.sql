-- ============================================================
-- SkilledProz Backend — Deferred Foreign Keys
-- These FKs are added at the very end so that ALL referenced
-- tables already exist. Prisma emits them inline, which fails
-- when a table references another that appears later in the
-- build order.
-- ============================================================

-- SavedJob → JobPost
ALTER TABLE "SavedJob" DROP CONSTRAINT IF EXISTS "SavedJob_jobPostId_fkey";
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobPostId_fkey"
  FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CampaignReferral → CampaignSubmission
ALTER TABLE "CampaignReferral" DROP CONSTRAINT IF EXISTS "CampaignReferral_submissionId_fkey";
ALTER TABLE "CampaignReferral" ADD CONSTRAINT "CampaignReferral_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "CampaignSubmission"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
