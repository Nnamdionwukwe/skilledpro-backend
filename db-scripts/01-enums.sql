-- ============================================================
-- SkilledProz - All Enums
-- Generated: Sun Sep 13 21:11:53 WAT 2026
-- Depends on: 00-init.sql
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
  CREATE TYPE "AuditAction" AS ENUM ('USER_BANNED', 'USER_UNBANNED', 'USER_DELETED', 'USER_ROLE_CHANGED', 'USER_VERIFIED', 'USER_VERIFICATION_REJECTED', 'USER_SUSPENDED', 'PAYMENT_RELEASED', 'PAYMENT_REFUNDED', 'PAYMENT_MANUAL_VERIFIED', 'PAYMENT_MANUAL_REJECTED', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'REPORT_REVIEWED', 'REPORT_RESOLVED', 'REPORT_DISMISSED', 'REPORT_BULK_DISMISSED', 'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DELETED', 'REVIEW_DELETED', 'JOB_DELETED', 'JOB_STATUS_CHANGED', 'POST_DELETED', 'COMMENT_DELETED', 'FEATURED_REMOVED', 'BOOKING_STATUS_CHANGED', 'DISPUTE_RESOLVED', 'CAMPAIGN_SUBMISSION_REVIEWED', 'CAMPAIGN_WITHDRAWAL_APPROVED', 'CAMPAIGN_WITHDRAWAL_REJECTED', 'REFERRAL_PAYOUT_PROCESSED', 'REFERRAL_FLAGGED', 'SUBSCRIPTION_CANCELLED', 'NOTIFICATION_BROADCAST', 'ADMIN_LOGIN', 'SETTINGS_CHANGED', 'JOB_CREATED', 'JOB_UPDATED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuditTargetType" AS ENUM ('USER', 'PAYMENT', 'WITHDRAWAL', 'BOOKING', 'JOB_POST', 'POST', 'COMMENT', 'REVIEW', 'CATEGORY', 'REPORT', 'CAMPAIGN_SUBMISSION', 'CAMPAIGN_WITHDRAWAL', 'REFERRAL', 'SUBSCRIPTION', 'FEATURED_LISTING', 'DISPUTE', 'SYSTEM');
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

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "avatar" TEXT,
    "bio" TEXT,
    "country" TEXT,
    "city" TEXT,
    "state" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "language" TEXT NOT NULL DEFAULT 'en',
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isPhoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifyToken" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpiry" TIMESTAMP(3),
    "refreshToken" TEXT,
    "lastSeen" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "theme" TEXT DEFAULT 'system',
    "notifBookings" BOOLEAN NOT NULL DEFAULT true,
    "notifMessages" BOOLEAN NOT NULL DEFAULT true,
    "notifPayments" BOOLEAN NOT NULL DEFAULT true,
    "notifReviews" BOOLEAN NOT NULL DEFAULT true,
    "notifMarketing" BOOLEAN NOT NULL DEFAULT false,
    "profileVisible" BOOLEAN NOT NULL DEFAULT true,
    "showPhone" BOOLEAN NOT NULL DEFAULT false,
    "showLocation" BOOLEAN NOT NULL DEFAULT true,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dashboardCurrency" TEXT DEFAULT 'USD',
    "paymentCurrency" TEXT DEFAULT 'USD',
    "showEmail" BOOLEAN NOT NULL DEFAULT false,
    "showGender" BOOLEAN NOT NULL DEFAULT false,
    "defaultEstUnit" TEXT,
    "defaultEstValue" TEXT,
    "gender" TEXT,
    "referralCode" TEXT,
    "referredById" TEXT,
    "walletBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "walletLifetimeTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "referralTier" "ReferralTier" NOT NULL DEFAULT 'BRONZE',
    "totalReferrals" INTEGER NOT NULL DEFAULT 0,
    "successfulReferrals" INTEGER NOT NULL DEFAULT 0,
    "campaignWalletBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "campaignWalletLifetimeTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "withdrawalPin" TEXT,
    "withdrawalPinSet" BOOLEAN NOT NULL DEFAULT false,
    "withdrawalPinAttempts" INTEGER NOT NULL DEFAULT 0,
    "withdrawalPinLockedUntil" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

