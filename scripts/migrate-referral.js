// scripts/migrate-referral.js
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

    // ── Enums ────────────────────────────────────────────────────────────────
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "ReferralTier" AS ENUM ('BRONZE','SILVER','GOLD','DIAMOND');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    console.log("  ✅ ReferralTier enum");

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "ReferralStatus" AS ENUM ('PENDING','QUALIFIED','CONVERTED','REWARDED','EXPIRED','FLAGGED');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    console.log("  ✅ ReferralStatus enum");

    // ── New User columns ─────────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "referralCode"        TEXT UNIQUE,
        ADD COLUMN IF NOT EXISTS "referredById"        TEXT,
        ADD COLUMN IF NOT EXISTS "walletBalance"       DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "walletLifetimeTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "referralTier"        "ReferralTier"   NOT NULL DEFAULT 'BRONZE',
        ADD COLUMN IF NOT EXISTS "totalReferrals"      INTEGER          NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "successfulReferrals" INTEGER          NOT NULL DEFAULT 0;
    `);
    console.log("  ✅ User referral columns");

    // FK from User.referredById → User.id (safe — no data to violate yet)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "User"
          ADD CONSTRAINT "User_referredById_fkey"
          FOREIGN KEY ("referredById") REFERENCES "User"(id)
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    console.log("  ✅ User.referredById foreign key");

    // ── Referral table ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Referral" (
        id              TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "referrerId"    TEXT          NOT NULL,
        "referredId"    TEXT          NOT NULL UNIQUE,
        code            TEXT          NOT NULL,
        status          "ReferralStatus" NOT NULL DEFAULT 'PENDING',
        "referredRole"  "Role"        NOT NULL,
        "referrerBonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "refereePerk"   TEXT          NOT NULL DEFAULT '{}',
        currency        TEXT          NOT NULL DEFAULT 'NGN',
        "paidAt"        TIMESTAMPTZ,
        "qualifiedAt"   TIMESTAMPTZ,
        "convertedAt"   TIMESTAMPTZ,
        "expiresAt"     TIMESTAMPTZ   NOT NULL,
        "createdAt"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "Referral_referrerId_fkey"
          FOREIGN KEY ("referrerId") REFERENCES "User"(id) ON DELETE CASCADE,
        CONSTRAINT "Referral_referredId_fkey"
          FOREIGN KEY ("referredId") REFERENCES "User"(id) ON DELETE CASCADE
      );
    `);
    console.log("  ✅ Referral table");

    await client.query(`
      CREATE INDEX IF NOT EXISTS "Referral_referrerId_idx" ON "Referral"("referrerId");
      CREATE INDEX IF NOT EXISTS "Referral_status_idx"     ON "Referral"(status);
    `);
    console.log("  ✅ Referral indexes");

    // ── WalletTransaction table ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "WalletTransaction" (
        id            TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"      TEXT          NOT NULL,
        type          TEXT          NOT NULL,
        amount        DOUBLE PRECISION NOT NULL,
        currency      TEXT          NOT NULL DEFAULT 'NGN',
        description   TEXT          NOT NULL,
        "referralId"  TEXT,
        meta          JSONB,
        "createdAt"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "WalletTransaction_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
      );
    `);
    console.log("  ✅ WalletTransaction table");

    await client.query(`
      CREATE INDEX IF NOT EXISTS "WalletTransaction_userId_idx" ON "WalletTransaction"("userId");
      CREATE INDEX IF NOT EXISTS "WalletTransaction_type_idx"   ON "WalletTransaction"(type);
    `);
    console.log("  ✅ WalletTransaction indexes");

    // ── FeaturedListing additions ────────────────────────────────────────────
    await client.query(`
      ALTER TABLE "FeaturedListing"
        ADD COLUMN IF NOT EXISTS "isPaid"  BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS "source"  TEXT;
    `);
    console.log("  ✅ FeaturedListing.isPaid + source");

    await client.query("COMMIT");
    console.log("\n🎉 Migration complete!");

    // ── Verify ───────────────────────────────────────────────────────────────
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('Referral','WalletTransaction')
      ORDER BY table_name;
    `);
    console.log("\n📋 New tables confirmed:");
    rows.forEach((r) => console.log(`   ✅ ${r.table_name}`));

    const { rows: cols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'User'
        AND column_name IN ('referralCode','walletBalance','referralTier')
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
