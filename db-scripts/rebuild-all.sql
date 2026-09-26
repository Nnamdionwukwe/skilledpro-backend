-- ============================================================
-- SkilledProz Backend — Full Schema (single-file build)
-- Regenerated: 2026-09-26
-- ============================================================
-- This file is a self-contained snapshot of the entire
-- database schema. Paste it into any fresh Postgres to
-- create every table, index, and foreign key in one go.
--
-- For an incremental / modular build, use rebuild-all.sql
-- instead (which sources the individual controller files).
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- STEP 1: Extensions
-- ════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ════════════════════════════════════════════════════════════
-- STEP 2: Enums
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('HIRER', 'WORKER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- NEW: added in the booking pass
DO $$ BEGIN
  CREATE TYPE "BookingSource" AS ENUM ('DIRECT', 'JOB_POST');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'HELD', 'RELEASED', 'REFUNDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "JobPostStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReferralTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'DIAMOND');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'CONVERTED', 'REWARDED', 'EXPIRED', 'FLAGGED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CampaignReferralStatus" AS ENUM ('PENDING', 'TASKS_DONE', 'SUBMITTED', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CampaignSubmissionStatus" AS ENUM ('PENDING', 'REVIEWING', 'APPROVED', 'PARTIAL', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReportType" AS ENUM ('USER', 'JOB_POST', 'POST', 'REVIEW', 'BOOKING', 'MESSAGE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'FAKE_PROFILE', 'INAPPROPRIATE_CONTENT', 'FRAUD', 'HARASSMENT', 'SCAM', 'MISLEADING_INFORMATION', 'FAKE_REVIEWS', 'UNDERAGE_USER', 'HATE_SPEECH', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReportAction" AS ENUM ('NO_ACTION', 'WARNING_ISSUED', 'CONTENT_REMOVED', 'USER_SUSPENDED', 'USER_BANNED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- EXPANDED: added REFUND_*, WORKER_DEBT_*, SURVEY_*, DISPUTE_RAISED,
--           DISPUTE_RESOLVED_REFUND, DISPUTE_RESOLVED_RELEASE, DISPUTE_CANCELLED
DO $$ BEGIN
  CREATE TYPE "AuditAction" AS ENUM (
    'USER_BANNED', 'USER_UNBANNED', 'USER_DELETED', 'USER_ROLE_CHANGED',
    'USER_VERIFIED', 'USER_VERIFICATION_REJECTED', 'USER_SUSPENDED',
    'PAYMENT_RELEASED', 'PAYMENT_REFUNDED',
    'PAYMENT_MANUAL_VERIFIED', 'PAYMENT_MANUAL_REJECTED',
    'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED',
    'WORKER_DEBT_CREATED', 'WORKER_DEBT_DEDUCTED',
    'WORKER_DEBT_FORGIVEN', 'WORKER_DEBT_MARKED_COLLECTION',
    'REFUND_APPROVED', 'REFUND_REJECTED', 'REFUND_REVERSED',
    'REFUND_BULK_APPROVED', 'REFUND_BULK_REJECTED',
    'REPORT_REVIEWED', 'REPORT_RESOLVED', 'REPORT_DISMISSED', 'REPORT_BULK_DISMISSED',
    'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DELETED',
    'REVIEW_DELETED', 'JOB_DELETED', 'JOB_STATUS_CHANGED',
    'POST_DELETED', 'COMMENT_DELETED', 'FEATURED_REMOVED',
    'BOOKING_STATUS_CHANGED',
    'DISPUTE_RESOLVED',
    'DISPUTE_RAISED', 'DISPUTE_RESOLVED_REFUND',
    'DISPUTE_RESOLVED_RELEASE', 'DISPUTE_CANCELLED',
    'CAMPAIGN_SUBMISSION_REVIEWED',
    'CAMPAIGN_WITHDRAWAL_APPROVED', 'CAMPAIGN_WITHDRAWAL_REJECTED',
    'REFERRAL_PAYOUT_PROCESSED', 'REFERRAL_FLAGGED',
    'SUBSCRIPTION_CANCELLED',
    'NOTIFICATION_BROADCAST',
    'SURVEY_VIEWED', 'SURVEY_STATUS_UPDATED', 'SURVEY_BULK_DELETED',
    'ADMIN_LOGIN', 'SETTINGS_CHANGED',
    'JOB_CREATED', 'JOB_UPDATED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- EXPANDED: added REFUND and SURVEY
DO $$ BEGIN
  CREATE TYPE "AuditTargetType" AS ENUM (
    'USER', 'PAYMENT', 'WITHDRAWAL', 'BOOKING', 'JOB_POST', 'POST',
    'COMMENT', 'REVIEW', 'CATEGORY', 'REPORT',
    'CAMPAIGN_SUBMISSION', 'CAMPAIGN_WITHDRAWAL',
    'REFERRAL', 'SUBSCRIPTION', 'FEATURED_LISTING',
    'DISPUTE', 'REFUND', 'SURVEY', 'SYSTEM'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SalaryPeriod" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EducationLevel" AS ENUM ('HIGH_SCHOOL', 'DIPLOMA', 'BACHELOR', 'MASTER', 'DOCTORATE', 'CERTIFICATION', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionRole" AS ENUM ('WORKER', 'HIRER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED', 'PENDING');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PostType" AS ENUM ('GENERAL', 'JOB_UPDATE', 'ACHIEVEMENT', 'PORTFOLIO', 'ANNOUNCEMENT', 'HIRING');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReactionType" AS ENUM ('LIKE', 'LOVE', 'INSIGHTFUL', 'CELEBRATE', 'SUPPORT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "JobType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "LocationType" AS ENUM ('REMOTE', 'ON_SITE', 'HYBRID');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BudgetType" AS ENUM ('FIXED', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DurationType" AS ENUM ('HOURS', 'DAYS', 'WEEKS', 'MONTHS', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED', 'REVERSED', 'DISPUTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "RefundType" AS ENUM ('FULL', 'PARTIAL', 'CUSTOM_AMOUNT', 'DISPUTE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- NEW: dispute enums
DO $$ BEGIN
  CREATE TYPE "DisputeStatus" AS ENUM ('PENDING_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_RELEASE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DisputeResolution" AS ENUM ('REFUND', 'RELEASE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DisputeRaisedBy" AS ENUM ('HIRER', 'WORKER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;


-- ════════════════════════════════════════════════════════════
-- STEP 3: Tables (in dependency order)
-- ════════════════════════════════════════════════════════════

-- ─── 02-auth.sql : User ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "User" (
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

    -- NEW: Google OAuth + account lifecycle
    "googleId"     TEXT,
    "authProvider" TEXT    NOT NULL DEFAULT 'LOCAL',
    "avatarCustom" BOOLEAN NOT NULL DEFAULT false,
    "nameCustom"   BOOLEAN NOT NULL DEFAULT false,
    "isPaused"            BOOLEAN NOT NULL DEFAULT false,
    "pausedAt"            TIMESTAMP(3),
    "deletionScheduledAt" TIMESTAMP(3),
    "deletionReason"      TEXT,
    "deletionRequestedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key"        ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key"        ON "User"("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key"     ON "User"("googleId");

ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey"
    FOREIGN KEY ("referredById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 02-user.sql : DeviceToken, SavedWorker, SavedJob ────────
CREATE TABLE IF NOT EXISTS "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceToken_userId_token_key" ON "DeviceToken"("userId", "token");
CREATE INDEX IF NOT EXISTS "DeviceToken_userId_idx" ON "DeviceToken"("userId");
CREATE INDEX IF NOT EXISTS "DeviceToken_token_idx"  ON "DeviceToken"("token");
CREATE INDEX IF NOT EXISTS "DeviceToken_active_idx" ON "DeviceToken"("active");
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SavedWorker" (
    "id" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedWorker_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SavedWorker_hirerId_workerId_key" ON "SavedWorker"("hirerId", "workerId");
CREATE INDEX IF NOT EXISTS "SavedWorker_hirerId_idx"  ON "SavedWorker"("hirerId");
CREATE INDEX IF NOT EXISTS "SavedWorker_workerId_idx" ON "SavedWorker"("workerId");
ALTER TABLE "SavedWorker" ADD CONSTRAINT "SavedWorker_hirerId_fkey"
    FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedWorker" ADD CONSTRAINT "SavedWorker_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SavedJob" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SavedJob_workerId_jobPostId_key" ON "SavedJob"("workerId", "jobPostId");
CREATE INDEX IF NOT EXISTS "SavedJob_workerId_idx"  ON "SavedJob"("workerId");
CREATE INDEX IF NOT EXISTS "SavedJob_jobPostId_idx" ON "SavedJob"("jobPostId");
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SavedJob.jobPostId FK deferred to STEP 4

-- ─── 13-category.sql : Category ──────────────────────────────
CREATE TABLE IF NOT EXISTS "Category" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Category_slug_key" ON "Category"("slug");
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 03-worker.sql : WorkerProfile, Portfolio, Certification,
--                   Availability, WorkerCategory ─────────────
CREATE TABLE IF NOT EXISTS "WorkerProfile" (
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

    -- NEW: worker debt + verification metadata
    "debtBalance"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debtCreatedAt"  TIMESTAMP(3),
    "debtForgivenAt" TIMESTAMP(3),
    "debtReason"     TEXT,
    "idType"                TEXT,
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
CREATE UNIQUE INDEX IF NOT EXISTS "WorkerProfile_userId_key" ON "WorkerProfile"("userId");
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_backgroundCheckedById_fkey"
    FOREIGN KEY ("backgroundCheckedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Portfolio" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_workerProfileId_fkey"
    FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Certification" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "documentUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- NEW: verification metadata
    "verifiedAt"      TIMESTAMP(3),
    "verifiedById"    TEXT,
    "rejectionReason" TEXT,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_workerProfileId_fkey"
    FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_verifiedById_fkey"
    FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Availability" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_workerProfileId_fkey"
    FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "WorkerCategory" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "WorkerCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkerCategory_workerProfileId_categoryId_key"
    ON "WorkerCategory"("workerProfileId", "categoryId");
ALTER TABLE "WorkerCategory" ADD CONSTRAINT "WorkerCategory_workerProfileId_fkey"
    FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerCategory" ADD CONSTRAINT "WorkerCategory_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 04-hirer.sql : HirerProfile ─────────────────────────────
CREATE TABLE IF NOT EXISTS "HirerProfile" (
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

    -- NEW: verification metadata
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verificationType"   TEXT,
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
CREATE UNIQUE INDEX IF NOT EXISTS "HirerProfile_userId_key" ON "HirerProfile"("userId");
ALTER TABLE "HirerProfile" ADD CONSTRAINT "HirerProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HirerProfile" ADD CONSTRAINT "HirerProfile_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 05-booking.sql : Booking, Review, Conversation,
--                    ConversationUser, Message, VideoCall ────
CREATE TABLE IF NOT EXISTS "Booking" (
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

    -- NEW: source & linkage
    "source"             "BookingSource" NOT NULL DEFAULT 'DIRECT',
    "jobPostId"          TEXT,
    "selectedRateOption" TEXT,
    "jobRateSnapshot"    JSONB,

    -- NEW: refund counters
    "refundCount"   INTEGER NOT NULL DEFAULT 0,
    "totalRefunded" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_hirerId_fkey"
    FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Booking.jobPostId FK deferred to STEP 4

CREATE TABLE IF NOT EXISTS "Review" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "giverId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,

    -- NEW: type discriminator + updatedAt
    "type"      TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Review_bookingId_giverId_key" ON "Review"("bookingId", "giverId");
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_giverId_fkey"
    FOREIGN KEY ("giverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_receiverId_fkey"
    FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_bookingId_key" ON "Conversation"("bookingId");
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ConversationUser" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ConversationUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationUser_conversationId_userId_key"
    ON "ConversationUser"("conversationId", "userId");
ALTER TABLE "ConversationUser" ADD CONSTRAINT "ConversationUser_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationUser" ADD CONSTRAINT "ConversationUser_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Message" (
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
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey"
    FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "VideoCall" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "VideoCall_bookingId_key" ON "VideoCall"("bookingId");
CREATE UNIQUE INDEX IF NOT EXISTS "VideoCall_roomId_key"    ON "VideoCall"("roomId");
ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_initiatorId_fkey"
    FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_receiverId_fkey"
    FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 06-payment.sql : Payment ────────────────────────────────
CREATE TABLE IF NOT EXISTS "Payment" (
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
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 07-refund.sql : Refund ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "Refund" (
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

    -- NEW: link back to Dispute
    "disputeId" TEXT,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Refund_reference_key"  ON "Refund"("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "Refund_disputeId_key"  ON "Refund"("disputeId");
CREATE INDEX        IF NOT EXISTS "Refund_bookingId_idx"  ON "Refund"("bookingId");
CREATE INDEX        IF NOT EXISTS "Refund_paymentId_idx"  ON "Refund"("paymentId");
CREATE INDEX        IF NOT EXISTS "Refund_hirerId_idx"    ON "Refund"("hirerId");
CREATE INDEX        IF NOT EXISTS "Refund_workerId_idx"   ON "Refund"("workerId");
CREATE INDEX        IF NOT EXISTS "Refund_adminId_idx"    ON "Refund"("adminId");
CREATE INDEX        IF NOT EXISTS "Refund_status_idx"     ON "Refund"("status");
CREATE INDEX        IF NOT EXISTS "Refund_reference_idx"  ON "Refund"("reference");
CREATE INDEX        IF NOT EXISTS "Refund_createdAt_idx"  ON "Refund"("createdAt" DESC);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_hirerId_fkey"
    FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Refund.disputeId FK deferred to STEP 4

-- ─── 08-hirerWallet.sql ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "HirerWallet" (
    "id" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeposited" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWithdrawn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRefunded" DOUBLE PRECISION NOT NULL DEFAULT 0,   -- NEW
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTransactionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HirerWallet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HirerWallet_hirerId_currency_key" ON "HirerWallet"("hirerId", "currency");
CREATE INDEX IF NOT EXISTS "HirerWallet_hirerId_idx"   ON "HirerWallet"("hirerId");
CREATE INDEX IF NOT EXISTS "HirerWallet_currency_idx"  ON "HirerWallet"("currency");
CREATE INDEX IF NOT EXISTS "HirerWallet_createdAt_idx" ON "HirerWallet"("createdAt");
ALTER TABLE "HirerWallet" ADD CONSTRAINT "HirerWallet_hirerId_fkey"
    FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "HirerTransaction" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "HirerTransaction_reference_key" ON "HirerTransaction"("reference");
CREATE INDEX IF NOT EXISTS "HirerTransaction_walletId_idx"   ON "HirerTransaction"("walletId");
CREATE INDEX IF NOT EXISTS "HirerTransaction_hirerId_idx"    ON "HirerTransaction"("hirerId");
CREATE INDEX IF NOT EXISTS "HirerTransaction_reference_idx"  ON "HirerTransaction"("reference");
CREATE INDEX IF NOT EXISTS "HirerTransaction_status_idx"     ON "HirerTransaction"("status");
CREATE INDEX IF NOT EXISTS "HirerTransaction_type_idx"       ON "HirerTransaction"("type");
CREATE INDEX IF NOT EXISTS "HirerTransaction_createdAt_idx"  ON "HirerTransaction"("createdAt");
ALTER TABLE "HirerTransaction" ADD CONSTRAINT "HirerTransaction_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "HirerWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HirerTransaction" ADD CONSTRAINT "HirerTransaction_hirerId_fkey"
    FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HirerTransaction" ADD CONSTRAINT "HirerTransaction_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "HirerWithdrawal" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "HirerWithdrawal_reference_key" ON "HirerWithdrawal"("reference");
CREATE INDEX IF NOT EXISTS "HirerWithdrawal_walletId_idx"   ON "HirerWithdrawal"("walletId");
CREATE INDEX IF NOT EXISTS "HirerWithdrawal_hirerId_idx"    ON "HirerWithdrawal"("hirerId");
CREATE INDEX IF NOT EXISTS "HirerWithdrawal_reference_idx"  ON "HirerWithdrawal"("reference");
CREATE INDEX IF NOT EXISTS "HirerWithdrawal_status_idx"     ON "HirerWithdrawal"("status");
CREATE INDEX IF NOT EXISTS "HirerWithdrawal_createdAt_idx"  ON "HirerWithdrawal"("createdAt");
ALTER TABLE "HirerWithdrawal" ADD CONSTRAINT "HirerWithdrawal_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "HirerWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HirerWithdrawal" ADD CONSTRAINT "HirerWithdrawal_hirerId_fkey"
    FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "HirerFundingAttempt" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "HirerFundingAttempt_providerRef_key" ON "HirerFundingAttempt"("providerRef");
CREATE INDEX IF NOT EXISTS "HirerFundingAttempt_walletId_idx"    ON "HirerFundingAttempt"("walletId");
CREATE INDEX IF NOT EXISTS "HirerFundingAttempt_hirerId_idx"     ON "HirerFundingAttempt"("hirerId");
CREATE INDEX IF NOT EXISTS "HirerFundingAttempt_providerRef_idx" ON "HirerFundingAttempt"("providerRef");
CREATE INDEX IF NOT EXISTS "HirerFundingAttempt_status_idx"      ON "HirerFundingAttempt"("status");
CREATE INDEX IF NOT EXISTS "HirerFundingAttempt_createdAt_idx"   ON "HirerFundingAttempt"("createdAt");
ALTER TABLE "HirerFundingAttempt" ADD CONSTRAINT "HirerFundingAttempt_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "HirerWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HirerFundingAttempt" ADD CONSTRAINT "HirerFundingAttempt_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "HirerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HirerFundingAttempt" ADD CONSTRAINT "HirerFundingAttempt_hirerId_fkey"
    FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "WalletTransaction" (
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
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Withdrawal" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "Withdrawal_reference_key" ON "Withdrawal"("reference");
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 09-adminLog.sql ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AuditLog" (
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
CREATE INDEX IF NOT EXISTS "AuditLog_adminId_idx"             ON "AuditLog"("adminId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx"              ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx"           ON "AuditLog"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_result_idx"              ON "AuditLog"("result");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Report" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "Report_reporterId_targetType_targetId_key"
    ON "Report"("reporterId", "targetType", "targetId");
CREATE INDEX IF NOT EXISTS "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "Report_status_idx"              ON "Report"("status");
CREATE INDEX IF NOT EXISTS "Report_reporterId_idx"          ON "Report"("reporterId");
CREATE INDEX IF NOT EXISTS "Report_createdAt_idx"           ON "Report"("createdAt" DESC);
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey"
    FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "AppSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AppSettings_key_key" ON "AppSettings"("key");
CREATE INDEX IF NOT EXISTS "AppSettings_key_idx"         ON "AppSettings"("key");

-- ─── 10-job.sql ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "JobPost" (
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
ALTER TABLE "JobPost" ADD CONSTRAINT "JobPost_hirerId_fkey"
    FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobPost" ADD CONSTRAINT "JobPost_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobPost" ADD CONSTRAINT "JobPost_postedByAdminId_fkey"
    FOREIGN KEY ("postedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "JobCategory" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    CONSTRAINT "JobCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "JobCategory_jobId_categoryId_key"
    ON "JobCategory"("jobId", "categoryId");
ALTER TABLE "JobCategory" ADD CONSTRAINT "JobCategory_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobCategory" ADD CONSTRAINT "JobCategory_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "JobApplication" (
    "id" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "message" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "JobApplication_jobPostId_workerId_key"
    ON "JobApplication"("jobPostId", "workerId");
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobPostId_fkey"
    FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ExternalJobClick" (
    "id" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalJobClick_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalJobClick_jobPostId_userId_type_key"
    ON "ExternalJobClick"("jobPostId", "userId", "type");
CREATE INDEX IF NOT EXISTS "ExternalJobClick_jobPostId_idx" ON "ExternalJobClick"("jobPostId");
CREATE INDEX IF NOT EXISTS "ExternalJobClick_userId_idx"    ON "ExternalJobClick"("userId");
CREATE INDEX IF NOT EXISTS "ExternalJobClick_type_idx"      ON "ExternalJobClick"("type");
ALTER TABLE "ExternalJobClick" ADD CONSTRAINT "ExternalJobClick_jobPostId_fkey"
    FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalJobClick" ADD CONSTRAINT "ExternalJobClick_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 11-dispute.sql (NEW) : Dispute ──────────────────────────
CREATE TABLE IF NOT EXISTS "Dispute" (
    "id"        TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "raisedById"   TEXT NOT NULL,
    "raisedByRole" "DisputeRaisedBy" NOT NULL,
    "againstId" TEXT NOT NULL,
    "reason"      TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence"    TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status"                "DisputeStatus"   NOT NULL DEFAULT 'PENDING_REVIEW',
    "previousBookingStatus" "BookingStatus",
    "resolution"   "DisputeResolution",
    "resolvedById" TEXT,
    "resolvedAt"   TIMESTAMP(3),
    "adminNotes"   TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Dispute_bookingId_idx"  ON "Dispute"("bookingId");
CREATE INDEX IF NOT EXISTS "Dispute_raisedById_idx" ON "Dispute"("raisedById");
CREATE INDEX IF NOT EXISTS "Dispute_againstId_idx"  ON "Dispute"("againstId");
CREATE INDEX IF NOT EXISTS "Dispute_status_idx"     ON "Dispute"("status");
CREATE INDEX IF NOT EXISTS "Dispute_createdAt_idx"  ON "Dispute"("createdAt" DESC);
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_raisedById_fkey"
    FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_againstId_fkey"
    FOREIGN KEY ("againstId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 12-workerDebt.sql (NEW) : WorkerDebt ────────────────────
CREATE TABLE IF NOT EXISTS "WorkerDebt" (
    "id"              TEXT NOT NULL,
    "workerId"        TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "amount"         DOUBLE PRECISION NOT NULL,
    "amountPaid"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountForgiven" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency"       TEXT NOT NULL DEFAULT 'NGN',
    "reason"     TEXT NOT NULL,
    "reasonNote" TEXT,
    "refundId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OUTSTANDING',
    "clearedAt"   TIMESTAMP(3),
    "forgivenAt"  TIMESTAMP(3),
    "forgivenById" TEXT,
    "markedCollectionAt"   TIMESTAMP(3),
    "markedCollectionById" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkerDebt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkerDebt_workerId_idx"        ON "WorkerDebt"("workerId");
CREATE INDEX IF NOT EXISTS "WorkerDebt_workerProfileId_idx" ON "WorkerDebt"("workerProfileId");
CREATE INDEX IF NOT EXISTS "WorkerDebt_status_idx"          ON "WorkerDebt"("status");
CREATE INDEX IF NOT EXISTS "WorkerDebt_reason_idx"          ON "WorkerDebt"("reason");
CREATE INDEX IF NOT EXISTS "WorkerDebt_createdAt_idx"       ON "WorkerDebt"("createdAt" DESC);
ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_workerProfileId_fkey"
    FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_forgivenById_fkey"
    FOREIGN KEY ("forgivenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_markedCollectionById_fkey"
    FOREIGN KEY ("markedCollectionById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- WorkerDebt.refundId FK deferred to STEP 4

-- ─── 14-campaign.sql ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CampaignReferral" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignReferral_referredId_key"
    ON "CampaignReferral"("referredId");
ALTER TABLE "CampaignReferral" ADD CONSTRAINT "CampaignReferral_referrerId_fkey"
    FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignReferral" ADD CONSTRAINT "CampaignReferral_referredId_fkey"
    FOREIGN KEY ("referredId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- CampaignReferral.submissionId FK deferred to STEP 4

CREATE TABLE IF NOT EXISTS "CampaignSubmission" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignSubmission_referrerId_submissionDate_key"
    ON "CampaignSubmission"("referrerId", "submissionDate");
ALTER TABLE "CampaignSubmission" ADD CONSTRAINT "CampaignSubmission_referrerId_fkey"
    FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "CampaignTransaction" (
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
ALTER TABLE "CampaignTransaction" ADD CONSTRAINT "CampaignTransaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "CampaignWithdrawal" (
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
ALTER TABLE "CampaignWithdrawal" ADD CONSTRAINT "CampaignWithdrawal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 18-feedback.sql ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Feedback" (
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
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_reviewedBy_fkey"
    FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 23-notification.sql ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Notification" (
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
CREATE INDEX IF NOT EXISTS "Notification_userId_idx"    ON "Notification"("userId");
CREATE INDEX IF NOT EXISTS "Notification_isRead_idx"    ON "Notification"("isRead");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 24-post.sql ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Post" (
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
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_repostOfId_fkey"
    FOREIGN KEY ("repostOfId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "PostReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReactionType" NOT NULL DEFAULT 'LIKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PostReaction_postId_userId_key"
    ON "PostReaction"("postId", "userId");
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "PostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PostComment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "PostComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 26-referral.sql ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Referral" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_referredId_key" ON "Referral"("referredId");
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey"
    FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredId_fkey"
    FOREIGN KEY ("referredId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 30-subscription.sql ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Subscription" (
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
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "PromoCode" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "PromoCode_code_key" ON "PromoCode"("code");
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "PromoCodeUsage" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "PromoCodeUsage_userId_promoCodeId_key"
    ON "PromoCodeUsage"("userId", "promoCodeId");
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_promoCodeId_fkey"
    FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "FeaturedListing" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "FeaturedListing_reference_key" ON "FeaturedListing"("reference");
ALTER TABLE "FeaturedListing" ADD CONSTRAINT "FeaturedListing_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeaturedListing" ADD CONSTRAINT "FeaturedListing_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 31-survey.sql ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "survey_responses" (
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
CREATE INDEX IF NOT EXISTS "survey_responses_email_idx"      ON "survey_responses"("email");
CREATE INDEX IF NOT EXISTS "survey_responses_created_at_idx" ON "survey_responses"("created_at");
CREATE INDEX IF NOT EXISTS "survey_responses_status_idx"     ON "survey_responses"("status");

-- ─── 34-waitlist.sql ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "waitlist_entries" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_entries_email_key"         ON "waitlist_entries"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_entries_referral_code_key" ON "waitlist_entries"("referral_code");
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_entries_token_key"         ON "waitlist_entries"("token");
CREATE INDEX IF NOT EXISTS "waitlist_entries_email_idx"       ON "waitlist_entries"("email");
CREATE INDEX IF NOT EXISTS "waitlist_entries_status_idx"      ON "waitlist_entries"("status");
CREATE INDEX IF NOT EXISTS "waitlist_entries_country_idx"     ON "waitlist_entries"("country");
CREATE INDEX IF NOT EXISTS "waitlist_entries_device_type_idx" ON "waitlist_entries"("device_type");
CREATE INDEX IF NOT EXISTS "waitlist_entries_created_at_idx"  ON "waitlist_entries"("created_at");

CREATE TABLE IF NOT EXISTS "waitlist_campaigns" (
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
CREATE INDEX IF NOT EXISTS "waitlist_campaigns_status_idx"  ON "waitlist_campaigns"("status");
CREATE INDEX IF NOT EXISTS "waitlist_campaigns_sent_at_idx" ON "waitlist_campaigns"("sent_at");

CREATE TABLE IF NOT EXISTS "waitlist_email_logs" (
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
CREATE INDEX IF NOT EXISTS "waitlist_email_logs_waitlist_id_idx" ON "waitlist_email_logs"("waitlist_id");
CREATE INDEX IF NOT EXISTS "waitlist_email_logs_campaign_id_idx" ON "waitlist_email_logs"("campaign_id");
CREATE INDEX IF NOT EXISTS "waitlist_email_logs_type_idx"        ON "waitlist_email_logs"("type");
CREATE INDEX IF NOT EXISTS "waitlist_email_logs_sent_at_idx"     ON "waitlist_email_logs"("sent_at");


-- ════════════════════════════════════════════════════════════
-- STEP 4: Deferred foreign keys
-- ════════════════════════════════════════════════════════════

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

-- Booking → JobPost  (NEW — added in the booking pass)
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_jobPostId_fkey";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_jobPostId_fkey"
    FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Refund → Dispute  (NEW — added in the refund pass)
ALTER TABLE "Refund" DROP CONSTRAINT IF EXISTS "Refund_disputeId_fkey";
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_disputeId_fkey"
    FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- WorkerDebt → Refund  (NEW — added in this pass)
ALTER TABLE "WorkerDebt" DROP CONSTRAINT IF EXISTS "WorkerDebt_refundId_fkey";
ALTER TABLE "WorkerDebt" ADD CONSTRAINT "WorkerDebt_refundId_fkey"
    FOREIGN KEY ("refundId") REFERENCES "Refund"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════
-- END OF SCHEMA
-- ════════════════════════════════════════════════════════════