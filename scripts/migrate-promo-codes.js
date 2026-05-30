#!/usr/bin/env node
// scripts/migrate-promo-codes.js
// Run: node scripts/migrate-promo-codes.js && npx prisma generate
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function run() {
  const client = await pool.connect();
  console.log("\n── Promo Code Migration ──────────────────────────────");
  try {
    await client.query("BEGIN");

    // ── PromoCode table ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "PromoCode" (
        "id"            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "code"          TEXT        NOT NULL,
        "description"   TEXT,
        "discountType"  TEXT        NOT NULL DEFAULT 'PERCENT'
                          CHECK ("discountType" IN ('PERCENT', 'FIXED')),
        "discountValue" FLOAT       NOT NULL,
        "maxUses"       INTEGER,
        "usedCount"     INTEGER     NOT NULL DEFAULT 0,
        "expiresAt"     TIMESTAMP(3),
        "isActive"      BOOLEAN     NOT NULL DEFAULT true,
        "applicableTo"  TEXT,        -- JSON array of plan IDs, NULL = all plans
        "minPlanAmount" FLOAT       NOT NULL DEFAULT 0,
        "createdById"   TEXT        REFERENCES "User"("id") ON DELETE SET NULL,
        "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("  ✅  PromoCode table");

    // Case-insensitive unique index on code
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "PromoCode_code_key"
        ON "PromoCode" (UPPER("code"));
    `);
    console.log("  ✅  PromoCode_code_key unique index");

    // ── PromoCodeUsage table — one row per user per code ──────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "PromoCodeUsage" (
        "id"           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "promoCodeId"  TEXT        NOT NULL REFERENCES "PromoCode"("id") ON DELETE CASCADE,
        "userId"       TEXT        NOT NULL REFERENCES "User"("id")      ON DELETE CASCADE,
        "planId"       TEXT        NOT NULL,
        "discountAmt"  FLOAT       NOT NULL,
        "originalAmt"  FLOAT       NOT NULL,
        "finalAmt"     FLOAT       NOT NULL,
        "reference"    TEXT,
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("  ✅  PromoCodeUsage table");

    // One use per user per promo code
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "PromoCodeUsage_user_promo_unique"
        ON "PromoCodeUsage" ("userId", "promoCodeId");
    `);
    console.log("  ✅  PromoCodeUsage unique index (1 use per user)");

    await client.query("COMMIT");
    console.log("\n  Migration complete.\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("  ❌ Migration failed — rolled back:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
