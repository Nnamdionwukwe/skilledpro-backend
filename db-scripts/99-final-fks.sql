-- ============================================================
-- SkilledProz Backend — Deferred Foreign Keys
-- ============================================================
-- These FKs are added at the very end of the build so that ALL
-- referenced tables already exist. Prisma emits them inline,
-- which fails when a table references another that appears
-- later in the build order.
--
-- Run this file AFTER every db-scripts/controllers/*.sql file.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SavedJob → JobPost
-- (SavedJob is defined in 02-user.sql, JobPost in 10-job.sql)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "SavedJob" DROP CONSTRAINT IF EXISTS "SavedJob_jobPostId_fkey";
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobPostId_fkey"
  FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────
-- CampaignReferral → CampaignSubmission
-- (both defined in 14-campaign.sql, but CampaignReferral is
--  created first inside that file)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "CampaignReferral" DROP CONSTRAINT IF EXISTS "CampaignReferral_submissionId_fkey";
ALTER TABLE "CampaignReferral" ADD CONSTRAINT "CampaignReferral_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "CampaignSubmission"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────
-- Refund → Dispute
-- (Refund defined in 07-refund.sql, Dispute in 11-dispute.sql —
--  Refund comes first alphabetically and structurally)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Refund" DROP CONSTRAINT IF EXISTS "Refund_disputeId_fkey";
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_disputeId_fkey"
  FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────
-- WorkerDebt → Refund
-- (WorkerDebt defined in 12-workerDebt.sql, Refund in 07-refund.sql —
--  WorkerDebt references Refund, so the FK must be added after both
--  tables exist)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "WorkerDebt" DROP CONSTRAINT IF EXISTS "WorkerDebt_refundId_fkey";
ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "Refund"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;