-- ============================================================
-- Controller: campaign
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: CampaignReferral
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


-- Indexes: CampaignReferral
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignReferral_referredId_key" ON "CampaignReferral"("referredId");

-- Foreign keys: CampaignReferral
ALTER TABLE "CampaignReferral" ADD CONSTRAINT "CampaignReferral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignReferral" ADD CONSTRAINT "CampaignReferral_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: CampaignSubmission
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


-- Indexes: CampaignSubmission
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignSubmission_referrerId_submissionDate_key" ON "CampaignSubmission"("referrerId", "submissionDate");

-- Foreign keys: CampaignSubmission
ALTER TABLE "CampaignSubmission" ADD CONSTRAINT "CampaignSubmission_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: CampaignTransaction
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


-- Foreign keys: CampaignTransaction
ALTER TABLE "CampaignTransaction" ADD CONSTRAINT "CampaignTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: CampaignWithdrawal
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


-- Foreign keys: CampaignWithdrawal
ALTER TABLE "CampaignWithdrawal" ADD CONSTRAINT "CampaignWithdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

