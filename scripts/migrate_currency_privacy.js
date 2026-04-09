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
  // Currency separation
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dashboardCurrency"  TEXT DEFAULT 'USD'`,
    "User.dashboardCurrency",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "paymentCurrency"    TEXT DEFAULT 'USD'`,
    "User.paymentCurrency",
  ],

  // Privacy additions
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showEmail"          BOOLEAN DEFAULT FALSE`,
    "User.showEmail",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showGender"         BOOLEAN DEFAULT FALSE`,
    "User.showGender",
  ],

  // Hirer hiring prefs (stored on User)
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultEstUnit"     TEXT DEFAULT 'hours'`,
    "User.defaultEstUnit",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultEstValue"    TEXT`,
    "User.defaultEstValue",
  ],

  // Worker profile currency is already profileCurrency via currency field
  // but we add an explicit profileCurrency alias for clarity
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "profileCurrency" TEXT DEFAULT 'USD'`,
    "WorkerProfile.profileCurrency",
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
    console.log("\n🎉 Currency & privacy migration complete");
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
