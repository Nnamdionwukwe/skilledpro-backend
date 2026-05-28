// scripts/migrate-campaign.js
// Adds all tables for the Daily Referral Campaign program.
// Run: node scripts/migrate-campaign.js

import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected to Railway database...\n");
    await client.query("BEGIN");

    // ── Enums ─────────────────────────────────────────────────────────────────
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "CampaignReferralStatus" AS ENUM
          ('PENDING','TASKS_DONE','SUBMITTED','APPROVED','REJECTED');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    console.log("  ✅ CampaignReferralStatus enum");

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "CampaignSubmissionStatus" AS ENUM
          ('PENDING','REVIEWING','APPROVED','PARTIAL','REJECTED');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    console.log("  ✅ CampaignSubmissionStatus enum");

    // ── New User columns ──────────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "campaignWalletBalance"       DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "campaignWalletLifetimeTotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
    `);
    console.log("  ✅ User campaign wallet columns");

    // ── CampaignReferral ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "CampaignReferral" (
        id                  TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "referrerId"        TEXT    NOT NULL,
        "referredId"        TEXT    NOT NULL UNIQUE,
        code                TEXT    NOT NULL,

        -- Task flags (set to true as each task is completed)
        "hasDownloadedApp"  BOOLEAN NOT NULL DEFAULT true,    -- auto-true on signup
        "hasSetupProfile"   BOOLEAN NOT NULL DEFAULT false,
        "hasFollowedFb"     BOOLEAN NOT NULL DEFAULT false,
        "hasFollowedIg"     BOOLEAN NOT NULL DEFAULT false,
        "hasFollowedTt"     BOOLEAN NOT NULL DEFAULT false,

        -- Optional proof screenshots uploaded by referred user
        "fbScreenshotUrl"   TEXT,
        "igScreenshotUrl"   TEXT,
        "ttScreenshotUrl"   TEXT,

        -- Submission link
        "submissionId"      TEXT,

        status              "CampaignReferralStatus" NOT NULL DEFAULT 'PENDING',
        "adminNote"         TEXT,
        "rewardAmount"      DOUBLE PRECISION NOT NULL DEFAULT 100,
        currency            TEXT NOT NULL DEFAULT 'NGN',

        "tasksCompletedAt"  TIMESTAMPTZ,
        "submittedAt"       TIMESTAMPTZ,
        "reviewedAt"        TIMESTAMPTZ,
        "reviewedById"      TEXT,

        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT "CampaignReferral_referrerId_fkey"
          FOREIGN KEY ("referrerId") REFERENCES "User"(id) ON DELETE CASCADE,
        CONSTRAINT "CampaignReferral_referredId_fkey"
          FOREIGN KEY ("referredId") REFERENCES "User"(id) ON DELETE CASCADE
      );
    `);
    console.log("  ✅ CampaignReferral table");

    await client.query(`
      CREATE INDEX IF NOT EXISTS "CampaignReferral_referrerId_idx"  ON "CampaignReferral"("referrerId");
      CREATE INDEX IF NOT EXISTS "CampaignReferral_status_idx"       ON "CampaignReferral"(status);
      CREATE INDEX IF NOT EXISTS "CampaignReferral_submissionId_idx" ON "CampaignReferral"("submissionId");
    `);
    console.log("  ✅ CampaignReferral indexes");

    // ── CampaignSubmission ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "CampaignSubmission" (
        id               TEXT   PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "referrerId"     TEXT   NOT NULL,
        "submissionDate" TEXT   NOT NULL,   -- "YYYY-MM-DD"

        "totalSubmitted" INTEGER          NOT NULL DEFAULT 0,
        "totalApproved"  INTEGER          NOT NULL DEFAULT 0,
        "totalRejected"  INTEGER          NOT NULL DEFAULT 0,
        "grossAmount"    DOUBLE PRECISION NOT NULL DEFAULT 0,  -- submitted × ₦100
        "netAmount"      DOUBLE PRECISION NOT NULL DEFAULT 0,  -- approved × ₦100

        status           "CampaignSubmissionStatus" NOT NULL DEFAULT 'PENDING',
        "adminNote"      TEXT,
        "reviewedAt"     TIMESTAMPTZ,
        "reviewedById"   TEXT,
        "creditedAt"     TIMESTAMPTZ,

        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT "CampaignSubmission_referrerId_fkey"
          FOREIGN KEY ("referrerId") REFERENCES "User"(id) ON DELETE CASCADE,
        CONSTRAINT "CampaignSubmission_referrerId_date_unique"
          UNIQUE ("referrerId", "submissionDate")
      );
    `);
    console.log("  ✅ CampaignSubmission table");

    await client.query(`
      CREATE INDEX IF NOT EXISTS "CampaignSubmission_referrerId_idx" ON "CampaignSubmission"("referrerId");
      CREATE INDEX IF NOT EXISTS "CampaignSubmission_status_idx"     ON "CampaignSubmission"(status);
      CREATE INDEX IF NOT EXISTS "CampaignSubmission_date_idx"       ON "CampaignSubmission"("submissionDate");
    `);
    console.log("  ✅ CampaignSubmission indexes");

    // ── FK: CampaignReferral.submissionId → CampaignSubmission.id ─────────────
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "CampaignReferral"
          ADD CONSTRAINT "CampaignReferral_submissionId_fkey"
          FOREIGN KEY ("submissionId") REFERENCES "CampaignSubmission"(id)
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    console.log("  ✅ CampaignReferral → CampaignSubmission FK");

    // ── CampaignTransaction ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "CampaignTransaction" (
        id             TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"       TEXT    NOT NULL,
        type           TEXT    NOT NULL,  -- "DAILY_BONUS" | "WITHDRAWAL" | "ADJUSTMENT"
        amount         DOUBLE PRECISION NOT NULL,
        currency       TEXT    NOT NULL DEFAULT 'NGN',
        description    TEXT    NOT NULL,
        "referralId"   TEXT,
        "submissionId" TEXT,
        meta           JSONB,
        "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT "CampaignTransaction_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
      );
    `);
    console.log("  ✅ CampaignTransaction table");

    await client.query(`
      CREATE INDEX IF NOT EXISTS "CampaignTransaction_userId_idx" ON "CampaignTransaction"("userId");
      CREATE INDEX IF NOT EXISTS "CampaignTransaction_type_idx"   ON "CampaignTransaction"(type);
    `);
    console.log("  ✅ CampaignTransaction indexes");

    // ── CampaignWithdrawal ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "CampaignWithdrawal" (
        id              TEXT   PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"        TEXT   NOT NULL,
        amount          DOUBLE PRECISION NOT NULL,
        currency        TEXT   NOT NULL DEFAULT 'NGN',
        "bankName"      TEXT   NOT NULL,
        "accountNumber" TEXT   NOT NULL,
        "accountName"   TEXT   NOT NULL,
        status          TEXT   NOT NULL DEFAULT 'PENDING',
        "adminNote"     TEXT,
        "processedAt"   TIMESTAMPTZ,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT "CampaignWithdrawal_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
      );
    `);
    console.log("  ✅ CampaignWithdrawal table");

    await client.query(`
      CREATE INDEX IF NOT EXISTS "CampaignWithdrawal_userId_idx" ON "CampaignWithdrawal"("userId");
      CREATE INDEX IF NOT EXISTS "CampaignWithdrawal_status_idx" ON "CampaignWithdrawal"(status);
    `);
    console.log("  ✅ CampaignWithdrawal indexes");

    await client.query("COMMIT");
    console.log("\n🎉 Campaign migration complete!");

    // ── Verify ────────────────────────────────────────────────────────────────
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN
        ('CampaignReferral','CampaignSubmission','CampaignTransaction','CampaignWithdrawal')
      ORDER BY table_name;
    `);
    console.log("\n📋 New tables confirmed:");
    rows.forEach((r) => console.log(`   ✅ ${r.table_name}`));

    const { rows: cols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'User'
        AND column_name IN ('campaignWalletBalance','campaignWalletLifetimeTotal')
      ORDER BY column_name;
    `);
    console.log("\n📋 New User columns confirmed:");
    cols.forEach((r) => console.log(`   ✅ ${r.column_name}`));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log("\n🔌 Connection closed.");
  }
}

migrate();
