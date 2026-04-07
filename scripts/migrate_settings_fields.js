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
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "language"         TEXT    DEFAULT 'en'`,
    "User.language",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "theme"            TEXT    DEFAULT 'system'`,
    "User.theme",
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
];

async function run() {
  const client = await pool.connect();
  console.log("✅ Connected\n");
  try {
    await client.query("BEGIN");
    for (const [sql, label] of migrations) {
      await client.query(sql);
      console.log(`  ✅ ${label}`);
    }
    await client.query("COMMIT");
    console.log("\n🎉 Settings migration complete");
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
