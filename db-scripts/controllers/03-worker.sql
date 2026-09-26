-- ============================================================
-- Controller: worker
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: WorkerProfile
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
CREATE UNIQUE INDEX IF NOT EXISTS "WorkerProfile_userId_key" ON "WorkerProfile"("userId");

-- Foreign keys: WorkerProfile
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_backgroundCheckedById_fkey"
    FOREIGN KEY ("backgroundCheckedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: Portfolio
CREATE TABLE IF NOT EXISTS "Portfolio" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Portfolio
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_workerProfileId_fkey"
    FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: Certification
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

    -- ── Verification metadata (added: written by verification.controller.js, read everywhere) ──
    "verifiedAt"      TIMESTAMP(3),
    "verifiedById"    TEXT,
    "rejectionReason" TEXT,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Certification
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_workerProfileId_fkey"
    FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Certification" ADD CONSTRAINT "Certification_verifiedById_fkey"
    FOREIGN KEY ("verifiedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: Availability
CREATE TABLE IF NOT EXISTS "Availability" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Availability
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_workerProfileId_fkey"
    FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: WorkerCategory
CREATE TABLE IF NOT EXISTS "WorkerCategory" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkerCategory_pkey" PRIMARY KEY ("id")
);


-- Indexes: WorkerCategory
CREATE UNIQUE INDEX IF NOT EXISTS "WorkerCategory_workerProfileId_categoryId_key"
    ON "WorkerCategory"("workerProfileId", "categoryId");

-- Foreign keys: WorkerCategory
ALTER TABLE "WorkerCategory" ADD CONSTRAINT "WorkerCategory_workerProfileId_fkey"
    FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkerCategory" ADD CONSTRAINT "WorkerCategory_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;