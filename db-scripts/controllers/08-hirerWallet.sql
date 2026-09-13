-- ============================================================
-- Controller: hirerWallet
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: HirerWallet
CREATE TABLE IF NOT EXISTS "HirerWallet" (
    "id" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeposited" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWithdrawn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTransactionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirerWallet_pkey" PRIMARY KEY ("id")
);


-- Indexes: HirerWallet
CREATE UNIQUE INDEX IF NOT EXISTS "HirerWallet_hirerId_currency_key" ON "HirerWallet"("hirerId", "currency");
CREATE INDEX IF NOT EXISTS "HirerWallet_hirerId_idx" ON "HirerWallet"("hirerId");
CREATE INDEX IF NOT EXISTS "HirerWallet_currency_idx" ON "HirerWallet"("currency");
CREATE INDEX IF NOT EXISTS "HirerWallet_createdAt_idx" ON "HirerWallet"("createdAt");

-- Foreign keys: HirerWallet
ALTER TABLE "HirerWallet" ADD CONSTRAINT "HirerWallet_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: HirerTransaction
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


-- Indexes: HirerTransaction
CREATE UNIQUE INDEX IF NOT EXISTS "HirerTransaction_reference_key" ON "HirerTransaction"("reference");
CREATE INDEX IF NOT EXISTS "HirerTransaction_walletId_idx" ON "HirerTransaction"("walletId");
CREATE INDEX IF NOT EXISTS "HirerTransaction_hirerId_idx" ON "HirerTransaction"("hirerId");
CREATE INDEX IF NOT EXISTS "HirerTransaction_reference_idx" ON "HirerTransaction"("reference");
CREATE INDEX IF NOT EXISTS "HirerTransaction_status_idx" ON "HirerTransaction"("status");
CREATE INDEX IF NOT EXISTS "HirerTransaction_type_idx" ON "HirerTransaction"("type");
CREATE INDEX IF NOT EXISTS "HirerTransaction_createdAt_idx" ON "HirerTransaction"("createdAt");

-- Foreign keys: HirerTransaction
ALTER TABLE "HirerTransaction" ADD CONSTRAINT "HirerTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "HirerWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HirerTransaction" ADD CONSTRAINT "HirerTransaction_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HirerTransaction" ADD CONSTRAINT "HirerTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: HirerWithdrawal
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


-- Indexes: HirerWithdrawal
CREATE UNIQUE INDEX IF NOT EXISTS "HirerWithdrawal_reference_key" ON "HirerWithdrawal"("reference");
CREATE INDEX IF NOT EXISTS "HirerWithdrawal_walletId_idx" ON "HirerWithdrawal"("walletId");
CREATE INDEX IF NOT EXISTS "HirerWithdrawal_hirerId_idx" ON "HirerWithdrawal"("hirerId");
CREATE INDEX IF NOT EXISTS "HirerWithdrawal_reference_idx" ON "HirerWithdrawal"("reference");
CREATE INDEX IF NOT EXISTS "HirerWithdrawal_status_idx" ON "HirerWithdrawal"("status");
CREATE INDEX IF NOT EXISTS "HirerWithdrawal_createdAt_idx" ON "HirerWithdrawal"("createdAt");

-- Foreign keys: HirerWithdrawal
ALTER TABLE "HirerWithdrawal" ADD CONSTRAINT "HirerWithdrawal_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "HirerWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HirerWithdrawal" ADD CONSTRAINT "HirerWithdrawal_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: HirerFundingAttempt
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


-- Indexes: HirerFundingAttempt
CREATE UNIQUE INDEX IF NOT EXISTS "HirerFundingAttempt_providerRef_key" ON "HirerFundingAttempt"("providerRef");
CREATE INDEX IF NOT EXISTS "HirerFundingAttempt_walletId_idx" ON "HirerFundingAttempt"("walletId");
CREATE INDEX IF NOT EXISTS "HirerFundingAttempt_hirerId_idx" ON "HirerFundingAttempt"("hirerId");
CREATE INDEX IF NOT EXISTS "HirerFundingAttempt_providerRef_idx" ON "HirerFundingAttempt"("providerRef");
CREATE INDEX IF NOT EXISTS "HirerFundingAttempt_status_idx" ON "HirerFundingAttempt"("status");
CREATE INDEX IF NOT EXISTS "HirerFundingAttempt_createdAt_idx" ON "HirerFundingAttempt"("createdAt");

-- Foreign keys: HirerFundingAttempt
ALTER TABLE "HirerFundingAttempt" ADD CONSTRAINT "HirerFundingAttempt_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "HirerWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HirerFundingAttempt" ADD CONSTRAINT "HirerFundingAttempt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "HirerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HirerFundingAttempt" ADD CONSTRAINT "HirerFundingAttempt_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: WalletTransaction
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


-- Foreign keys: WalletTransaction
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: Withdrawal
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


-- Indexes: Withdrawal
CREATE UNIQUE INDEX IF NOT EXISTS "Withdrawal_reference_key" ON "Withdrawal"("reference");

-- Foreign keys: Withdrawal
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

