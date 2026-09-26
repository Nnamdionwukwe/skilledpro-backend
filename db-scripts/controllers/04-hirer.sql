-- ============================================================
-- Controller: hirer
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: HirerProfile
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
CREATE UNIQUE INDEX IF NOT EXISTS "HirerProfile_userId_key" ON "HirerProfile"("userId");

-- Foreign keys: HirerProfile
ALTER TABLE "HirerProfile" ADD CONSTRAINT "HirerProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HirerProfile" ADD CONSTRAINT "HirerProfile_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;