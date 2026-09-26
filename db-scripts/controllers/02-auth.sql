-- ============================================================
-- Controller: auth
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: User
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
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key"        ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key"        ON "User"("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key"     ON "User"("googleId");

-- Foreign keys: User
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey"
  FOREIGN KEY ("referredById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;