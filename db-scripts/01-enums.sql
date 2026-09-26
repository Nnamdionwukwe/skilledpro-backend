-- ============================================================
-- SkilledProz - All Enums
-- Depends on: 00-init.sql
-- Last updated: 2026-09-26 (added BookingSource, REFUND_*, SURVEY_*,
--                          DISPUTE_*, WORKER_DEBT_* audit actions,
--                          plus REFUND + SURVEY audit targets)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('HIRER', 'WORKER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BookingSource" AS ENUM ('DIRECT', 'JOB_POST');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'HELD', 'RELEASED', 'REFUNDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "JobPostStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ReferralTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'DIAMOND');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'CONVERTED', 'REWARDED', 'EXPIRED', 'FLAGGED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CampaignReferralStatus" AS ENUM ('PENDING', 'TASKS_DONE', 'SUBMITTED', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CampaignSubmissionStatus" AS ENUM ('PENDING', 'REVIEWING', 'APPROVED', 'PARTIAL', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ReportType" AS ENUM ('USER', 'JOB_POST', 'POST', 'REVIEW', 'BOOKING', 'MESSAGE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'FAKE_PROFILE', 'INAPPROPRIATE_CONTENT', 'FRAUD', 'HARASSMENT', 'SCAM', 'MISLEADING_INFORMATION', 'FAKE_REVIEWS', 'UNDERAGE_USER', 'HATE_SPEECH', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ReportAction" AS ENUM ('NO_ACTION', 'WARNING_ISSUED', 'CONTENT_REMOVED', 'USER_SUSPENDED', 'USER_BANNED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuditAction" AS ENUM (
    -- ── User management ──────────────────────────────────────────────────────
    'USER_BANNED', 'USER_UNBANNED', 'USER_DELETED', 'USER_ROLE_CHANGED',
    'USER_VERIFIED', 'USER_VERIFICATION_REJECTED', 'USER_SUSPENDED',
    -- ── Payment management ───────────────────────────────────────────────────
    'PAYMENT_RELEASED', 'PAYMENT_REFUNDED',
    'PAYMENT_MANUAL_VERIFIED', 'PAYMENT_MANUAL_REJECTED',
    -- ── Withdrawal management ────────────────────────────────────────────────
    'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED',
    -- ── Worker debt management ───────────────────────────────────────────────
    'WORKER_DEBT_CREATED', 'WORKER_DEBT_DEDUCTED',
    'WORKER_DEBT_FORGIVEN', 'WORKER_DEBT_MARKED_COLLECTION',
    -- ── Refund management (added: admin.refund.controller.js) ───────────────
    'REFUND_APPROVED', 'REFUND_REJECTED', 'REFUND_REVERSED',
    'REFUND_BULK_APPROVED', 'REFUND_BULK_REJECTED',
    -- ── Report management ────────────────────────────────────────────────────
    'REPORT_REVIEWED', 'REPORT_RESOLVED', 'REPORT_DISMISSED', 'REPORT_BULK_DISMISSED',
    -- ── Content management ───────────────────────────────────────────────────
    'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DELETED',
    'REVIEW_DELETED', 'JOB_DELETED', 'JOB_STATUS_CHANGED',
    'POST_DELETED', 'COMMENT_DELETED', 'FEATURED_REMOVED',
    -- ── Booking & disputes ───────────────────────────────────────────────────
    'BOOKING_STATUS_CHANGED',
    'DISPUTE_RESOLVED',       -- legacy — kept for backwards compat
    'DISPUTE_RAISED',
    'DISPUTE_RESOLVED_REFUND',
    'DISPUTE_RESOLVED_RELEASE',
    'DISPUTE_CANCELLED',
    -- ── Campaign ─────────────────────────────────────────────────────────────
    'CAMPAIGN_SUBMISSION_REVIEWED',
    'CAMPAIGN_WITHDRAWAL_APPROVED', 'CAMPAIGN_WITHDRAWAL_REJECTED',
    -- ── Referral ─────────────────────────────────────────────────────────────
    'REFERRAL_PAYOUT_PROCESSED', 'REFERRAL_FLAGGED',
    -- ── Subscription ─────────────────────────────────────────────────────────
    'SUBSCRIPTION_CANCELLED',
    -- ── Notifications ────────────────────────────────────────────────────────
    'NOTIFICATION_BROADCAST',
    -- ── Survey moderation (added: survey.controller.js) ─────────────────────
    'SURVEY_VIEWED', 'SURVEY_STATUS_UPDATED', 'SURVEY_BULK_DELETED',
    -- ── System ───────────────────────────────────────────────────────────────
    'ADMIN_LOGIN', 'SETTINGS_CHANGED',
    -- ── Job helpers ──────────────────────────────────────────────────────────
    'JOB_CREATED', 'JOB_UPDATED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuditTargetType" AS ENUM (
    'USER', 'PAYMENT', 'WITHDRAWAL', 'BOOKING', 'JOB_POST', 'POST',
    'COMMENT', 'REVIEW', 'CATEGORY', 'REPORT',
    'CAMPAIGN_SUBMISSION', 'CAMPAIGN_WITHDRAWAL',
    'REFERRAL', 'SUBSCRIPTION', 'FEATURED_LISTING',
    'DISPUTE', 'SYSTEM',
    -- Added: refund controller
    'REFUND',
    -- Added: survey controller
    'SURVEY'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SalaryPeriod" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EducationLevel" AS ENUM ('HIGH_SCHOOL', 'DIPLOMA', 'BACHELOR', 'MASTER', 'DOCTORATE', 'CERTIFICATION', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SubscriptionRole" AS ENUM ('WORKER', 'HIRER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED', 'PENDING');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PostType" AS ENUM ('GENERAL', 'JOB_UPDATE', 'ACHIEVEMENT', 'PORTFOLIO', 'ANNOUNCEMENT', 'HIRING');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ReactionType" AS ENUM ('LIKE', 'LOVE', 'INSIGHTFUL', 'CELEBRATE', 'SUPPORT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "JobType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "LocationType" AS ENUM ('REMOTE', 'ON_SITE', 'HYBRID');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BudgetType" AS ENUM ('FIXED', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DurationType" AS ENUM ('HOURS', 'DAYS', 'WEEKS', 'MONTHS', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED', 'REVERSED', 'DISPUTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RefundType" AS ENUM ('FULL', 'PARTIAL', 'CUSTOM_AMOUNT', 'DISPUTE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DisputeStatus" AS ENUM ('PENDING_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_RELEASE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DisputeResolution" AS ENUM ('REFUND', 'RELEASE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DisputeRaisedBy" AS ENUM ('HIRER', 'WORKER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;