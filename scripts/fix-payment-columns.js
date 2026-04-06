import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  console.log("✅ Connected to Railway");

  const columns = [
    [`"Payment"`, `"bankName"`, `TEXT`],
    [`"Payment"`, `"accountName"`, `TEXT`],
    [`"Payment"`, `"accountNumber"`, `TEXT`],
    [`"Payment"`, `"bankTransferRef"`, `TEXT`],
    [`"Payment"`, `"bankTransferProof"`, `TEXT`],
    [`"Payment"`, `"cryptoNetwork"`, `TEXT`],
    [`"Payment"`, `"cryptoTxHash"`, `TEXT`],
    [`"Payment"`, `"cryptoWallet"`, `TEXT`],
    [`"Payment"`, `"cryptoAmount"`, `DOUBLE PRECISION`],
    [`"Payment"`, `"cryptoCurrency"`, `TEXT`],
    [`"Payment"`, `"workerCurrency"`, `TEXT`],
    [`"Payment"`, `"workerPayoutLocal"`, `DOUBLE PRECISION`],
    [`"Payment"`, `"exchangeRate"`, `DOUBLE PRECISION`],
    [`"Booking"`, `"checkInLat"`, `DOUBLE PRECISION`],
    [`"Booking"`, `"checkInLng"`, `DOUBLE PRECISION`],
    [`"Booking"`, `"checkOutLat"`, `DOUBLE PRECISION`],
    [`"Booking"`, `"checkOutLng"`, `DOUBLE PRECISION`],
    [`"Booking"`, `"emergencyContact"`, `TEXT`],
    [`"Booking"`, `"sosActivatedAt"`, `TIMESTAMPTZ`],
    [`"Booking"`, `"sosLatitude"`, `DOUBLE PRECISION`],
    [`"Booking"`, `"sosLongitude"`, `DOUBLE PRECISION`],
    [`"Booking"`, `"sosResolvedAt"`, `TIMESTAMPTZ`],
    [`"User"`, `"language"`, `TEXT DEFAULT 'en'`],
  ];

  try {
    await client.query("BEGIN");
    for (const [table, col, type] of columns) {
      await client.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`,
      );
      console.log(`  ✓ ${table}.${col}`);
    }
    await client.query("COMMIT");
    console.log("\n🎉 All columns added successfully");
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
