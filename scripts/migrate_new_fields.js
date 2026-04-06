import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:fEWRzooUrCKKwRPHStLWAoJFCMtfRhyF@centerbeam.proxy.rlwy.net:17141/railway",
  ssl: false,
});

const migrations = [
  // ── Booking: SOS + Emergency Contact ──
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "emergencyContact"  TEXT`,
    "Booking.emergencyContact",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "sosActivatedAt"    TIMESTAMPTZ`,
    "Booking.sosActivatedAt",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "sosLatitude"       DOUBLE PRECISION`,
    "Booking.sosLatitude",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "sosLongitude"      DOUBLE PRECISION`,
    "Booking.sosLongitude",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "sosResolvedAt"     TIMESTAMPTZ`,
    "Booking.sosResolvedAt",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "checkInLat"        DOUBLE PRECISION`,
    "Booking.checkInLat",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "checkInLng"        DOUBLE PRECISION`,
    "Booking.checkInLng",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "checkOutLat"       DOUBLE PRECISION`,
    "Booking.checkOutLat",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "checkOutLng"       DOUBLE PRECISION`,
    "Booking.checkOutLng",
  ],

  // ── Payment: Bank Transfer ──
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "bankName"          TEXT`,
    "Payment.bankName",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "accountName"       TEXT`,
    "Payment.accountName",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "accountNumber"     TEXT`,
    "Payment.accountNumber",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "bankTransferRef"   TEXT`,
    "Payment.bankTransferRef",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "bankTransferProof" TEXT`,
    "Payment.bankTransferProof",
  ],

  // ── Payment: Crypto ──
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoNetwork"     TEXT`,
    "Payment.cryptoNetwork",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoTxHash"      TEXT`,
    "Payment.cryptoTxHash",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoWallet"      TEXT`,
    "Payment.cryptoWallet",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoAmount"      DOUBLE PRECISION`,
    "Payment.cryptoAmount",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoCurrency"    TEXT`,
    "Payment.cryptoCurrency",
  ],

  // ── WorkerProfile: videoIntroUrl ──
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "videoIntroUrl" TEXT`,
    "WorkerProfile.videoIntroUrl",
  ],
];

async function run() {
  const client = await pool.connect();
  console.log("✅ Connected to Railway PostgreSQL\n");

  let success = 0;
  let skipped = 0;

  try {
    await client.query("BEGIN");

    for (const [sql, label] of migrations) {
      try {
        await client.query(sql);
        console.log(`  ✅ ${label}`);
        success++;
      } catch (err) {
        if (err.code === "42701") {
          console.log(`  ⏭️  ${label} (already exists)`);
          skipped++;
        } else {
          throw err;
        }
      }
    }

    await client.query("COMMIT");
    console.log(
      `\n🎉 Migration complete — ${success} added, ${skipped} skipped`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
