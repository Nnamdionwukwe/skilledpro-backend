import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    "postgresql://postgres:fEWRzooUrCKKwRPHStLWAoJFCMtfRhyF@centerbeam.proxy.rlwy.net:17141/railway",
  ssl: false,
});
async function run() {
  const client = await pool.connect();
  console.log("✅ Connected");

  const cols = [
    // Booking SOS / emergency
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "emergencyContact"  TEXT`,
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "sosActivatedAt"    TIMESTAMPTZ`,
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "sosLatitude"       DOUBLE PRECISION`,
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "sosLongitude"      DOUBLE PRECISION`,
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "sosResolvedAt"     TIMESTAMPTZ`,
    // Payment bank transfer
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "bankName"          TEXT`,
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "accountName"       TEXT`,
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "accountNumber"     TEXT`,
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "bankTransferRef"   TEXT`,
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "bankTransferProof" TEXT`,
    // Payment crypto
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoNetwork"     TEXT`,
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoTxHash"      TEXT`,
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoWallet"      TEXT`,
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoAmount"      DOUBLE PRECISION`,
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoCurrency"    TEXT`,
  ];

  try {
    await client.query("BEGIN");
    for (const sql of cols) {
      await client.query(sql);
      console.log(`  ✓ ${sql.split('"')[3]}`);
    }
    await client.query("COMMIT");
    console.log("\n🎉 Migration complete");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
