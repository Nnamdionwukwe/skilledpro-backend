// scripts/migrate_jobpost_duration.js
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:fEWRzooUrCKKwRPHStLWAoJFCMtfRhyF@centerbeam.proxy.rlwy.net:17141/railway",
  ssl: false,
});

async function run() {
  const client = await pool.connect();
  console.log("✅ Connected\n");

  const queries = [
    `ALTER TABLE "JobPost" ADD COLUMN IF NOT EXISTS "estimatedUnit"  TEXT DEFAULT 'hours'`,
    `ALTER TABLE "JobPost" ADD COLUMN IF NOT EXISTS "estimatedValue" TEXT`,
  ];

  for (const q of queries) {
    try {
      await client.query(q);
      console.log("✅", q.slice(0, 70));
    } catch (e) {
      console.log("⚠️  skipped:", e.message.slice(0, 60));
    }
  }

  console.log("\nDone.");
  client.release();
  await pool.end();
}

run().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
