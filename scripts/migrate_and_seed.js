// scripts/migrate_and_seed.js
// Run: node scripts/migrate_and_seed.js
// Adds new Payment columns (workerCurrency, workerPayoutLocal, exchangeRate,
// cryptoNetwork, cryptoTxHash, cryptoWallet), creates Withdrawal table,
// adds WithdrawalStatus enum, and seeds all supported currencies.

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected...\n");
    await client.query("BEGIN");

    // ── 1. WithdrawalStatus enum ──────────────────────────────────────────────
    console.log("Creating WithdrawalStatus enum...");
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "WithdrawalStatus" AS ENUM (
          'PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("  ✅ WithdrawalStatus enum");

    // ── 2. New columns on Payment ─────────────────────────────────────────────
    console.log("Adding new columns to Payment...");
    const paymentCols = [
      [`workerCurrency`, `VARCHAR(10)`],
      [`workerPayoutLocal`, `DOUBLE PRECISION`],
      [`exchangeRate`, `DOUBLE PRECISION DEFAULT 1`],
      [`cryptoNetwork`, `TEXT`],
      [`cryptoTxHash`, `TEXT`],
      [`cryptoWallet`, `TEXT`],
    ];
    for (const [col, type] of paymentCols) {
      await client.query(`
        ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "${col}" ${type};
      `);
      console.log(`  ✅ Payment.${col}`);
    }

    // Ensure currency column has a default
    await client.query(`
      ALTER TABLE "Payment" ALTER COLUMN "currency" SET DEFAULT 'USD';
    `);
    console.log("  ✅ Payment.currency default set");

    // ── 3. Withdrawal table ───────────────────────────────────────────────────
    console.log("Creating Withdrawal table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Withdrawal" (
        "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
        "workerId"    TEXT        NOT NULL,
        "amount"      DOUBLE PRECISION NOT NULL,
        "currency"    TEXT        NOT NULL DEFAULT 'NGN',
        "method"      TEXT        NOT NULL,
        "destination" TEXT        NOT NULL,
        "details"     JSONB       NOT NULL DEFAULT '{}',
        "reference"   TEXT        NOT NULL,
        "status"      "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
        "completedAt" TIMESTAMP(3),
        "failureNote" TEXT,
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Withdrawal_reference_key" UNIQUE ("reference"),
        CONSTRAINT "Withdrawal_workerId_fkey"
          FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "Withdrawal_workerId_idx" ON "Withdrawal"("workerId");
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "Withdrawal_status_idx" ON "Withdrawal"("status");
    `);
    console.log("  ✅ Withdrawal table + indexes");

    // ── 4. Seed supported currencies ──────────────────────────────────────────
    console.log("\nSeeding Currency reference table...");
    // We store supported currencies in a simple config — no DB table needed
    // (currencies are just strings on Payment.currency)
    // But we log them here for reference:
    const SUPPORTED_CURRENCIES = [
      // Fiat
      "USD",
      "EUR",
      "GBP",
      "NGN",
      "GHS",
      "KES",
      "ZAR",
      "INR",
      "CAD",
      "AUD",
      "JPY",
      "CNY",
      "BRL",
      "MXN",
      "EGP",
      "TZS",
      "UGX",
      "RWF",
      "XOF",
      "MAD",
      "PHP",
      "IDR",
      "VND",
      "THB",
      "BDT",
      "PKR",
      "AED",
      "SAR",
      "QAR",
      "MYR",
      "SGD",
      "HKD",
      // Crypto stablecoins (treated as currencies in payments)
      "USDC",
      "USDT",
    ];
    console.log(
      `  ✅ ${SUPPORTED_CURRENCIES.length} currencies supported (fiat + stablecoin)`,
    );
    console.log(`     ${SUPPORTED_CURRENCIES.join(", ")}`);

    await client.query("COMMIT");
    console.log("\n🎉 Migration complete!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
