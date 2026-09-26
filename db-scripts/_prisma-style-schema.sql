-- ============================================================
-- SkilledProz — Full Schema (Prisma-style)
-- Generated: 2026-09-26T16:41:58Z
-- Source commit: 5972ca7
-- DO NOT EDIT — regenerate via db-scripts/generate-full-schema.sh
-- NOT idempotent — will fail if run on an existing DB.
-- ============================================================



-- ════════════════════════════════════════════════════════════
-- db-scripts/00-init.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- SkilledProz Backend — Database Initialization
-- Run this FIRST on a fresh Postgres instance
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Optional: uncomment if you want to auto-set the search_path
-- SET search_path TO public;

-- Note: database creation is done outside this file, e.g.:
--   createdb skilledproz
--   psql -U prisma -d skilledproz

-- ════════════════════════════════════════════════════════════
-- db-scripts/01-enums.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- SkilledProz - All Enums
-- Depends on: 00-init.sql
-- Last updated: 2026-09-26 (added BookingSource, REFUND_*, SURVEY_*,
--                          DISPUTE_*, WORKER_DEBT_* audit actions,
--                          plus REFUND + SURVEY audit targets)
-- ============================================================

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('HIRER', 'WORKER', 'ADMIN');

-- CreateEnum
-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('DIRECT', 'JOB_POST');

-- CreateEnum
-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'HELD', 'RELEASED', 'REFUNDED', 'FAILED');

-- CreateEnum
-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
-- CreateEnum
CREATE TYPE "JobPostStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED');

-- CreateEnum
-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
-- CreateEnum
CREATE TYPE "ReferralTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'DIAMOND');

-- CreateEnum
-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'CONVERTED', 'REWARDED', 'EXPIRED', 'FLAGGED');

-- CreateEnum
-- CreateEnum
CREATE TYPE "CampaignReferralStatus" AS ENUM ('PENDING', 'TASKS_DONE', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
-- CreateEnum
CREATE TYPE "CampaignSubmissionStatus" AS ENUM ('PENDING', 'REVIEWING', 'APPROVED', 'PARTIAL', 'REJECTED');

-- CreateEnum
-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('USER', 'JOB_POST', 'POST', 'REVIEW', 'BOOKING', 'MESSAGE');

-- CreateEnum
-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'FAKE_PROFILE', 'INAPPROPRIATE_CONTENT', 'FRAUD', 'HARASSMENT', 'SCAM', 'MISLEADING_INFORMATION', 'FAKE_REVIEWS', 'UNDERAGE_USER', 'HATE_SPEECH', 'OTHER');

-- CreateEnum
-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
-- CreateEnum
CREATE TYPE "ReportAction" AS ENUM ('NO_ACTION', 'WARNING_ISSUED', 'CONTENT_REMOVED', 'USER_SUSPENDED', 'USER_BANNED');

-- CreateEnum
-- CreateEnum
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

-- CreateEnum
-- CreateEnum
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

-- CreateEnum
-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('HIGH_SCHOOL', 'DIPLOMA', 'BACHELOR', 'MASTER', 'DOCTORATE', 'CERTIFICATION', 'OTHER');

-- CreateEnum
-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');

-- CreateEnum
-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
-- CreateEnum
CREATE TYPE "SubscriptionRole" AS ENUM ('WORKER', 'HIRER');

-- CreateEnum
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED', 'PENDING');

-- CreateEnum
-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('GENERAL', 'JOB_UPDATE', 'ACHIEVEMENT', 'PORTFOLIO', 'ANNOUNCEMENT', 'HIRING');

-- CreateEnum
-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('LIKE', 'LOVE', 'INSIGHTFUL', 'CELEBRATE', 'SUPPORT');

-- CreateEnum
-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY');

-- CreateEnum
-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('REMOTE', 'ON_SITE', 'HYBRID');

-- CreateEnum
-- CreateEnum
CREATE TYPE "BudgetType" AS ENUM ('FIXED', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
-- CreateEnum
CREATE TYPE "DurationType" AS ENUM ('HOURS', 'DAYS', 'WEEKS', 'MONTHS', 'CUSTOM');

-- CreateEnum
-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED', 'REVERSED', 'DISPUTED');

-- CreateEnum
-- CreateEnum
CREATE TYPE "RefundType" AS ENUM ('FULL', 'PARTIAL', 'CUSTOM_AMOUNT', 'DISPUTE');

-- CreateEnum
-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('PENDING_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_RELEASE', 'CANCELLED');

-- CreateEnum
-- CreateEnum
CREATE TYPE "DisputeResolution" AS ENUM ('REFUND', 'RELEASE');

-- CreateEnum
-- CreateEnum
CREATE TYPE "DisputeRaisedBy" AS ENUM ('HIRER', 'WORKER');
-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/02-auth.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: auth
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: User
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

    -- ── Google OAuth (added: required by auth.controller.js googleSignIn / googleCallback) ──
    "googleId"     TEXT,
    "authProvider" TEXT    NOT NULL DEFAULT 'LOCAL',   -- 'LOCAL' | 'GOOGLE'
    "avatarCustom" BOOLEAN NOT NULL DEFAULT false,     -- true once user sets their own avatar
    "nameCustom"   BOOLEAN NOT NULL DEFAULT false,     -- true once user sets their own name

    -- ── Account lifecycle (added: required by auth.controller.js login / logoutAll) ──
    "isPaused"            BOOLEAN NOT NULL DEFAULT false,  -- "Take a break" state
    "pausedAt"            TIMESTAMP(3),
    "deletionScheduledAt" TIMESTAMP(3),                    -- set when user requests permanent delete
    "deletionReason"      TEXT,
    "deletionRequestedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);


-- Indexes: User
CREATE UNIQUE INDEX "User_email_key"        ON "User"("email");
CREATE UNIQUE INDEX "User_phone_key"        ON "User"("phone");
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE UNIQUE INDEX "User_googleId_key"     ON "User"("googleId");

-- Foreign keys: User
-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/02-user.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: user
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: DeviceToken
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);


-- Indexes: DeviceToken
CREATE UNIQUE INDEX "DeviceToken_userId_token_key" ON "DeviceToken"("userId", "token");
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");
CREATE INDEX "DeviceToken_token_idx" ON "DeviceToken"("token");
CREATE INDEX "DeviceToken_active_idx" ON "DeviceToken"("active");

-- Foreign keys: DeviceToken
-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: SavedWorker
CREATE TABLE "SavedWorker" (
    "id" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedWorker_pkey" PRIMARY KEY ("id")
);


-- Indexes: SavedWorker
CREATE UNIQUE INDEX "SavedWorker_hirerId_workerId_key" ON "SavedWorker"("hirerId", "workerId");
CREATE INDEX "SavedWorker_hirerId_idx" ON "SavedWorker"("hirerId");
CREATE INDEX "SavedWorker_workerId_idx" ON "SavedWorker"("workerId");

-- Foreign keys: SavedWorker
-- AddForeignKey
ALTER TABLE "SavedWorker" ADD CONSTRAINT "SavedWorker_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SavedWorker" ADD CONSTRAINT "SavedWorker_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: SavedJob
CREATE TABLE "SavedJob" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);


-- Indexes: SavedJob
CREATE UNIQUE INDEX "SavedJob_workerId_jobPostId_key" ON "SavedJob"("workerId", "jobPostId");
CREATE INDEX "SavedJob_workerId_idx" ON "SavedJob"("workerId");
CREATE INDEX "SavedJob_jobPostId_idx" ON "SavedJob"("jobPostId");

-- Foreign keys: SavedJob
-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/13-category.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: category
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: Category
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isUserSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "submittedBy" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);


-- Indexes: Category
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- Foreign keys: Category
-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/03-worker.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: worker
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: WorkerProfile
CREATE TABLE "WorkerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "hourlyRate" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "yearsExperience" INTEGER NOT NULL DEFAULT 0,
    "serviceRadius" INTEGER NOT NULL DEFAULT 25,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "idDocument" TEXT,
    "videoIntroUrl" TEXT,
    "backgroundCheck" BOOLEAN NOT NULL DEFAULT false,
    "totalEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "responseRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "weeklyRate" DOUBLE PRECISION,
    "monthlyRate" DOUBLE PRECISION,
    "yearlyRate" DOUBLE PRECISION,
    "customRate" DOUBLE PRECISION,
    "customRateLabel" TEXT,
    "pricingNote" TEXT,
    "profileCurrency" TEXT DEFAULT 'USD',
    "dailyRate" DOUBLE PRECISION,

    -- ── Worker debt (added: written by dispute.controller.js, read by worker/admin dashboards) ──
    "debtBalance"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debtCreatedAt"  TIMESTAMP(3),
    "debtForgivenAt" TIMESTAMP(3),
    "debtReason"     TEXT,

    -- ── Verification metadata (added: written by verification.controller.js, read everywhere) ──
    "idType"                TEXT,        -- "NATIONAL_ID" | "PASSPORT" | ...
    "idNumber"              TEXT,
    "idDateOfBirth"         TIMESTAMP(3),
    "idNationality"         TEXT,
    "submittedAt"           TIMESTAMP(3),
    "reviewedAt"            TIMESTAMP(3),
    "reviewedById"          TEXT,
    "rejectionReason"       TEXT,
    "backgroundCheckAt"     TIMESTAMP(3),
    "backgroundCheckedById" TEXT,

    CONSTRAINT "WorkerProfile_pkey" PRIMARY KEY ("id")
);


-- Indexes: WorkerProfile
CREATE UNIQUE INDEX "WorkerProfile_userId_key" ON "WorkerProfile"("userId");

-- Foreign keys: WorkerProfile
-- AddForeignKey
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_backgroundCheckedById_fkey" FOREIGN KEY ("backgroundCheckedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: Portfolio
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Portfolio
-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: Certification
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "documentUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- ── Verification metadata (added: written by verification.controller.js, read everywhere) ──
    "verifiedAt"      TIMESTAMP(3),
    "verifiedById"    TEXT,
    "rejectionReason" TEXT,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Certification
-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: Availability
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Availability
-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: WorkerCategory
CREATE TABLE "WorkerCategory" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkerCategory_pkey" PRIMARY KEY ("id")
);


-- Indexes: WorkerCategory
CREATE UNIQUE INDEX "WorkerCategory_workerProfileId_categoryId_key"
    ON "WorkerCategory"("workerProfileId", "categoryId");

-- Foreign keys: WorkerCategory
-- AddForeignKey
ALTER TABLE "WorkerCategory" ADD CONSTRAINT "WorkerCategory_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCategory" ADD CONSTRAINT "WorkerCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/04-hirer.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: hirer
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: HirerProfile
CREATE TABLE "HirerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT,
    "companySize" TEXT,
    "website" TEXT,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalHires" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    -- ── VERIFICATION (added: written by verification.controller.js,
    --    read by hirer.controller.js getMyHirerProfile / getHirerProfile) ──
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verificationType"   TEXT,               -- "INDIVIDUAL" | "BUSINESS"
    "idType"             TEXT,
    "idNumber"           TEXT,
    "idDocument"         TEXT,
    "companyRegNumber"   TEXT,
    "companyCountry"     TEXT,
    "submittedAt"        TIMESTAMP(3),
    "reviewedAt"         TIMESTAMP(3),
    "reviewedById"       TEXT,
    "rejectionReason"    TEXT,

    CONSTRAINT "HirerProfile_pkey" PRIMARY KEY ("id")
);


-- Indexes: HirerProfile
CREATE UNIQUE INDEX "HirerProfile_userId_key" ON "HirerProfile"("userId");

-- Foreign keys: HirerProfile
-- AddForeignKey
ALTER TABLE "HirerProfile" ADD CONSTRAINT "HirerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirerProfile" ADD CONSTRAINT "HirerProfile_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/05-booking.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: booking
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: Booking
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "estimatedHours" DOUBLE PRECISION,
    "agreedRate" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "completedAt" TIMESTAMP(3),
    "quantity" INTEGER DEFAULT 1,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "custom_label" TEXT,
    "emergencyContact" TEXT,
    "sosActivatedAt" TIMESTAMP(3),
    "sosLatitude" DOUBLE PRECISION,
    "sosLongitude" DOUBLE PRECISION,
    "sosResolvedAt" TIMESTAMP(3),
    "insuranceRef" TEXT,
    "insurancePlan" TEXT,
    "insurancePaidAt" TIMESTAMP(3),
    "estimatedUnit" TEXT DEFAULT 'hours',
    "estimatedValue" TEXT,
    "isNegotiated" BOOLEAN NOT NULL DEFAULT false,
    "negotiatedRate" DOUBLE PRECISION,
    "negotiationNote" TEXT,
    "jobType" TEXT,
    "locationType" TEXT,
    "requirements" TEXT,
    "responsibilities" TEXT,
    "disputeReason" TEXT,
    "disputeDescription" TEXT,
    "disputeEvidence" TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- ── Source & linkage (added: written/read by booking.controller.js
    --    createBookingFromJobPost, getJobPostBookingDraft) ──
    "source"             "BookingSource" NOT NULL DEFAULT 'DIRECT',
    "jobPostId"          TEXT,
    "selectedRateOption" TEXT,   -- "budget" | "salaryAmount" | "salaryMin" | "salaryMax" | "salaryText"
    "jobRateSnapshot"    JSONB,  -- snapshot of job price fields at booking time

    -- ── Refund counters (added: read by booking.controller.js getBooking,
    --    written by refund.controller.js / dispute.controller.js) ──
    "refundCount"   INTEGER NOT NULL DEFAULT 0,
    "totalRefunded" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Booking
-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Booking → JobPost: onDelete SET NULL (matches schema.prisma @relation(..., onDelete: SetNull))
-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: Review
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "giverId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,

    -- ── Added: written by seed-test-accounts.js and review.controller.js,
    --    read by every `include: { reviews: true }` (booking.controller.js getBooking) ──
    "type"      TEXT,                                        -- "WORKER" | "HIRER"
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);


-- Indexes: Review
CREATE UNIQUE INDEX "Review_bookingId_giverId_key" ON "Review"("bookingId", "giverId");

-- Foreign keys: Review
-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: Conversation
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);


-- Indexes: Conversation
CREATE UNIQUE INDEX "Conversation_bookingId_key" ON "Conversation"("bookingId");

-- Foreign keys: Conversation
-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: ConversationUser
CREATE TABLE "ConversationUser" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ConversationUser_pkey" PRIMARY KEY ("id")
);


-- Indexes: ConversationUser
CREATE UNIQUE INDEX "ConversationUser_conversationId_userId_key"
    ON "ConversationUser"("conversationId", "userId");

-- Foreign keys: ConversationUser
-- AddForeignKey
ALTER TABLE "ConversationUser" ADD CONSTRAINT "ConversationUser_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationUser" ADD CONSTRAINT "ConversationUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: Message
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fileUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Message
-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: VideoCall
CREATE TABLE "VideoCall" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoCall_pkey" PRIMARY KEY ("id")
);


-- Indexes: VideoCall
CREATE UNIQUE INDEX "VideoCall_bookingId_key" ON "VideoCall"("bookingId");
CREATE UNIQUE INDEX "VideoCall_roomId_key"    ON "VideoCall"("roomId");

-- Foreign keys: VideoCall
-- AddForeignKey
ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/06-payment.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: payment
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: Payment
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "platformFee" DOUBLE PRECISION NOT NULL,
    "workerPayout" DOUBLE PRECISION NOT NULL,
    "workerCurrency" TEXT,
    "workerPayoutLocal" DOUBLE PRECISION,
    "exchangeRate" DOUBLE PRECISION DEFAULT 1,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "escrowReleasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bankName" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "bankTransferRef" TEXT,
    "bankTransferProof" TEXT,
    "cryptoNetwork" TEXT,
    "cryptoTxHash" TEXT,
    "cryptoWallet" TEXT,
    "cryptoAmount" DOUBLE PRECISION,
    "cryptoCurrency" TEXT,
    "feePhase" INTEGER DEFAULT 1,
    "notes" TEXT,
    "referralDeduct" DOUBLE PRECISION DEFAULT 0,
    "walletPaymentId" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Payment
-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/07-refund.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: refund
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: Refund
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "workerId" TEXT,
    "adminId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "platformFeeRefunded" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workerAmountDeducted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refundType" "RefundType" NOT NULL DEFAULT 'FULL',
    "percentage" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "adminNotes" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    -- ── Added: link back to the Dispute that generated this refund (if any).
    --    Read by refund.controller.js (`finalRefund.disputeId`, `include: { dispute }`)
    --    and admin.refund.controller.js (`include: { dispute }`).
    --    FK deferred to 99-final-fks.sql because Refund is created before Dispute. ──
    "disputeId" TEXT,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);


-- Indexes: Refund
CREATE UNIQUE INDEX "Refund_reference_key"  ON "Refund"("reference");
CREATE UNIQUE INDEX "Refund_disputeId_key"  ON "Refund"("disputeId");
CREATE INDEX        IF NOT EXISTS "Refund_bookingId_idx"  ON "Refund"("bookingId");
CREATE INDEX        IF NOT EXISTS "Refund_paymentId_idx"  ON "Refund"("paymentId");
CREATE INDEX        IF NOT EXISTS "Refund_hirerId_idx"    ON "Refund"("hirerId");
CREATE INDEX        IF NOT EXISTS "Refund_workerId_idx"   ON "Refund"("workerId");
CREATE INDEX        IF NOT EXISTS "Refund_adminId_idx"    ON "Refund"("adminId");
CREATE INDEX        IF NOT EXISTS "Refund_status_idx"     ON "Refund"("status");
CREATE INDEX        IF NOT EXISTS "Refund_reference_idx"  ON "Refund"("reference");
CREATE INDEX        IF NOT EXISTS "Refund_createdAt_idx"  ON "Refund"("createdAt" DESC);

-- Foreign keys: Refund
-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- NOTE: FK Refund.disputeId → Dispute(id) is added in 99-final-fks.sql
--       because Refund is created before Dispute.
-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/08-hirerWallet.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: hirerWallet
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: HirerWallet
CREATE TABLE "HirerWallet" (
    "id" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeposited" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWithdrawn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRefunded" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTransactionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirerWallet_pkey" PRIMARY KEY ("id")
);


-- Indexes: HirerWallet
CREATE UNIQUE INDEX "HirerWallet_hirerId_currency_key" ON "HirerWallet"("hirerId", "currency");
CREATE INDEX "HirerWallet_hirerId_idx" ON "HirerWallet"("hirerId");
CREATE INDEX "HirerWallet_currency_idx" ON "HirerWallet"("currency");
CREATE INDEX "HirerWallet_createdAt_idx" ON "HirerWallet"("createdAt");

-- Foreign keys: HirerWallet
-- AddForeignKey
ALTER TABLE "HirerWallet" ADD CONSTRAINT "HirerWallet_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: HirerTransaction
CREATE TABLE "HirerTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "balanceBefore" DOUBLE PRECISION,
    "balanceAfter" DOUBLE PRECISION,
    "completedAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentId" TEXT,

    CONSTRAINT "HirerTransaction_pkey" PRIMARY KEY ("id")
);


-- Indexes: HirerTransaction
CREATE UNIQUE INDEX "HirerTransaction_reference_key" ON "HirerTransaction"("reference");
CREATE INDEX "HirerTransaction_walletId_idx" ON "HirerTransaction"("walletId");
CREATE INDEX "HirerTransaction_hirerId_idx" ON "HirerTransaction"("hirerId");
CREATE INDEX "HirerTransaction_reference_idx" ON "HirerTransaction"("reference");
CREATE INDEX "HirerTransaction_status_idx" ON "HirerTransaction"("status");
CREATE INDEX "HirerTransaction_type_idx" ON "HirerTransaction"("type");
CREATE INDEX "HirerTransaction_createdAt_idx" ON "HirerTransaction"("createdAt");

-- Foreign keys: HirerTransaction
-- AddForeignKey
ALTER TABLE "HirerTransaction" ADD CONSTRAINT "HirerTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "HirerWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "HirerTransaction" ADD CONSTRAINT "HirerTransaction_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "HirerTransaction" ADD CONSTRAINT "HirerTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: HirerWithdrawal
CREATE TABLE "HirerWithdrawal" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "bankCode" TEXT,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirerWithdrawal_pkey" PRIMARY KEY ("id")
);


-- Indexes: HirerWithdrawal
CREATE UNIQUE INDEX "HirerWithdrawal_reference_key" ON "HirerWithdrawal"("reference");
CREATE INDEX "HirerWithdrawal_walletId_idx" ON "HirerWithdrawal"("walletId");
CREATE INDEX "HirerWithdrawal_hirerId_idx" ON "HirerWithdrawal"("hirerId");
CREATE INDEX "HirerWithdrawal_reference_idx" ON "HirerWithdrawal"("reference");
CREATE INDEX "HirerWithdrawal_status_idx" ON "HirerWithdrawal"("status");
CREATE INDEX "HirerWithdrawal_createdAt_idx" ON "HirerWithdrawal"("createdAt");

-- Foreign keys: HirerWithdrawal
-- AddForeignKey
ALTER TABLE "HirerWithdrawal" ADD CONSTRAINT "HirerWithdrawal_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "HirerWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "HirerWithdrawal" ADD CONSTRAINT "HirerWithdrawal_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: HirerFundingAttempt
CREATE TABLE "HirerFundingAttempt" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "provider" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INITIATED',
    "redirectUrl" TEXT,
    "callbackData" JSONB,
    "paymentLink" TEXT,
    "transactionId" TEXT,
    "meta" JSONB,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirerFundingAttempt_pkey" PRIMARY KEY ("id")
);


-- Indexes: HirerFundingAttempt
CREATE UNIQUE INDEX "HirerFundingAttempt_providerRef_key" ON "HirerFundingAttempt"("providerRef");
CREATE INDEX "HirerFundingAttempt_walletId_idx" ON "HirerFundingAttempt"("walletId");
CREATE INDEX "HirerFundingAttempt_hirerId_idx" ON "HirerFundingAttempt"("hirerId");
CREATE INDEX "HirerFundingAttempt_providerRef_idx" ON "HirerFundingAttempt"("providerRef");
CREATE INDEX "HirerFundingAttempt_status_idx" ON "HirerFundingAttempt"("status");
CREATE INDEX "HirerFundingAttempt_createdAt_idx" ON "HirerFundingAttempt"("createdAt");

-- Foreign keys: HirerFundingAttempt
-- AddForeignKey
ALTER TABLE "HirerFundingAttempt" ADD CONSTRAINT "HirerFundingAttempt_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "HirerWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "HirerFundingAttempt" ADD CONSTRAINT "HirerFundingAttempt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "HirerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "HirerFundingAttempt" ADD CONSTRAINT "HirerFundingAttempt_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: WalletTransaction
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "description" TEXT NOT NULL,
    "referralId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: WalletTransaction
-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: Withdrawal
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "method" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "failureNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);


-- Indexes: Withdrawal
CREATE UNIQUE INDEX "Withdrawal_reference_key" ON "Withdrawal"("reference");

-- Foreign keys: Withdrawal
-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/09-adminLog.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: adminLog
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "targetType" "AuditTargetType" NOT NULL,
    "targetId" TEXT,
    "description" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "meta" JSONB,
    "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);


-- Indexes: AuditLog
CREATE INDEX "AuditLog_adminId_idx" ON "AuditLog"("adminId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);
CREATE INDEX "AuditLog_result_idx" ON "AuditLog"("result");

-- Foreign keys: AuditLog
-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: Report
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT,
    "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "actionTaken" "ReportAction",
    "reviewedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);


-- Indexes: Report
CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key" ON "Report"("reporterId", "targetType", "targetId");
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");
CREATE INDEX "Report_status_idx" ON "Report"("status");
CREATE INDEX "Report_reporterId_idx" ON "Report"("reporterId");
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt" DESC);

-- Foreign keys: Report
-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: AppSettings
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);


-- Indexes: AppSettings
CREATE UNIQUE INDEX "AppSettings_key_key" ON "AppSettings"("key");
CREATE INDEX "AppSettings_key_idx" ON "AppSettings"("key");


-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/10-job.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: job
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: JobPost
CREATE TABLE "JobPost" (
    "id" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "estimatedHours" DOUBLE PRECISION,
    "budget" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "notes" TEXT,
    "status" "JobPostStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "estimatedUnit" TEXT DEFAULT 'hours',
    "estimatedValue" TEXT,
    "jobType" "JobType" NOT NULL DEFAULT 'FULL_TIME',
    "locationType" "LocationType" NOT NULL DEFAULT 'REMOTE',
    "budgetType" "BudgetType" NOT NULL DEFAULT 'FIXED',
    "durationType" "DurationType" NOT NULL DEFAULT 'HOURS',
    "durationValue" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicationUrl" TEXT,
    "sourcePlatform" TEXT,
    "applicationEmail" TEXT,
    "applicationWhatsApp" TEXT,
    "applicationPhone" TEXT,
    "minQualification" TEXT,
    "experienceLevel" TEXT,
    "experienceLength" TEXT,
    "languageRequirement" TEXT DEFAULT 'English',
    "workingHours" TEXT,
    "applicantLocation" TEXT,
    "responsibilities" TEXT,
    "requirements" TEXT,
    "expiryDate" TIMESTAMP(3),
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "postedByAdminId" TEXT,
    "companyName" TEXT,
    "salaryText" TEXT,
    "salaryAmount" DOUBLE PRECISION,
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "salaryCurrency" TEXT,
    "salaryPeriod" "SalaryPeriod",
    "educationLevel" "EducationLevel",

    CONSTRAINT "JobPost_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: JobPost
-- AddForeignKey
ALTER TABLE "JobPost" ADD CONSTRAINT "JobPost_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "JobPost" ADD CONSTRAINT "JobPost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "JobPost" ADD CONSTRAINT "JobPost_postedByAdminId_fkey" FOREIGN KEY ("postedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: JobCategory
CREATE TABLE "JobCategory" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "JobCategory_pkey" PRIMARY KEY ("id")
);


-- Indexes: JobCategory
CREATE UNIQUE INDEX "JobCategory_jobId_categoryId_key" ON "JobCategory"("jobId", "categoryId");

-- Foreign keys: JobCategory
-- AddForeignKey
ALTER TABLE "JobCategory" ADD CONSTRAINT "JobCategory_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "JobCategory" ADD CONSTRAINT "JobCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: JobApplication
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "message" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);


-- Indexes: JobApplication
CREATE UNIQUE INDEX "JobApplication_jobPostId_workerId_key" ON "JobApplication"("jobPostId", "workerId");

-- Foreign keys: JobApplication
-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: ExternalJobClick
CREATE TABLE "ExternalJobClick" (
    "id" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalJobClick_pkey" PRIMARY KEY ("id")
);


-- Indexes: ExternalJobClick
CREATE UNIQUE INDEX "ExternalJobClick_jobPostId_userId_type_key" ON "ExternalJobClick"("jobPostId", "userId", "type");
CREATE INDEX "ExternalJobClick_jobPostId_idx" ON "ExternalJobClick"("jobPostId");
CREATE INDEX "ExternalJobClick_userId_idx" ON "ExternalJobClick"("userId");
CREATE INDEX "ExternalJobClick_type_idx" ON "ExternalJobClick"("type");

-- Foreign keys: ExternalJobClick
-- AddForeignKey
ALTER TABLE "ExternalJobClick" ADD CONSTRAINT "ExternalJobClick_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ExternalJobClick" ADD CONSTRAINT "ExternalJobClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/11-dispute.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: dispute
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql, 05-booking.sql, 07-refund.sql
-- ============================================================

-- Table: Dispute
CREATE TABLE "Dispute" (
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
CREATE INDEX "Dispute_bookingId_idx"   ON "Dispute"("bookingId");
CREATE INDEX "Dispute_raisedById_idx"  ON "Dispute"("raisedById");
CREATE INDEX "Dispute_againstId_idx"   ON "Dispute"("againstId");
CREATE INDEX "Dispute_status_idx"      ON "Dispute"("status");
CREATE INDEX "Dispute_createdAt_idx"   ON "Dispute"("createdAt" DESC);

-- Foreign keys: Dispute
-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_againstId_fkey" FOREIGN KEY ("againstId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- NOTE: The FK from Refund.disputeId → Dispute(id) is declared in
--       99-final-fks.sql because Refund is created before Dispute.
-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/12-workerDebt.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: workerDebt
-- Serves: admin.debt.controller.js
--         worker.refund.controller.js (reads via Refund.workerDebts)
--         dispute.controller.js + refund.service.js (writers)
-- Depends on: 00-init.sql, 01-enums.sql, 02-auth.sql, 03-worker.sql, 07-refund.sql
-- ============================================================

-- Table: WorkerDebt
-- Tracks amounts a worker owes the platform. Created when a dispute refund
-- cannot be clawed back from the worker's available balance because the money
-- was already withdrawn. Auto-deducted from subsequent payouts (FIFO) until
-- CLEARED, or manually resolved by an admin (FORGIVEN / COLLECTION).
CREATE TABLE "WorkerDebt" (
    "id"              TEXT NOT NULL,
    "workerId"        TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,

    -- Amounts
    "amount"         DOUBLE PRECISION NOT NULL,                 -- original debt
    "amountPaid"     DOUBLE PRECISION NOT NULL DEFAULT 0,       -- auto-deducted so far
    "amountForgiven" DOUBLE PRECISION NOT NULL DEFAULT 0,       -- admin-forgiven portion
    "currency"       TEXT             NOT NULL DEFAULT 'NGN',

    -- Reason
    "reason"     TEXT NOT NULL,   -- "DISPUTE_REFUND" | "CHARGEBACK" | "FRAUD_REVERSAL" | "OTHER"
    "reasonNote" TEXT,

    -- Source refund (soft ref — FK deferred to 99-final-fks.sql)
    "refundId" TEXT,

    -- Status lifecycle: OUTSTANDING → CLEARED | FORGIVEN | COLLECTION
    "status" TEXT NOT NULL DEFAULT 'OUTSTANDING',

    -- Lifecycle timestamps
    "clearedAt"   TIMESTAMP(3),
    "forgivenAt"  TIMESTAMP(3),
    "forgivenById" TEXT,

    "markedCollectionAt"   TIMESTAMP(3),
    "markedCollectionById" TEXT,

    -- Free-form context (forgivenHistory, collectionNote, lastDeductionAt, etc.)
    "meta" JSONB,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerDebt_pkey" PRIMARY KEY ("id")
);


-- Indexes: WorkerDebt
CREATE INDEX "WorkerDebt_workerId_idx"        ON "WorkerDebt"("workerId");
CREATE INDEX "WorkerDebt_workerProfileId_idx" ON "WorkerDebt"("workerProfileId");
CREATE INDEX "WorkerDebt_status_idx"          ON "WorkerDebt"("status");
CREATE INDEX "WorkerDebt_reason_idx"          ON "WorkerDebt"("reason");
CREATE INDEX "WorkerDebt_createdAt_idx"       ON "WorkerDebt"("createdAt" DESC);

-- Foreign keys: WorkerDebt
-- AddForeignKey
ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_forgivenById_fkey" FOREIGN KEY ("forgivenById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_markedCollectionById_fkey" FOREIGN KEY ("markedCollectionById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- NOTE: WorkerDebt.refundId → Refund(id) FK lives in 99-final-fks.sql
--       because Refund is created before WorkerDebt.
-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/14-campaign.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: campaign
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: CampaignReferral
CREATE TABLE "CampaignReferral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "submissionId" TEXT,
    "hasDownloadedApp" BOOLEAN NOT NULL DEFAULT true,
    "hasSetupProfile" BOOLEAN NOT NULL DEFAULT false,
    "hasFollowedFb" BOOLEAN NOT NULL DEFAULT false,
    "hasFollowedIg" BOOLEAN NOT NULL DEFAULT false,
    "hasFollowedTt" BOOLEAN NOT NULL DEFAULT false,
    "fbScreenshotUrl" TEXT,
    "igScreenshotUrl" TEXT,
    "ttScreenshotUrl" TEXT,
    "status" "CampaignReferralStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "rewardAmount" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "tasksCompletedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignReferral_pkey" PRIMARY KEY ("id")
);


-- Indexes: CampaignReferral
CREATE UNIQUE INDEX "CampaignReferral_referredId_key" ON "CampaignReferral"("referredId");

-- Foreign keys: CampaignReferral
-- AddForeignKey
ALTER TABLE "CampaignReferral" ADD CONSTRAINT "CampaignReferral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CampaignReferral" ADD CONSTRAINT "CampaignReferral_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: CampaignSubmission
CREATE TABLE "CampaignSubmission" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "submissionDate" TEXT NOT NULL,
    "totalSubmitted" INTEGER NOT NULL DEFAULT 0,
    "totalApproved" INTEGER NOT NULL DEFAULT 0,
    "totalRejected" INTEGER NOT NULL DEFAULT 0,
    "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "CampaignSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignSubmission_pkey" PRIMARY KEY ("id")
);


-- Indexes: CampaignSubmission
CREATE UNIQUE INDEX "CampaignSubmission_referrerId_submissionDate_key" ON "CampaignSubmission"("referrerId", "submissionDate");

-- Foreign keys: CampaignSubmission
-- AddForeignKey
ALTER TABLE "CampaignSubmission" ADD CONSTRAINT "CampaignSubmission_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: CampaignTransaction
CREATE TABLE "CampaignTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "description" TEXT NOT NULL,
    "referralId" TEXT,
    "submissionId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignTransaction_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: CampaignTransaction
-- AddForeignKey
ALTER TABLE "CampaignTransaction" ADD CONSTRAINT "CampaignTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: CampaignWithdrawal
CREATE TABLE "CampaignWithdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignWithdrawal_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: CampaignWithdrawal
-- AddForeignKey
ALTER TABLE "CampaignWithdrawal" ADD CONSTRAINT "CampaignWithdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/18-feedback.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: feedback
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: Feedback
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "tags" TEXT[],
    "screenUrl" TEXT,
    "browserInfo" TEXT,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Feedback
-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/23-notification.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: notification
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: Notification
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "icon" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);


-- Indexes: Notification
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- Foreign keys: Notification
-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/24-post.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: post
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: Post
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "type" "PostType" NOT NULL DEFAULT 'GENERAL',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "repostOfId" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Post
-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_repostOfId_fkey" FOREIGN KEY ("repostOfId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: PostReaction
CREATE TABLE "PostReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReactionType" NOT NULL DEFAULT 'LIKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostReaction_pkey" PRIMARY KEY ("id")
);


-- Indexes: PostReaction
CREATE UNIQUE INDEX "PostReaction_postId_userId_key" ON "PostReaction"("postId", "userId");

-- Foreign keys: PostReaction
-- AddForeignKey
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: PostComment
CREATE TABLE "PostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostComment_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: PostComment
-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PostComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/26-referral.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: referral
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: Referral
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "referredRole" "Role" NOT NULL,
    "referrerBonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refereePerk" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "paidAt" TIMESTAMP(3),
    "qualifiedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);


-- Indexes: Referral
CREATE UNIQUE INDEX "Referral_referredId_key" ON "Referral"("referredId");

-- Foreign keys: Referral
-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/30-subscription.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: subscription
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: Subscription
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "role" "SubscriptionRole" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "reference" TEXT,
    "stripeSessionId" TEXT,
    "stripeSubscriptionId" TEXT,
    "paystackSubscriptionCode" TEXT,
    "paystackCustomerCode" TEXT,
    "paystackPlanCode" TEXT,
    "paystackEmailToken" TEXT,
    "nextPaymentDate" TIMESTAMP(3),
    "paystackStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Subscription
-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: PromoCode
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" TEXT NOT NULL DEFAULT 'PERCENT',
    "discountValue" DOUBLE PRECISION NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "applicableTo" TEXT,
    "minPlanAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);


-- Indexes: PromoCode
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- Foreign keys: PromoCode
-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: PromoCodeUsage
CREATE TABLE "PromoCodeUsage" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "discountAmt" DOUBLE PRECISION NOT NULL,
    "originalAmt" DOUBLE PRECISION NOT NULL,
    "finalAmt" DOUBLE PRECISION NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeUsage_pkey" PRIMARY KEY ("id")
);


-- Indexes: PromoCodeUsage
CREATE UNIQUE INDEX "PromoCodeUsage_userId_promoCodeId_key" ON "PromoCodeUsage"("userId", "promoCodeId");

-- Foreign keys: PromoCodeUsage
-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: FeaturedListing
CREATE TABLE "FeaturedListing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'SEARCH_TOP',
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reference" TEXT NOT NULL,
    "stripeSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,

    CONSTRAINT "FeaturedListing_pkey" PRIMARY KEY ("id")
);


-- Indexes: FeaturedListing
CREATE UNIQUE INDEX "FeaturedListing_reference_key" ON "FeaturedListing"("reference");

-- Foreign keys: FeaturedListing
-- AddForeignKey
ALTER TABLE "FeaturedListing" ADD CONSTRAINT "FeaturedListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FeaturedListing" ADD CONSTRAINT "FeaturedListing_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/31-survey.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: survey
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: survey_responses
CREATE TABLE "survey_responses" (
    "id" TEXT NOT NULL,
    "role" TEXT,
    "industry" TEXT,
    "experience_level" TEXT,
    "biggest_challenge" TEXT,
    "desired_feature" TEXT,
    "biggest_concern" TEXT,
    "hear_about" TEXT,
    "email" TEXT,
    "full_name" TEXT,
    "phone_number" TEXT,
    "location" TEXT,
    "additional_feedback" TEXT,
    "rating" INTEGER DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);


-- Indexes: survey_responses
CREATE INDEX "survey_responses_email_idx" ON "survey_responses"("email");
CREATE INDEX "survey_responses_created_at_idx" ON "survey_responses"("created_at");
CREATE INDEX "survey_responses_status_idx" ON "survey_responses"("status");


-- ════════════════════════════════════════════════════════════
-- db-scripts/controllers/34-waitlist.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Controller: waitlist
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: waitlist_entries
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ip_address" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT,
    "postal_code" TEXT,
    "device_type" TEXT,
    "device_brand" TEXT,
    "device_model" TEXT,
    "os_name" TEXT,
    "os_version" TEXT,
    "browser_name" TEXT,
    "browser_version" TEXT,
    "user_agent" TEXT,
    "referral_code" TEXT,
    "referred_by" TEXT,
    "token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "unlocked_benefits" TEXT[],
    "benefit_unlocked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);


-- Indexes: waitlist_entries
CREATE UNIQUE INDEX "waitlist_entries_email_key" ON "waitlist_entries"("email");
CREATE UNIQUE INDEX "waitlist_entries_referral_code_key" ON "waitlist_entries"("referral_code");
CREATE UNIQUE INDEX "waitlist_entries_token_key" ON "waitlist_entries"("token");
CREATE INDEX "waitlist_entries_email_idx" ON "waitlist_entries"("email");
CREATE INDEX "waitlist_entries_status_idx" ON "waitlist_entries"("status");
CREATE INDEX "waitlist_entries_country_idx" ON "waitlist_entries"("country");
CREATE INDEX "waitlist_entries_device_type_idx" ON "waitlist_entries"("device_type");
CREATE INDEX "waitlist_entries_created_at_idx" ON "waitlist_entries"("created_at");

-- Table: waitlist_campaigns
CREATE TABLE "waitlist_campaigns" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "preview_text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sent_at" TIMESTAMP(3),
    "scheduled_for" TIMESTAMP(3),
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "opened_count" INTEGER NOT NULL DEFAULT 0,
    "clicked_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_campaigns_pkey" PRIMARY KEY ("id")
);


-- Indexes: waitlist_campaigns
CREATE INDEX "waitlist_campaigns_status_idx" ON "waitlist_campaigns"("status");
CREATE INDEX "waitlist_campaigns_sent_at_idx" ON "waitlist_campaigns"("sent_at");

-- Table: waitlist_email_logs
CREATE TABLE "waitlist_email_logs" (
    "id" TEXT NOT NULL,
    "waitlist_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "email" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "opened_at" TIMESTAMP(3),
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "clicked_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT,

    CONSTRAINT "waitlist_email_logs_pkey" PRIMARY KEY ("id")
);


-- Indexes: waitlist_email_logs
CREATE INDEX "waitlist_email_logs_waitlist_id_idx" ON "waitlist_email_logs"("waitlist_id");
CREATE INDEX "waitlist_email_logs_campaign_id_idx" ON "waitlist_email_logs"("campaign_id");
CREATE INDEX "waitlist_email_logs_type_idx" ON "waitlist_email_logs"("type");
CREATE INDEX "waitlist_email_logs_sent_at_idx" ON "waitlist_email_logs"("sent_at");


-- ════════════════════════════════════════════════════════════
-- db-scripts/99-final-fks.sql
-- ════════════════════════════════════════════════════════════
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
-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────
-- CampaignReferral → CampaignSubmission
-- (both defined in 14-campaign.sql, but CampaignReferral is
--  created first inside that file)
-- ────────────────────────────────────────────────────────────
-- AddForeignKey
ALTER TABLE "CampaignReferral" ADD CONSTRAINT "CampaignReferral_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CampaignSubmission"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────
-- Refund → Dispute
-- (Refund defined in 07-refund.sql, Dispute in 11-dispute.sql —
--  Refund comes first alphabetically and structurally)
-- ────────────────────────────────────────────────────────────
-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────
-- WorkerDebt → Refund
-- (WorkerDebt defined in 12-workerDebt.sql, Refund in 07-refund.sql —
--  WorkerDebt references Refund, so the FK must be added after both
--  tables exist)
-- ────────────────────────────────────────────────────────────
-- AddForeignKey
ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;