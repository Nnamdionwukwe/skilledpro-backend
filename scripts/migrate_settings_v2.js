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
  // User settings fields
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "theme"            TEXT    DEFAULT 'system'`,
    "User.theme",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "gender"           TEXT`,
    "User.gender",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifBookings"    BOOLEAN DEFAULT TRUE`,
    "User.notifBookings",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifMessages"    BOOLEAN DEFAULT TRUE`,
    "User.notifMessages",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifPayments"    BOOLEAN DEFAULT TRUE`,
    "User.notifPayments",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifReviews"     BOOLEAN DEFAULT TRUE`,
    "User.notifReviews",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifMarketing"   BOOLEAN DEFAULT FALSE`,
    "User.notifMarketing",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileVisible"   BOOLEAN DEFAULT TRUE`,
    "User.profileVisible",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showPhone"        BOOLEAN DEFAULT FALSE`,
    "User.showPhone",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showLocation"     BOOLEAN DEFAULT TRUE`,
    "User.showLocation",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN DEFAULT FALSE`,
    "User.twoFactorEnabled",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "state"            TEXT`,
    "User.state",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "address"          TEXT`,
    "User.address",
  ],

  // Worker pricing schedule
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "dailyRate"    DOUBLE PRECISION`,
    "WorkerProfile.dailyRate",
  ],
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "weeklyRate"   DOUBLE PRECISION`,
    "WorkerProfile.weeklyRate",
  ],
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "monthlyRate"  DOUBLE PRECISION`,
    "WorkerProfile.monthlyRate",
  ],
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "customRate"   DOUBLE PRECISION`,
    "WorkerProfile.customRate",
  ],
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "customRateLabel" TEXT`,
    "WorkerProfile.customRateLabel",
  ],
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "pricingNote"  TEXT`,
    "WorkerProfile.pricingNote",
  ],

  // Booking estimated duration type
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "estimatedUnit"  TEXT DEFAULT 'hours'`,
    "Booking.estimatedUnit",
  ],
];

async function run() {
  const client = await pool.connect();
  console.log("✅ Connected\n");
  let ok = 0;
  try {
    await client.query("BEGIN");
    for (const [sql, label] of migrations) {
      await client.query(sql);
      console.log(`  ✅ ${label}`);
      ok++;
    }
    await client.query("COMMIT");
    console.log(`\n🎉 Done — ${ok} columns added`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
